
let potentialYieldChart = null;

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

function processData(pathdata) {
    const csvdata = fetch(pathdata)
        .then(response => response.text());

    return csvdata
}

document.addEventListener('DOMContentLoaded', async () => {
    let pathresults = '../../data/';
    let texture = 'clay';
    let pathdata = pathresults + "maize_yield_data_" + texture + ".csv";
    console.log(' data ',pathdata)

    let chartDom = document.getElementById("plot-echart");
    console.log(' data 345454 ')

    if (!chartDom) return;

    if (!potentialYieldChart) {
        potentialYieldChart = echarts.init(chartDom);
    } else {
        potentialYieldChart.clear();
    }

    let processeddata = processData(pathdata)
    console.log(' data 3 ')
    console.log(processeddata)
    processeddata.then(csvText => {
        let rows = csvText.trim().split("\n").map(row => row.split(","));
        //let headers = rows.shift();
        let headers = rows.shift().map(header => header.trim()); 
        
        let dateIndex = headers.indexOf("month_day");
        let responseIndex = headers.indexOf("y");
        let yLowerIndex = headers.indexOf("y_lower");
        let yUpperIndex = headers.indexOf("y_upper");
        
        let seriesData = [];
        let confidenceUpper = [];
        let confidenceLower = [];

        rows.forEach(row => {
            if (row.length < headers.length) return;

            let [month, day] = row[dateIndex].split("-").map(Number);
                let timestamp = Date.UTC(2024, month - 1, day); // Crear fecha en UTC sin desfase
            //let timestamp = row[dateIndex];
            let response = parseFloat(row[responseIndex]);
            let yLower = parseFloat(row[yLowerIndex]);
            let yUpper = parseFloat(row[yUpperIndex]);

            if (isNaN(response) || isNaN(yLower) || isNaN(yUpper)) return;

            seriesData.push([timestamp, response]);
            confidenceUpper.push([timestamp, yUpper]);
            confidenceLower.push([timestamp, yLower]);
        });

        let allYValues = [...seriesData.map(p => p[1])];
        let minY = Math.min(...allYValues);
        let maxY = Math.max(...allYValues);

        let seriesData_n = seriesData.map(p => [p[0],(p[1] - minY) / (maxY - minY)]);
        const upperthreshold = 0.75
        let markAreaData = [];  
        let inArea = false;
        let startX = null;
        
        for (let i = 0; i < seriesData_n.length; i++) {
            const point = seriesData_n[i];
            if (point[1] > upperthreshold && !inArea) {
                inArea = true;
                startX = point[0];
            } else if (point[1] <= upperthreshold && inArea) {
                inArea = false;
                const endX = seriesData_n[i-1][0];
                markAreaData.push([
                    { xAxis: startX },
                    { xAxis: endX }
                ]);
            }
        }
        if (inArea) {
            const endX = seriesData_n[seriesData_n.length - 1][0];
            markAreaData.push([
                { xAxis: startX },
                { xAxis: endX }
            ]);
        }
        console.log(markAreaData)
        let option = {
                title: {},
                grid: {
                    top: 60,    // Aumenta espacio superior para leyenda y posible tÃ­tulo
                    left: 80,   // Evita que se corte el tÃ­tulo del eje Y
                    right: 30,  // Asegura que haya espacio a la derecha (puedes aumentar si agregas yAxis secundario)
                    bottom: 60  // Da espacio para el nombre del eje X
                },
                xAxis: {
                    type: "time",
                    //name: Lang.get("modeladocultivo.label_plantingdatemonth"),
                    name: "planting date",
                    boundaryGap: false,
                    nameLocation: "center", // Centra el label del eje X
                    nameGap: 30,            // Espacio entre el nombre del eje y los valores
                    axisLabel: {
                        formatter: value => echarts.time.format(value, "{MMM}") // Muestra "Ene", "Feb", etc.
                    }
                },
                yAxis: {
                    type: "value",
                    //name: Lang.get("modeladocultivo.label_potentialyield"),
                    name: "yield",
                    nameLocation: "middle", // Ubica el nombre del eje en el centro
                    nameGap: 50,            // Distancia entre eje y su nombre
                    min: 0,                 // Evita que haya valores negativos
                    // axisLabel: {
                    //     formatter: value => value.toLocaleString("en-US", {
                    //         minimumFractionDigits: 0, maximumFractionDigits: 0
                    //     })
                    // }
                },
                series: [
                    {
                        // name: Lang.get("modeladocultivo.label_potentialyield"),
                        type: "line",
                        smooth: true,
                        showSymbol: true,
                        symbol: "circle",
                        symbolSize: 8,
                        emphasis: { focus: "series" },
                        data: seriesData,
                        color: "green",
                        markArea: {
                            itemStyle: {
                                color: 'rgba(173, 255, 177, 0.23)'
                            },
                            data: markAreaData
                        }
                    },
                    {
                        name: 'lower',
                        // name: Lang.get("modeladocultivo.label_confidence_range_lower"),
                        type: "line",
                        data: confidenceLower,
                        color: "black",
                        lineStyle: { width: 1.5 }
                    },
                    {
                        // name: Lang.get("modeladocultivo.label_confidence_range_upper"),
                        type: "line",
                        data: [...confidenceUpper, ...confidenceLower.reverse()],
                        color: "black",
                        lineStyle: { width: 1.5 },
                        areaStyle: {
                            color: 'lightgray',
                            opacity: 0.5
                        },
                        stack: 'confidence-interval'
                    }
                ]
            };

            var myChart = initChart('plot-echart', option);
            console.log('done')
    
    });
    

    //myChart = initChart('chart-container', initialChartOptions);
})
//draw_potential_yield()