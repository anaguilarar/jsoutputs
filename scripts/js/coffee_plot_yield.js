
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


async function draw_coffeeplantcycle() {
    let pathresults = '../../data/';
    let texture = 'clayloam';
    let pathdata = pathresults + "coffee_yield_data_" + texture + ".csv";

    console.log('Coffee')

    try {
        // Cargar el CSV de forma asÃ­ncrona


        const response = await fetch(pathdata);
        if (!response.ok) throw new Error("Error al cargar el archivo CSV.");
        

        const csvText = await response.text();

        // Parsear el CSV con Papa Parse
        const parsed = Papa.parse(csvText, {
            header: true,
            dynamicTyping: true
        });

        let data = parsed.data;
        
        // Filtrar y mapear datos vÃ¡lidos
        data = data
            .filter(d => d.nyear_month_day && d.harvDM_f_hay !== undefined && d.period)
            .map(d => {
                const dateParts = d.nyear_month_day.split('-');
                return {
                    date: new Date(+dateParts[0], +dateParts[1] - 1, +dateParts[2]),
                    response: +d.harvDM_f_hay,
                    group: d.period
                };
            });
        
        
        // Agrupar los datos por 'period'
        const groupedData = {};
        data.forEach(d => {
            if (!groupedData[d.group]) groupedData[d.group] = [];
            groupedData[d.group].push(d);
        });
        


        // Ordenar por fecha
        Object.keys(groupedData).forEach(k => {
            groupedData[k].sort((a, b) => a.date - b.date);
        });

        // ConstrucciÃ³n de series para ECharts
        const seriesData = [];
        const colorPalette = ['#e41a1c', '#377eb8', '#4daf4a', '#984ea3', '#ff7f00', '#ffff33', '#a65628', '#f781bf', '#999999'];
        let colorIndex = 0;

        for (const groupName in groupedData) {
            const values = groupedData[groupName];
            seriesData.push({
                name: groupName,
                type: 'line',
                showSymbol: true,
                symbolSize: 4,
                data: values.map(item => [item.date, item.response]),
                lineStyle: { width: 1.5 },
                itemStyle: { color: colorPalette[colorIndex % colorPalette.length] }
            });
            colorIndex++;
        }

        // ConfiguraciÃ³n del grÃ¡fico
        const option = {
            title: {},
            legend: { top: 20, data: Object.keys(groupedData) },
            grid: { top: 50 },
            tooltip: {
                trigger: 'axis',
                axisPointer: { type: "shadow", snap: true },
                formatter: function (params) {
                    return params.map(item => {
                        const dateObj = new Date(item.value[0]);
                        const dateStr = dateObj.toLocaleDateString('en-US', { month: 'short', day: '2-digit' });
                        return "<div class='pt-2'>" +
                            "<div>Y“… <b>" + dateStr + "</b></div>" +
                            "<div>Y : <b>" + item.value[1].toFixed(2) + "</b></div>" +
                            "<div>y : <b>" + item.seriesName + "</b></div>" +
                            "</div>";
                    }).join('');
                }
            },
            xAxis: {
                type: 'time',
                name: "label_coffeeplantcycleyears",
                nameLocation: 'center',
                nameGap: 30,
                nameTextStyle: { // Nombre del eje
                    fontSize: 16,
                    fontWeight: 'bold',

                },
                axisLabel: { // Etiquetas del eje
                    formatter: value => new Date(value).getFullYear().toString().slice(-2),
                    fontSize: 14,
                    rotate: -15
                }
            },
            yAxis: {
                type: 'value',
                name: "modeladocultivo.label_potentialyield",
                nameLocation: "middle",
                nameGap: 50,
                nameTextStyle: { // Nombre del eje
                    fontSize: 16,
                    fontWeight: 'bold',

                },
                axisLabel: { // Etiquetas del eje
                    fontSize: 14,
                },
            },
            series: seriesData
        };

        // Dibujar el grÃ¡fico
        //window.coffeeplantcycleChart.setOption(option);
        var myChart = initChart('coffee_potential_yield_chart', option);

    } catch (error) {
        console.error("Error al procesar los datos del grÃ¡fico:", error);
    }
}

draw_coffeeplantcycle()