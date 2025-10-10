
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

async function loadData(path){
    const response = await fetch(path);
    return await response.json();
}

async function rain_barplotcycle() {

    // --- Main Logic ---
    
        var soil_texture = 'clayloam';
        var crop = 'coffee';
        var pathdata = 'data/rain_sum_bytreatment.csv'
        const response = await fetch(pathdata);
        if (!response.ok) throw new Error("Error al cargar el archivo CSV.");
        

        const csvText = await response.text();

        // Parsear el CSV con Papa Parse
        const parsed = Papa.parse(csvText, {
            header: true,
            dynamicTyping: true
        });

        let rain_cycledata = parsed.data;

        const data = rain_cycledata.map(item => ({
        date: new Date(item.pdat_year_month_day),
        rain: item.RAIN,
        hwah: item.HWAH,
        pdate: new Date(item.hdat_year_month_day)
        }))
        .filter(d => !isNaN(d.rain) && !isNaN(d.hwah));

        console.log(data)

        var dataplot = {
                    name: 'plot',
                    type: 'bar',
                    showSymbol: true,
                    symbolSize: 4,
                    data: rain_cycledata.map(item => [item.pdat_year_month_day, item.HWAH]),
                    lineStyle: { width: 1.5 },
                  
                };

        const initialChartOptions = {
            title: {
                text: 'My Bar Chart'
            },
            tooltip: {
            trigger: 'item',
            formatter: params => `
                <b>${new Date(params.value[0]).toLocaleDateString()}</b><br>
                Fecha de cosecha: ${new Date(params.value[3]).toLocaleDateString()}<br>
                Precipitación: ${params.value[1].toFixed(1)} mm<br>
                Rendimiento: ${params.value[2].toFixed(0)} kg/ha
            `
            },
                
            
            xAxis: {
                type: 'time',
                name: "label_plantingdate",
                nameLocation: 'center',
                nameGap: 30,
                nameTextStyle: { // Nombre del eje
                    fontSize: 16,
                    fontWeight: 'bold',

                },
                axisLabel: { // Etiquetas del eje
                    formatter: value => new Date(value).toLocaleDateString(),
                    fontSize: 14,
                    rotate: -15
                }
            },
            
            yAxis: {
                    type: 'value',
                    name: "Total Precipitation \nDuring the Final Growth Stage [mm]",
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
            // Visual mapping for color based on HWAH
            visualMap: {
                show: true,
                dimension: 2,  // HWAH is the 3rd element in [x, y, color]
                min: Math.min(...data.map(d => d.hwah)),
                max: Math.max(...data.map(d => d.hwah)),
                orient: 'horizontal',
                left: 'center',
                bottom: -10,
                text: ['High Yield', 'Low Yield'],
                inRange: {
                    color: ['#d73027', '#fc8d59', '#fee08b', '#d9ef8b', '#91cf60', '#1a9850'] // blue→red
                }
            },
            
            series: [{
                    name: 'Rainfall',
                    type: 'bar',
                    data: data.map(d => [d.date, d.rain, d.hwah, d.pdate]),
                    itemStyle: {
                        opacity: 0.9
                    }
                }]
        };

        var myChart = initChart('rain_barplot', initialChartOptions);
        


}
rain_barplotcycle();