
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


function renderItem(params, api) {
  const group = {
    type: 'group',
    children: []
  };
  let coordDims = ['x', 'y'];
  for (let baseDimIdx = 0; baseDimIdx < 2; baseDimIdx++) {
    let otherDimIdx = 1 - baseDimIdx;
    let encode = params.encode;
    let baseValue = api.value(encode[coordDims[baseDimIdx]][0]);
    let param = [];
    param[baseDimIdx] = baseValue;
    param[otherDimIdx] = api.value(encode[coordDims[otherDimIdx]][1]);
    let highPoint = api.coord(param);
    param[otherDimIdx] = api.value(encode[coordDims[otherDimIdx]][2]);
    let lowPoint = api.coord(param);
    let halfWidth = 5;
    var style = api.style({
      stroke: api.visual('color'),
      fill: undefined
    });
    group.children.push(
      {
        type: 'line',
        transition: ['shape'],
        shape: makeShape(
          baseDimIdx,
          highPoint[baseDimIdx] - halfWidth,
          highPoint[otherDimIdx],
          highPoint[baseDimIdx] + halfWidth,
          highPoint[otherDimIdx]
        ),
        style: style
      },
      {
        type: 'line',
        transition: ['shape'],
        shape: makeShape(
          baseDimIdx,
          highPoint[baseDimIdx],
          highPoint[otherDimIdx],
          lowPoint[baseDimIdx],
          lowPoint[otherDimIdx]
        ),
        style: style
      },
      {
        type: 'line',
        transition: ['shape'],
        shape: makeShape(
          baseDimIdx,
          lowPoint[baseDimIdx] - halfWidth,
          lowPoint[otherDimIdx],
          lowPoint[baseDimIdx] + halfWidth,
          lowPoint[otherDimIdx]
        ),
        style: style
      }
    );
  }
  function makeShape(baseDimIdx, base1, value1, base2, value2) {
    var shape = {};
    shape[coordDims[baseDimIdx] + '1'] = base1;
    shape[coordDims[1 - baseDimIdx] + '1'] = value1;
    shape[coordDims[baseDimIdx] + '2'] = base2;
    shape[coordDims[1 - baseDimIdx] + '2'] = value2;
    return shape;
  }
  return group;
}

async function summarize_data(data_path){
    const response = await fetch(data_path)
    const csvText = await response.text()
    
    const parsed = Papa.parse(csvText,{
            header: true,
            dynamicTyping: true
        });

    let data = parsed.data;

       
    data = data.filter(row => row['DayHarv(1)'] === 1)
    data = data
            .filter(d => d.nyear_month_day && d.harvDM_f_hay !== undefined && d.period)
            .map(d => {
                const dateParts = d.nyear_month_day.split('-');
                return {
                    year: dateParts[0],
                    response: +d.harvDM_f_hay,
                    group: d.period
                };
            });


    var groupedByYear = {};
    groupedByYear = data.reduce((acc, item) =>{
        if (!acc[item.year]) acc[item.year] = []
        acc[item.year].push(item.response);
        return acc
    }, {});
    var summarizedValues = Object.keys(groupedByYear).map(year => {
        const responses = groupedByYear[year];
        const sumValue = responses.reduce((total, current) => total+ current, 0);
        const minValue = Math.min(...responses);
        const maxValue = Math.max(...responses);
        return {year: year, 
            averagedValue: (sumValue/responses.length),
            minValue: minValue,
            maxValue: maxValue}
    })

    summarizedValues.push({year:'2000', averagedValue: 0, minValue: 0, maxValue: 0 },
        {year:'2001', averagedValue: 0, minValue: 0, maxValue: 0 }
    )
    summarizedValues = summarizedValues.sort((a,b) => a.year - b.year)
    
    return summarizedValues
};


async function draw_coffee_averagedplantcycle() {

    //let pathdata = input_path + 'coffee_yield_data_' + texture + '.csv'
    let pathdata = 'data/coffee_yield_data_clayloam.csv'
    let best_practices = 'data/best_practices_yield_data_clayloam.csv'
    console.log(pathdata)

    var summarized_values = await summarize_data(pathdata)
    var summarized_values_best = await summarize_data(best_practices)

    // ConstrucciÃ³n de series para ECharts
    const seriesData = [];
    
    const colorPalette = ['#984ea3', '#4daf4a'];
    let colorIndex = 0;
        
    seriesData.push({
        name: 'Rendimientos\nSimulados',
        type: 'line',
        showSymbol: true,
        symbolSize: 4,
        data: summarized_values.map(item => [item.year, item.averagedValue]),
        lineStyle: { width: 1.5 },
        itemStyle: { color: colorPalette[colorIndex % colorPalette.length] }
    });

    colorIndex = 1;
    seriesData.push({
        name: 'Rendimientos con\nRecomendaciones',
        type: 'line',
        showSymbol: true,
        symbolSize: 4,
        data: summarized_values_best.map(item => [item.year, item.averagedValue]),
        lineStyle: { width: 1.5 },
        itemStyle: { color: colorPalette[colorIndex % colorPalette.length] }
    });


    seriesData.push({
        name: 'Intervalo\nsimulaciones',
        type: 'custom',
        showSymbol: true,
        renderItem: renderItem,
        symbolSize: 4,
        data: summarized_values.map(item => [item.year, item.minValue,item.averagedValue, item.maxValue]),
        encode: {
            y: [2,1, 3],

        itemName: 0
          },
        tooltip: { show: false },
        lineStyle: { width: 1.5 },
        itemStyle: { color:'#984ea38a'}
    });


    seriesData.push({
        name: 'Intervalo\nrecomendaciones',
        type: 'custom',
        showSymbol: true,
        renderItem: renderItem,
        symbolSize: 4,
        data: summarized_values_best.map(item => [item.year, item.minValue,item.averagedValue, item.maxValue]),
        encode: {
            y: [2,1, 3],
        tooltip: { show: false },
        itemName: 0
        },
        tooltip: { show: false },
        lineStyle: { width: 1.5 },
        itemStyle: { color: '#8cf777ff' }
    });


    console.log(seriesData)
    // ConfiguraciÃ³n del grÃ¡fico
    const option = {
        title: {},
        legend: { top: 10,
            selected: {
            'Rendimientos\nSimulados': true,              // visible
            'Rendimientos con\nRecomendaciones': true,      // visible
            'Intervalo\nsimulaciones': false,                  // hidden initially
            'Intervalo\nrecomendaciones': false                   // hidden initially
        }
            },
        grid: { top: 50 },
        tooltip: {
            trigger: 'axis',
            axisPointer: { type: "shadow", snap: true },
            formatter: function (params) {
                return params.map(item => {
                    const dateObj = new Date(item.value[0]);
                    const dateStr = dateObj.toLocaleDateString('en-US', { month: 'short', day: '2-digit' });
                    return "<div class='pt-2'>" +
                        "<div>"+ item.seriesName+" : <b>" + item.value[1].toFixed(2) + " kg/ha</b></div>" +
                        "</div>";
                }).join('');
            }
        },
        xAxis: {
            type: 'time',
            name: "Ciclo del café ",
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
            name: "Yield (kg/ha)",
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

    var myChart = initChart('coffee_potential_yield_chart_avg', option);


};

draw_coffee_averagedplantcycle()