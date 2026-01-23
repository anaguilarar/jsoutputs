async function readcsv(pathdata) {
    const response = await fetch(pathdata);
    const csvText = await response.text();
    
    // Use skipEmptyLines to prevent empty rows creating bad data
    const parsed = Papa.parse(csvText, {
        header: true,
        dynamicTyping: true,
        skipEmptyLines: true 
    });

    if (!response.ok) throw new Error("Error uploading the CSV file.");
    
    return parsed.data;
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


function renderChart(rawData) {
    // -- A. Prepare Data Grouped by Cycle --
    
    // Get unique cycles
    const cycles = [...new Set(rawData.map(d => d.n_cycle))].sort((a, b) => a - b);
    
    // Get global min/max for Boxplot X-axis synchronization
    // Python: global_min/max = plotdata['harvDM_f_hay'].min()/max()
    const allHarv = rawData.map(d => d.harvDM_f_hay).filter(x => x !== null && x !== undefined);
    const globalMin = Math.min(...allHarv);
    const globalMax = Math.max(...allHarv);
    const axisRange = [globalMin - 50, globalMax + 50];

    const gridDefinitions = [];
    const xAxisDefinitions = [];
    const yAxisDefinitions = [];
    const seriesDefinitions = [];

    // Colors matching the Python ListedColormap
    const colors = {
        0: "#6c12d3",  // Flowering
        1: "#e4e4e43a",  // Neutral
        2: "#fc8d59",  // El Niño
        3: "#91bfdb"   // La Niña
    };
    const phaseLabels = {
        0: "Flowering",
        1: "Neutral",
        2: "El Niño",
        3: "La Niña"
    };

    const n_cycles = cycles.length;
    const rowHeightPct = 60 / n_cycles; // Dynamically size height
    const gapPct = 2;

    cycles.forEach((cycle, index) => {
        // Filter data for current cycle
        const df = rawData.filter(d => d.n_cycle === cycle);

        // Initialize with phases
        // Python: phasevalues[df.Phase == 'Neutral'] = 1, etc.
        let phaseValues = df.map(row => {
            if (row.Phase === 'Neutral') return 1;
            if (row.Phase === 'El Niño') return 2;
            if (row.Phase === 'La Niña') return 3;
            return 1; // Default/Fallback
        });

        const floweringIndices = df
            .map((row, i) => (row.DayFl === 1 ? i : -1))
            .filter(i => i !== -1);

        floweringIndices.forEach(idx => {
            const start = Math.max(0, idx - 2);
            const end = Math.min(phaseValues.length - 1, idx + 2);
            for (let k = start; k <= end; k++) {
                phaseValues[k] = 0; // 0 = Flowering color
            }
        });

        const heatmapData = phaseValues.map((val, i) => [i, 0, val, df[i].HDAT]);

        // --- 2. PREPARE BOXPLOT DATA ---
        
        // Python: df.loc[df['DayHarv(1)'] > 0, 'harvDM_f_hay'].values
        const boxDataRaw = df
            .filter(row => row['DayHarv(1)'] > 0)
            .map(row => row.harvDM_f_hay);

        const boxStats = calculateBoxPlotStats(boxDataRaw);
        const boxDetails = df
            .filter(row => row['DayHarv(1)'] > 0)
            .map(row => ({
                date: row.HDAT,
                value: row.harvDM_f_hay
            }));
        // --- 3. LAYOUT CALCULATIONS ---
        
        const topPos = (10 + index * (rowHeightPct + gapPct)) + "%";
        const height = rowHeightPct + "%";
        const baseGridIndex = index * 2;     // Heatmap Grid
        const boxGridIndex = index * 2 + 1;  // Boxplot Grid

        // Define Grids
        gridDefinitions.push(
            
            { left: '8%', width: '65%', top: topPos, height: height },
            { left: '75%', width: '15%', top: topPos, height: height }
        );

        const cycleDates = df.map(d => d.HDAT);
        const startStr = cycleDates[0]; // e.g., "1991-04-01"
        const baseDate = new Date(startStr + "T00:00");
        const baseYear = baseDate.getFullYear();
        // Define Axes for Heatmap
        xAxisDefinitions.push({
            gridIndex: baseGridIndex,
            type: 'value',
            show: index === n_cycles - 1, // Show only on bottom chart
            name: index === n_cycles - 1 ? 'Time index' : '',
            nameLocation: 'middle',
            nameGap: 25,
            interval: Math.floor(df.length / 6), 
            
            axisLabel: { 
                show: index === n_cycles - 1,
                // --- KEY CHANGE: Formatter ---
                formatter: function (value) {
                    // value is the numeric index (e.g., 500). 
                    // We round it to ensure it matches an array index.
                    const idx = Math.round(value);
                    
                    // Safety check
                    if (!cycleDates[idx]) return "";

                    // Create a Date object from the "YYYY-MM-DD" string
                    // Note: Adding "T00:00" ensures local timezone doesn't shift the day
                    const date = new Date(cycleDates[idx] + "T00:00");
                    const month = date.toLocaleString('en-US', { month: 'short' });
                    const currentYear = date.getFullYear();
                    const relativeYear = currentYear - baseYear;
                    
                    return `Año ${relativeYear} ${month}`;
                    
                    
                    // return cycleDates[idx].substring(0, 7); 
                },
                hideOverlap: true // Helps prevent text collision
            },
            splitLine: { show: true, lineStyle: { color: '#eee' } },
            axisTick: { show: true },
            axisLine: { show: true, lineStyle: { color: '#888' } }
        });
        yAxisDefinitions.push({
            gridIndex: baseGridIndex,
            type: 'category',
            data: [''],
            axisTick: { show: false },
            axisLine: { show: false },
            axisLabel: { show: false }, 
            name: `Ciclo ${cycle}`,
            nameLocation: 'middle',
            nameTextStyle: { padding: [0, 0, 0, 0], align: 'middle', verticalAlign: 'middle',
                      color: '#666',
                fontSize: 16
             }
             

        });

        // Define Axes for Boxplot
        xAxisDefinitions.push({
            gridIndex: boxGridIndex,
            type: 'value',
            min: axisRange[0],
            max: axisRange[1],
            //show: index === 0, // Show only on top chart
            position: 'top',
            name: index === 0 ? 'Producción (kg/ha)' : '',
            nameTextStyle: { fontSize: 18 },
            nameLocation: 'middle',
            nameGap: 25,
            axisLabel: { show: index === 0, color: '#666' }, 
            axisTick: { show: index === 0 },
            axisLine: { show: index === 0, lineStyle: { color: '#ccc' } },
            splitLine: { 
                show: true, 
                lineStyle: { 
                    color: '#E0E6F1', // Light blue-gray to match your screenshot
                    type: 'solid'     // or 'dashed'
                } 
            }
        });
        yAxisDefinitions.push({
            gridIndex: boxGridIndex,
            type: 'category',
            show: false 
        });

        // Define Series
        seriesDefinitions.push(
            // Heatmap Series
            {
                type: 'heatmap',
                xAxisIndex: baseGridIndex,
                yAxisIndex: baseGridIndex,
                data: heatmapData,
                itemStyle: { borderColor: null, borderWidth: 0 },
                animation: false,
                
                tooltip: {
                  position: 'top',
                  formatter: function (params) {
                    const value = params.data[2];
                    const dateStr = params.data[3];
                    //if (value !== 0) { return ""}; // Only show tooltip for Flowering
                    const date = new Date(dateStr + "T00:00");

                    const prettyDate = date.toLocaleDateString('en-US', { month: 'short', day: '2-digit'});
                    if (!dateStr) return "";
                    
                    const color = params.color;
                    const marker = `<span style="display:inline-block;margin-right:5px;border-radius:10px;width:10px;height:10px;background-color:${color};"></span>`;
                    
                    return `${marker} <b>${phaseLabels[value]}</b><br/>${prettyDate}`;
                  }
                }

            },
            // Boxplot Series
            {
                type: 'boxplot',
                xAxisIndex: boxGridIndex,
                yAxisIndex: boxGridIndex,
                data: [boxStats.box],
                itemStyle: { color: '#dddddd', borderColor: '#000', borderWidth: 1 },
                
                // --- CUSTOM TOOLTIP FOR BOXPLOT ---
                tooltip: {
                    formatter: function (param) {
                        let html = `<div style="text-align:left;">`;
                        html += `<b>Ciclo ${cycle} Producción:</b><br/>`;
                        html += `<hr style="margin:5px 0;border:0;border-top:1px solid #ccc;"/>`;
                        
                        if (boxDetails.length === 0) {
                            html += "No data";
                        } else {
                            // Sort by date to be cleaner
                            boxDetails.sort((a, b) => new Date(a.date) - new Date(b.date));
                            
                            // List each production event
                            boxDetails.forEach(item => {
                                const d = new Date(item.date + "T00:00");
                                const dateStr = d.toLocaleString('en-US', { month: 'short', day: 'numeric' });
                                // Using a monospace font or alignment helps readability
                                html += `<span style="color:#888;">${dateStr}:</span> <b>${item.value.toFixed(1)}</b><br/>`;
                            });
                        }
                        html += `</div>`;
                        return html;
                    }
                }
            }
        );

        // Add Outliers to Boxplot if they exist
        if (boxStats.outliers.length > 0) {
            seriesDefinitions.push({
                type: 'scatter',
                xAxisIndex: boxGridIndex,
                yAxisIndex: boxGridIndex,
                data: boxStats.outliers,
                symbolSize: 4,
                itemStyle: { color: 'black', borderColor: 'black' }
            });
        }
    });

    // --- 4. ECHARTS CONFIGURATION ---
    
    const option = {
        title: {
            text: 'ENSO Phase (Heatmap) and Harvest Distribution by Cycle',
            left: 'center',
            top: 10
        },
        tooltip: { 
            trigger: 'item',
            confine: true
        },
        visualMap: {
            type: 'piecewise',
            dimension: 2,
            categories: [0, 1, 2, 3],
            pieces: [
                { value: 0, label: 'Flowering', color: colors[0] },
                { value: 1, label: 'Neutral', color: colors[1] },
                { value: 2, label: 'El Niño', color: colors[2] },
                { value: 3, label: 'La Niña', color: colors[3] }
            ],
            orient: 'vertical',
            right: 10,
            top: 'center',
            seriesIndex: seriesDefinitions.map((s, i) => s.type === 'heatmap' ? i : -1).filter(i => i >= 0)
        },
        grid: gridDefinitions,
        xAxis: xAxisDefinitions,
        yAxis: yAxisDefinitions,
        series: seriesDefinitions
    };

    const myChart = echarts.init(document.getElementById('chartPotentialyieldoni'));
    myChart.setOption(option);
    
    // Resize handler
    window.addEventListener('resize', () => myChart.resize());
}

async function main() {
  const csvData = 'data/coffee_oni.csv'
  const parsedData = await readcsv(csvData);
  
  renderChart(parsedData)
}

main()