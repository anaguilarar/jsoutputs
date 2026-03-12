// --- Global Chart Instances ---
let potentialyieldoniChart = null; // Chart A
let potentialyieldweatherChart = null; // Chart B

function triggerWeatherChartUpdate(cycleNumber) {
    // Check if Chart B exists
    if (typeof potentialyieldweatherChart === 'undefined' || potentialyieldweatherChart === null) {
        console.warn("Weather chart is not initialized yet.");
        return;
    }

    const targetName = "escenario " + cycleNumber;

    
    const currentOption = potentialyieldweatherChart.getOption();
    
    const allSeriesNames = currentOption.series.map(s => s.name);
    const uniqueNames = [...new Set(allSeriesNames)];

    const newSelected = {};
    uniqueNames.forEach(name => {
    
        newSelected[name] = (name === targetName);
    });

    
    potentialyieldweatherChart.dispatchAction({
        type: 'legendSelect',
        name: targetName
    });
    
    
    potentialyieldweatherChart.setOption({
        legend: {
            selected: newSelected
        }
    });
}

function calculateBoxPlotStats(data) {
    if (data.length === 0) return { box: [], outliers: [] };
    
    data.sort((a, b) => a - b);
    
    const quantile = (arr, q) => {
        const sorted = arr;
        const pos = (sorted.length - 1) * q;
        const base = Math.floor(pos);
        const rest = pos - base;
        if (sorted[base + 1] !== undefined) {
            return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
        } else {
            return sorted[base];
        }
    };

    const q1 = quantile(data, 0.25);
    const median = quantile(data, 0.50);
    const q3 = quantile(data, 0.75);
    const iqr = q3 - q1;
    const lowerBound = q1 - 1.5 * iqr;
    const upperBound = q3 + 1.5 * iqr;

    // Separate outliers and data within whiskers
    const outliers = [];
    const cleanData = [];
    data.forEach(d => {
        if (d < lowerBound || d > upperBound) outliers.push([d, 0]); // 0 is Y-index for horizontal plot
        else cleanData.push(d);
    });

    const min = cleanData.length > 0 ? cleanData[0] : q1;
    const max = cleanData.length > 0 ? cleanData[cleanData.length - 1] : q3;

    return {
        box: [min, q1, median, q3, max],
        outliers: outliers
    };
}


// --- Helper Functions ---
function hexToRgb(hex) {
    hex = hex.replace('#', '');
    const bigint = parseInt(hex, 16);
    return { r: (bigint >> 16) & 255, g: (bigint >> 8) & 255, b: bigint & 255 };
}

function lightenColor(hex, factor = 0.3) {
    const { r, g, b } = hexToRgb(hex);
    return `rgb(${Math.min(255, Math.round(r + (255 - r) * factor))}, ${Math.min(255, Math.round(g + (255 - g) * factor))}, ${Math.min(255, Math.round(b + (255 - b) * factor))})`;
}

function darkenColor(hex, factor = 0.3) {
    const { r, g, b } = hexToRgb(hex);
    return `rgb(${Math.round(r * (1 - factor))}, ${Math.round(g * (1 - factor))}, ${Math.round(b * (1 - factor))})`;
}

function buildOniAreas(oni_data) {
    const areasByCycle = {};
    oni_data.forEach(d => {
        const cycle = d.n_cycle?.toString().trim();
        if (!cycle) return;
        if (!areasByCycle[cycle]) areasByCycle[cycle] = {};
        if (!areasByCycle[cycle][d.oni]) areasByCycle[cycle][d.oni] = { start: [], end: [] };
        //const date = new Date(d.date);
        if (d.period === 'start') areasByCycle[cycle][d.oni].start.push(d.date);
        else if (d.period === 'end') areasByCycle[cycle][d.oni].end.push(d.date);
    });
    return areasByCycle;
}

function makeMarkAreas(oniGrouped) {
    const markAreas = [];
    if (!oniGrouped) return markAreas;
    Object.keys(oniGrouped).forEach(eventName => {
        const starts = oniGrouped[eventName].start;
        const ends = oniGrouped[eventName].end;
        for (let i = 0; i < Math.min(starts.length, ends.length); i++) {
            markAreas.push([{ xAxis: starts[i], label: { show: true, formatter: eventName } }, { xAxis: ends[i] }]);
        }
    });
    return markAreas;
}
const detectEnsoBoundaries = (cycleData, cycleNumber) => {
    const boundaries = [];
    const dfLength = cycleData.length;

    if (dfLength === 0) return boundaries;

    // 1. Check if the very first point starts an event
    if (cycleData[0].Phase !== 'Neutral') {
        boundaries.push({
            oni: cycleData[0].Phase,
            date: cycleData[0].day_index,
            period: 'start',
            n_cycle: cycleNumber
        });
    }

    // 2. Loop through to find transitions between phases
    for (let i = 1; i < dfLength; i++) {
        const prev = cycleData[i - 1];
        const current = cycleData[i];
               
        // If the phase has changed
        if (prev.Phase !== current.Phase) {
            
            // End the previous phase (if it wasn't Neutral)
            if (prev.Phase !== 'Neutral') {
                boundaries.push({
                    oni: prev.Phase,
                    date: current.day_index, // Make it meet the start of the next phase exactly
                    period: 'end',
                    n_cycle: cycleNumber
                });
            }
            
            // Start the new phase (if it isn't Neutral)
            if (current.Phase !== 'Neutral') {
                boundaries.push({
                    oni: current.Phase,
                    date: current.day_index,
                    period: 'start',
                    n_cycle: cycleNumber
                });
            }
        }
    }
    
    // 3. Check if the very last point ends an event (to cap it off)
    if (cycleData[dfLength - 1].Phase !== 'Neutral') {
        boundaries.push({
            oni: cycleData[dfLength - 1].Phase,
            date: cycleData[dfLength - 1].day_index,
            period: 'end',
            n_cycle: cycleNumber
        });
    }

    return boundaries;
};



// --- Data Loading ---
async function readcsv(pathdata) {
    const response = await fetch(pathdata);
    if (!response.ok) throw new Error("Error loading CSV file: " + pathdata);
    const csvText = await response.text();
    const parsed = Papa.parse(csvText, { header: true, dynamicTyping: true, skipEmptyLines: true });
    return parsed.data;
}

// --- Chart B (Weather Data) ---
async function draw_potentialyieldweather(weatherData) {

    const parseDate = (dateStr) => {
        const parts = dateStr.split('-');
        return new Date(parts[0], parts[1] - 1, parts[2]);
    };

    const groupedData = {};
    let absoluteStartTime = Infinity;
    weatherData.forEach(r => {
        const d = parseDate(r.dummy_date).getTime();
        if (d < absoluteStartTime) {
            absoluteStartTime = d;
        }
    });

    weatherData.forEach(r => {
        const cycle = r.n_cycle?.toString().trim();
        const phase = r.Phase?.toString().trim();
        if (!cycle) return;
        if (!groupedData[cycle]) groupedData[cycle] = [];

        const currentTime = parseDate(r.dummy_date).getTime();
        const diffTime = currentTime - absoluteStartTime;
        const elapsedDays = diffTime / (1000 * 60 * 60 * 24);

        groupedData[cycle].push({
            day_index: elapsedDays, // Store the relative day number
            tmean: (r.TMIN + r.TMAX) / 2,
            rain: r.RAIN,
            Phase: phase
        });
    });
    let ensoBoundaries = [];
    Object.keys(groupedData).forEach(cycle => {
        const cycleData = groupedData[cycle];
        const boundaries = detectEnsoBoundaries(cycleData, cycle);
        ensoBoundaries = ensoBoundaries.concat(boundaries);
    });
    

    const oniDataNino = ensoBoundaries.filter(row => row['oni'] === 'El Niño');
    const oniDataNina = ensoBoundaries.filter(row => row['oni'] === 'La Niña');

    
    const oniAreasByCycleNino = buildOniAreas(oniDataNino);
    const oniAreasByCycleNina = buildOniAreas(oniDataNina);
    
    const cycleBaseColors = ['#377eb8', '#4daf4a', '#ff7f00', '#984ea3', '#e41a1c'];
    const series = [];
    
    series.push({
            name: 'Flowering dates',
            type: 'line',
            data: [], // Crucial: No data to plot
            symbol: 'none',
            lineStyle: {
                type: 'dotted', // Match your markLine style
                width: 2,
                color: '#d31272' // Match your markLine color
            },
            // IMPORTANT: Must be in the series array
            z: 0, 
            silent: true,
            tooltip: { show: false }
        });

    Object.keys(groupedData).forEach((cycle, colorIndex) => {
        const values = groupedData[cycle];
        
        const baseColor = cycleBaseColors[colorIndex % cycleBaseColors.length];
        const tmeanColor = darkenColor(baseColor, 0.2);
        const rainColor = baseColor;
        
        const fl_dates = weatherData
            .filter(d => d['n_cycle']?.toString() === cycle && d['DayFl'] >= 1)
            .map(d => {
                const flTime = parseDate(d.dummy_date).getTime();
                const diffTime = flTime - absoluteStartTime;
                return diffTime / (1000 * 60 * 60 * 24); // Convert to relative days
            });
        
        const markAreasNino = makeMarkAreas(oniAreasByCycleNino[cycle]);
        const markAreasNina = makeMarkAreas(oniAreasByCycleNina[cycle]);
        
        series.push(
            {
                name: `escenario ${cycle}`,
                type: 'line',
                data: values.map(v => [v.day_index, v.tmean]),
                itemStyle: { color: tmeanColor },
                showSymbol: false,
                markLine: {
                    symbol: 'none',
                    lineStyle: { type: 'dotted', width: 2, color: '#d31272' },
                    label: { show: false },
                    data: fl_dates.map(d => ({ xAxis: d }))
                },
                markArea: {
                    silent: true,
                    itemStyle: { color: lightenColor('#fc8d59', 0.8), opacity: 0.4 },
                    data: markAreasNino
                }
            },
            {
                name: `escenario ${cycle}`,
                type: 'bar',
                yAxisIndex: 1,
                data: values.map(v => [v.day_index, v.rain]),
                itemStyle: { color: rainColor, opacity: 0.3 },
                markArea: {
                    silent: true,
                    itemStyle: { color: lightenColor('#91bfdb', 0.8), opacity: 0.4 },
                    data: markAreasNina
                }
            }
        );
    });
    const scenarioNames = Object.keys(groupedData).map(c => 'escenario ' + c);
    const legendData = ['Flowering dates'].concat(scenarioNames);
    //const legendData = Object.keys(groupedData).map(c => 'escenario ' + c);
    
    const legendSelected = legendData.reduce((acc, name) => {
        acc[name] = (name === 'escenario 1' || name === 'Flowering dates'); 
        return acc;
    }, {});

    const option = {
        legend: { top: 20, type: 'scroll', data: legendData, selected: legendSelected },
        grid: { top: 60, left: 80, right: 80, bottom: 80 },
        tooltip: {
            trigger: 'axis',
            axisPointer: { type: 'shadow' },
            formatter: params => {
            
            const elapsedDays = params[0].value[0];
            
            const elapsedMilliseconds = elapsedDays * 24 * 60 * 60 * 1000;
            
            const reconstructedTimestamp = absoluteStartTime + elapsedMilliseconds;
            
            
            const date = new Date(reconstructedTimestamp);

            const year = date.getFullYear().toString().slice(-2);
            const month = date.toLocaleString('en-GB', { month: 'short' });
            const formattedDate = `${month}`
            
            let tooltipText = `<b>${formattedDate}</b><br/>`;
            
            // Append the Age in Years label for context (optional but useful)
            const plantAgeInYears = Math.floor(elapsedDays / 365.25);
            tooltipText += `<span style="color:#666;">Edad del Cultivo: ${plantAgeInYears} años</span><br/>`;

            params.forEach(p => {
                const value = p.value[1].toFixed(1);
                const marker = p.marker;
                if (p.componentSubType === 'line') tooltipText += `${marker} Temp: ${value} °C<br/>`;
                if (p.componentSubType === 'bar') tooltipText += `${marker} Rain: ${p.value[1].toFixed(2)} mm<br/>`; // Added precision for Rain
            });
            return tooltipText;
        }
        },
        xAxis: { type: "value", name: "Edad del Cultivo (años)", nameLocation: "center", nameGap: 40,
            interval: 365,
            axisLabel: {
                        formatter: value => {
                            const plantAgeInYears =  value / (365.25);
                            return `${Math.round(plantAgeInYears)}`;
                        },
                        fontSize: 13
                    },
                },
        yAxis: [
            { type: "value", name: "Temperatura (°C)", nameLocation: "middle", nameGap: 50 },
            { type: "value", name: "Precipitación (mm)", position: "right", nameLocation: "middle", nameGap: 60 }
        ],
        series
    };

    const chartDom = document.getElementById("chartPotentialyieldweather");
    if (!potentialyieldweatherChart) potentialyieldweatherChart = echarts.init(chartDom);
    potentialyieldweatherChart.setOption(option);
}

// --- Chart A (Heatmap) ---
function renderChart(rawData) {
    const cycleBaseColors = [
        'rgba(55, 126, 184, 0.2)',  
        'rgba(77, 175, 74, 0.2)',   
        'rgba(255, 127, 0, 0.2)',  
        'rgba(152, 78, 163, 0.2)', 
        'rgba(228, 26, 28, 0.2)'   
    ];
    const cycles = [...new Set(rawData.map(d => d.n_cycle))].sort((a, b) => a - b);
    const allHarv = rawData.map(d => d.harvDM_f_hay).filter(x => typeof x === 'number' && !isNaN(x));
    const globalMin = Math.min(...allHarv);
    const globalMax = Math.max(...allHarv);
    
    // Configs
    const n_cycles = cycles.length;
    const rowHeightPct = 50 / n_cycles;
    const gapPct = 2;
    const colors = { 0: "#d31272", 1: "#e9e9e9", 2: "#fc8d59", 3: "#91bfdb" };
    const phaseLabels = { 0: "Floración", 1: "Neutral", 2: "El Niño", 3: "La Niña" };

    const gridDefinitions = [], xAxisDefinitions = [], yAxisDefinitions = [], seriesDefinitions = [];

    cycles.forEach((cycle, index) => {
        const df = rawData.filter(d => d.n_cycle === cycle);
        let phaseValues = df.map(row => {
            let ph = row.Phase ? row.Phase.toString().trim() : "";
            if (ph === 'Neutral') return 1;
            if (ph.includes('Niño') || ph.includes('Nino')) return 2;
            if (ph.includes('Niña') || ph.includes('Nina')) return 3;
            return 1;
        });

        df.forEach((row, i) => {
            if (row.DayFl === 1) {
                const start = Math.max(0, i - 7);
                const end = Math.min(phaseValues.length - 1, i + 7);
                for (let k = start; k <= end; k++) phaseValues[k] = 0;
            }
        });

        const heatmapData = phaseValues.map((val, i) => [i, 0, val, df[i].HDAT]);

        const boxDataRaw = df.filter(r => r['DayHarv(1)'] > 0).map(r => r.harvDM_f_hay);
        const boxStats = calculateBoxPlotStats(boxDataRaw);
        const boxDetails = df.filter(r => r['DayHarv(1)'] > 0).map(r => ({ date: r.HDAT, value: r.harvDM_f_hay }));

        const topPos = (7 + index * (rowHeightPct + gapPct)) + "%";
        const height = rowHeightPct + "%";
        const gridIndexHM = index * 2;
        const gridIndexBP = index * 2 + 1;

        gridDefinitions.push({ left: '12%', width: '65%', top: topPos, height: height, show: false }, { left: '80%', width: '15%', top: topPos, height: height, show: false });

        const baseYear = new Date(df[0].HDAT + "T00:00").getFullYear();
        const parseDate = (dateStr) => {
            const parts = dateStr.split('-');
            return new Date(parts[0], parts[1] - 1, parts[2]);
        };

        const startDate = parseDate(df[0].HDAT);
        const startTime = startDate.getTime();
        xAxisDefinitions.push({
            gridIndex: gridIndexHM,
            type: 'value',
            min: 0,
            max: df.length,
            show: index === n_cycles - 1,
            name: index === n_cycles - 1 ? 'Edad del Cultivo (años)' : '',
            nameLocation: 'middle',
            nameGap: 30,
            interval: 365,
            //interval: Math.floor(df.length / 6),
            nameTextStyle: { color: '#666', fontSize: 16 },
            axisLabel: {
                show: index === n_cycles - 1,
                hideOverlap: true,
                formatter: value => {
                    const idx = Math.round(value);
                    if (!df[idx]) return "";
                    
                    const currentDate = parseDate(df[idx].HDAT);
                    const currentTime = currentDate.getTime();

                    const diffTime = currentTime - startTime;
                    const elapsedDays = diffTime / (1000 * 60 * 60 * 24);
                    
                    // --- THE KEY CHANGE IS HERE ---
                    const plantAgeInYears = elapsedDays / 365.25;

                    const yearLabel = Math.round(plantAgeInYears);
                    
                    return `${yearLabel}`;
                    //return `${Math.floor(plantAgeYears)}`;
                }
            },
            splitLine: { show: false },
            axisTick: { show: index === n_cycles - 1 },
            axisLine: { show: false }
        });
        
        yAxisDefinitions.push({
            gridIndex: gridIndexHM,
            type: 'category',
            data: [''],
            axisTick: { show: false },
            axisLine: { show: false },
            axisLabel: { show: false },
            name: `Escenario ${cycle}`,
            nameLocation: 'middle',
            nameRotate: 0,
            nameGap: 50,
            nameTextStyle: { align: 'middle', verticalAlign: 'middle', color: '#666', fontSize: 16 }
        });

        xAxisDefinitions.push({
            gridIndex: gridIndexBP,
            type: 'value',
            min: globalMin - 50,
            max: globalMax + 50,
            position: 'top',
            show: true,
            name: index === 0 ? 'Producción (kg/ha)' : '',
            nameLocation: 'middle',
            nameGap: 25,
            nameTextStyle: { color: '#666' , fontSize: 16},
            axisLabel: { show: index === 0, color: '#666' },
            axisTick: { show: index === 0 },
            axisLine: { show: index === 0, lineStyle: { color: '#ccc' } },
            splitLine: { show: true, lineStyle: { color: '#E0E6F1' } }
        });
        
        yAxisDefinitions.push({ gridIndex: gridIndexBP, type: 'category', show: false });

        seriesDefinitions.push(
            {
                name: String(cycle),
                type: 'heatmap',
                xAxisIndex: gridIndexHM,
                yAxisIndex: gridIndexHM,
                data: heatmapData,
                animation: false,
                tooltip: {
                    position: 'top',
                    formatter: params => {
                        const value = params.data[2];
                        const date = new Date(params.data[3] + "T00:00");
                        const prettyDate = date.toLocaleString('en-US', { month: 'long', year: 'numeric' });
                        const marker = `<span style="display:inline-block;margin-right:5px;border-radius:10px;width:10px;height:10px;background-color:${params.color};"></span>`;
                        return `${marker} <b>${phaseLabels[value]}</b><br/>${prettyDate}`;
                    }
                }
            },
            {
                name: String(cycle),
                type: 'boxplot',
                xAxisIndex: gridIndexBP,
                yAxisIndex: gridIndexBP,
                data: [boxStats.box],
                itemStyle: { 
                    color: cycleBaseColors[index % cycleBaseColors.length], 
                    borderColor: '#333', 
                    borderWidth: 1 },
                tooltip: {
                    show: false,
                }
            }
        );

        // --- OUTLIERS REMOVED ---
        // if (boxStats.outliers.length > 0) {
        //     seriesDefinitions.push({
        //         name: String(cycle),
        //         type: 'scatter',
        //         xAxisIndex: gridIndexBP,
        //         yAxisIndex: gridIndexBP,
        //         data: boxStats.outliers,
        //         itemStyle: { color: '#000', borderColor: '#000' },
        //         symbolSize: 4
        //     });
        // }
    });

    const option = {
        title: { text: '', left: 'center', top: 5 },
        tooltip: { trigger: 'item', confine: true },
        visualMap: {
            type: 'piecewise',
            dimension: 2,
            categories: [0, 1, 2, 3],
            pieces: [
                { value: 0, label: 'Floración', color: colors[0] },
                { value: 1, label: 'Neutral', color: colors[1] },
                { value: 2, label: 'El Niño', color: colors[2] },
                { value: 3, label: 'La Niña', color: colors[3] }
            ],
            orient: 'horizontal',
            //right: 0,
            top: 12,
            left: 100,
            textStyle: { fontSize: 14 },
            seriesIndex: seriesDefinitions.map((s, i) => s.type === 'heatmap' ? i : -1).filter(i => i >= 0)
        },
        grid: gridDefinitions,
        xAxis: xAxisDefinitions,
        yAxis: yAxisDefinitions,
        series: seriesDefinitions
    };

    const chartDom = document.getElementById('chartPotentialyieldoni');
    potentialyieldoniChart = echarts.init(chartDom);
    potentialyieldoniChart.setOption(option);
    
    // --- ATTACH CLICK LISTENER ---
    potentialyieldoniChart.on('click', function (params) {
        if (params.componentType === 'series') {

            const selectedCycle = params.seriesName;
            
            if (selectedCycle) {
                triggerWeatherChartUpdate(selectedCycle);
            }
        }
    });

    window.addEventListener('resize', () => potentialyieldoniChart.resize());
}

// --- Main Execution ---
async function main() {
    const texture = 'clayloam'; 
    const weatherData = await readcsv("data/weatherbytreatment_" + texture + ".csv");
    const oniData = await readcsv("data/yield_data_" + texture + ".csv");
  
  // Render both charts
  renderChart(oniData);
  draw_potentialyieldweather(weatherData);
}

main();