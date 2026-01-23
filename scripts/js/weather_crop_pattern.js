let potentialyieldweatherChart = null;

function hexToRgb(hex) {
    hex = hex.replace('#', '');
    const bigint = parseInt(hex, 16);
    return {
        r: (bigint >> 16) & 255,
        g: (bigint >> 8) & 255,
        b: bigint & 255
    };
}

function rgbToHex(r, g, b) {
    return '#' + [r, g, b]
        .map(x => x.toString(16).padStart(2, '0'))
        .join('');
}

function lightenColor(hex, factor = 0.3) {
    const { r, g, b } = hexToRgb(hex);
    return rgbToHex(
        Math.min(255, Math.round(r + (255 - r) * factor)),
        Math.min(255, Math.round(g + (255 - g) * factor)),
        Math.min(255, Math.round(b + (255 - b) * factor))
    );
}

function darkenColor(hex, factor = 0.3) {
    const { r, g, b } = hexToRgb(hex);
    return rgbToHex(
        Math.round(r * (1 - factor)),
        Math.round(g * (1 - factor)),
        Math.round(b * (1 - factor))
    );
}

function initChart(elementId, options) {
    const chartDom = document.getElementById(elementId);
    if (!chartDom) {
        console.error(`Chart container with id "${elementId}" not found.`);
        return null;
    }
    const myChart = echarts.init(chartDom);
    myChart.setOption(options);

    window.addEventListener('resize', function () {
        myChart.resize();
    });
    return myChart; 
}

function buildOniAreas(oni_data) {
    const areasByCycle = {};

    oni_data.forEach(d => {
        const cycle = d.n_cycle?.toString().trim();
        if (!cycle) return;

        if (!areasByCycle[cycle]) areasByCycle[cycle] = {};
        if (!areasByCycle[cycle][d.oni]) {
            areasByCycle[cycle][d.oni] = { start: [], end: [] };
        }

        const date = new Date(d.date);

        if (d.period === 'start') {
            areasByCycle[cycle][d.oni].start.push(date);
        } else if (d.period === 'end') {
            areasByCycle[cycle][d.oni].end.push(date);
        }
    });

    return areasByCycle;
}

function makeMarkAreas(oniGrouped) {
    const markAreas = [];

    Object.keys(oniGrouped).forEach(eventName => {
        const starts = oniGrouped[eventName].start;
        const ends = oniGrouped[eventName].end;

        for (let i = 0; i < Math.min(starts.length, ends.length); i++) {
            markAreas.push([
                { 
                    xAxis: starts[i],
                    label: { show: true, formatter: eventName }
                },
                { xAxis: ends[i] }
            ]);
        }
    });

    return markAreas;
}


async function readcsv(pathdata) {
    const response = await fetch(pathdata);
    const csvText = await response.text()
    const parsed = Papa.parse(csvText,{
            header: true,
            dynamicTyping: true
        });

    if (!response.ok) throw new Error("Error at the moment to upload the CSV file.");
    
    return parsed.data;
}


async function draw_potentialyieldweather() {
    let pathresults = 'data/'
    let pathdata = "data/weatherbytreatment.csv";
    let floweringpathdata = pathresults + "yield_data_clayloam.csv";
    let oni_data_path = pathresults + "oni_data_clayloam.csv";
    const chartDom = document.getElementById("chartPotentialyieldweather");
    if (!chartDom) return;

    if (!potentialyieldweatherChart) {
        potentialyieldweatherChart = echarts.init(chartDom);
    } else {
        potentialyieldweatherChart.clear();
    }
    let flowering_data= await readcsv(floweringpathdata);
    flowering_data =flowering_data.filter(row => row['daytoflower'] >= 1)
    let oni_data = await readcsv(oni_data_path);
    oni_data_nino = oni_data.filter(row => row['oni'] === 'El Niño')
    oni_data_nina = oni_data.filter(row => row['oni'] === 'La Niña')
    const oniAreasByCycleNino = buildOniAreas(oni_data_nino);
    console.log("oni_data_nino:", oni_data_nino);
    const oniAreasByCycleNina = buildOniAreas(oni_data_nina);
    console.log("PATH:", oniAreasByCycleNina);
    console.log("PATH:", pathdata);
    fetch(pathdata)
        .then(r => r.text())
        .then(csvText => {
            const rows = csvText.trim().split("\n").map(r => r.split(","));+
            console.log(rows)
            const headers = rows.shift();
            console.log(headers)
            const idx = {
                date: headers.indexOf("dummy_date"),
                tmin: headers.indexOf("TMIN"),
                tmax: headers.indexOf("TMAX"),
                rain: headers.indexOf("RAIN"),
                cycle: headers.indexOf("n_cycle\r")
            };

            if (Object.values(idx).some(v => v < 0)) {
                throw new Error("Missing required columns in CSV");
            }
            console.log('idx: ' +idx);
            const groupedData = {};

            rows.forEach(r => {
                const cycle = r[idx.cycle]?.trim();
                console.log('Processing cycle: ' + cycle);
                if (!cycle) return;

                const date = new Date(r[idx.date]);
                const tmin = +r[idx.tmin];
                const tmax = +r[idx.tmax];
                const rain = +r[idx.rain];
                const tmean = (tmin + tmax) / 2;

                if (isNaN(date) || isNaN(tmin) || isNaN(tmax) || isNaN(rain)) return;

                if (!groupedData[cycle]) groupedData[cycle] = [];

                groupedData[cycle].push({ date, tmean, rain });
            });
            console.log(groupedData);
            // Sort each cycle by date
            Object.values(groupedData).forEach(arr =>
                arr.sort((a, b) => a.date - b.date)
            );

            const cycleBaseColors = [
                '#377eb8', // blue
                '#4daf4a', // green
                '#ff7f00', // orange
                '#c300ff', // purple
                '#00eeff', // yellow

            ];

            const series = [];
            let colorIndex = 0;

            for (const cycle in groupedData) {
                const values = groupedData[cycle];
                const fl_dates = flowering_data
                    .filter(d => d['n_cycle']?.toString() === cycle)
                    .map(d => {
                        const dateParts = d.nyear_month_day.split('-');
                        return new Date(dateParts[0], dateParts[1] - 1, dateParts[2]);
                    });
                console.log('Flowering dates for cycle ' + cycle, fl_dates);
                const baseColor = cycleBaseColors[colorIndex % cycleBaseColors.length];
                const tminColor = lightenColor(baseColor, 0.4);
                const tmeanColor = darkenColor(baseColor, 0.3);
                const rainColor = baseColor;
                const floweringMarkLines = fl_dates.map(date => ({
                    xAxis: date
                }));

                const cycleOniAreas = oniAreasByCycleNino[cycle];
                console.log('ONI areas for cycle ' + cycle, cycleOniAreas);
                const markAreasNino = makeMarkAreas(cycleOniAreas);
                
                const cycleOniAreasNina = oniAreasByCycleNina[cycle];
                const markAreasNina = makeMarkAreas(cycleOniAreasNina);
                
                series.push({
                    name: `ciclo ${cycle}`,   // 🔴 SAME legend name
                    type: 'line',
                    data: [],
                    symbol: 'none',
                    lineStyle: { opacity: 0 },

                    markLine: {
                        symbol: 'none',
                        lineStyle: {
                            type: 'dotted',
                            width: 2,
                            color: '#6c12d3'
                        },
                        label: { show: false },
                        data: fl_dates.map(d => ({ xAxis: d }))
                    },

                    tooltip: { show: true }
                });



                series.push(
                    {
                        name: 'ciclo '  + cycle, id: cycle + '_tmean',
                        type: 'line',
                        data: values.map(v => [v.date, v.tmean]),
                        itemStyle: { color: tmeanColor },
                        tooltip: false,
                        markArea:{
                            silent: true,
                            itemStyle: {
                                color: lightenColor('#fc8d59', 0.8),
                                opacity: 0.3
                            },
                            data: markAreasNino
                        },
                        
                    },
                    {
                        name: 'ciclo '  + cycle, id: cycle + '_rain',
                        type: 'bar',
                        yAxisIndex: 1,
                        data: values.map(v => [v.date, v.rain]),
                        markArea:{
                            silent: true,
                            itemStyle: {
                                color: lightenColor('#91bfdb', 0.8),
                                opacity: 0.3
                            },
                            data: markAreasNina
                        },
                        itemStyle: {
                            color: rainColor,
                            opacity: 0.3
                        },
                        tooltip: false
                    },
                    
                );
                colorIndex++;
            }
            
            const legendData = Object.keys(groupedData).map(c => 'ciclo ' + c);
            const legendSelected = {};
            legendData.forEach(name => {
                legendSelected[name] = (name === 'ciclo 1');
            });
            const option = {
                title: {},
                legend: { top: 20,
                    type: 'scroll',
                    data: legendData,
                    selected: legendSelected
                    
                },
                grid: {
                    top: 60,
                    left: 80,
                    right: 80,
                    bottom: 80
                },
                tooltip: {
                trigger: 'axis',
                axisPointer: { type: 'shadow', snap: true },
                formatter: function (params) {
                    // Only keep params belonging to the focused series
                    const active = params.find(p => p.seriesIndex === p.componentIndex);
                    if (!active) return '';

                    const date = new Date(active.value[0])
                        .toLocaleDateString('en-US', { month: 'short'});

                    return `
                        <b>${date}</b><br/>
                    `;
                }
                },
                xAxis: {
                    type: "time",
                    name: "Month - Year",
                    nameLocation: "center",
                    nameGap: 40,
                    axisLabel: {
                        formatter: value => {
                            const d = new Date(value);
                            const month = String(d.getMonth() + 1).padStart(2, "0");
                            const year = d.getFullYear().toString().slice(-2);
                            return `${month}-${year}`;
                        },
                        fontSize: 13
                    }
                },
                yAxis: [
                    {
                        type: "value",
                        name: "Temperature (°C)",
                        nameLocation: "middle",
                        nameGap: 50
                    },
                    {
                        type: "value",
                        name: "Rain (mm)",
                        position: "right",
                        nameLocation: "middle",
                        nameGap: 60
                    }
                ],
                series
            };

            const chartDom = document.getElementById("chartPotentialyieldweather");
            if (!potentialyieldweatherChart) {
                potentialyieldweatherChart = echarts.init(chartDom);
            }
            potentialyieldweatherChart.setOption(option);
            
            window.addEventListener("resize", () => potentialyieldweatherChart.resize());

        });

    window.addEventListener("resize", () =>
        potentialyieldweatherChart.resize()
    );
}

draw_potentialyieldweather();