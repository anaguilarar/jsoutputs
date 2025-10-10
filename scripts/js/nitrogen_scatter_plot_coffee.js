function calculateQuantile(arr, q) {
    if (!arr || arr.length === 0) return NaN;
    const sorted = [...arr].sort((a, b) => a - b);
    const pos = (sorted.length - 1) * q;
    const base = Math.floor(pos);
    const rest = pos - base;
    if (sorted[base + 1] !== undefined) {
        return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
    } else {
        return sorted[base];
    }
}

async function loadData(path){
    const response = await fetch(path);
    return await response.json();
}

function calculateMedian(arr) {
    if (!arr || arr.length === 0) return NaN;
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    if (sorted.length % 2 === 0) {
        return (sorted[mid - 1] + sorted[mid]) / 2;
    } else {
        return sorted[mid];
    }
}

function filterData(data, column, value) {
    if (!Array.isArray(data)) return [];
    return data.filter(row => row && row[column] === value);
}


function filterDataLessThan(data, column, value) {

    return data.filter(item => item[column] <= value);
}

function filterDataGreatherThan(data, column, value) {

    return data.filter(item => item[column] >= value);
}

async function process_coffee_AgronomicData(working_path, stxt_env, fn_code, 
    quantile_value) {

    
    const fn = `${working_path}nitrogen_results_${stxt_env}_${fn_code}.json`;
    console.log("Fetching data from:", fn);
    const target = 'crop_yield';
    let datanut_all;
    datanut_all = await loadData(fn);
    const filteredData = datanut_all

    var yield_base = filterData(filteredData, "nit_ayear3", 0);

    yield_base = yield_base.map(row => parseFloat(row[target])).filter(val => !isNaN(val));
    const targetValues = filteredData.map(row => parseFloat(row[target])).filter(val => !isNaN(val));
    const quantileThreshold = calculateQuantile(targetValues, quantile_value);

    let df_subsetbestyields = filterDataLessThan(filteredData, 'crop_yield', quantileThreshold);

    df_subsetbestyields = filterDataGreatherThan(df_subsetbestyields, 'crop_yield', 0);
    var yield_value = df_subsetbestyields.map(row => {
        var crop_yield = parseFloat(row[target])
        return crop_yield
    });

    let minY = Math.min(...yield_value);
    let maxY = Math.max(...yield_value);
    
    let seriesData_n = yield_value.map(p => [p,(p - minY) / (maxY - minY)]);
    var m = seriesData_n.filter(row => row[1]<0.90).sort((a,b) => b[1]-a[1]);
    const yieldsForCat = df_subsetbestyields.map(row => parseFloat(row[target])).filter(val => !isNaN(val)).sort((a,b) => a-b);
    const q1_thresh = calculateQuantile(yieldsForCat, 1/10);
    //const q2_thresh = calculateQuantile(yieldsForCat, 3/7);
    const q2_thresh = m[0][0];

    const datanut = df_subsetbestyields.map(row => {
        const yieldVal = parseFloat(row[target]);
        let category = 'Medium'; // Default to High
        if (yieldVal >= q2_thresh) {
            category = 'High';
        } else if (yieldVal <= q1_thresh) {
            category = 'Low';
        }
        return { ...row, category: category };
    });


    var app_rec = {};
    for (const val of ['Low', 'Medium', 'High']) {
        //console.log("\nCategory:", val);
        var datanutsubset = datanut.filter(row => row.category === val);
        datanutsubset = datanutsubset.sort((a,b) => a.nit_ayear3-b.nit_ayear3);
        console.log("\nCategory:", val, datanutsubset)

        //datanutsubset.filter(row => row[1]<0.90).sort((a,b) => b[1]-a[1]);
        if (datanutsubset.length === 0) {
            console.log(`No data in category: ${val}`);
            continue;
        }

        const columnsForMedian = ['month1', 'month2', 'n1', 'n2', 'crop_yield', 'nit_ayear3'];
        const datanutsubsetv = datanutsubset[0]
        console.log("\nCategory:", val, datanutsubsetv)
        let yield_improvement = ((datanutsubsetv['crop_yield'] - yield_base) / yield_base) * 100

        app_rec[val] = [[datanutsubsetv['month1'],datanutsubsetv['n1']],
                        [datanutsubsetv['month2'],datanutsubsetv['n2']],
                        [datanutsubsetv['crop_yield'], yield_improvement],
                        [datanutsubsetv['month0'],datanutsubsetv['nit_year1_2']]];
    }
    const output = { best_yield: app_rec['High'] , secondbest_yield: app_rec['Low'], 
        filtered_data: datanut, thresholds: [q1_thresh, q2_thresh, quantileThreshold]};

    return output;
}

function formatString(template, values) {
    let formattedString = template;
    for (const key in values) {
        // Using a RegExp for global replacement (to replace all occurrences if any)
        const regex = new RegExp(`\\{${key}\\}`, 'g');
        formattedString = formattedString.replace(regex, values[key]);
    }
    return formattedString;
}

function getSmoothValues(data, bandwidth){
    const loessRegression = d3.regressionLoess()
                .x(d => d.nitrogen) 
                .y(d => d.yield)    
                .bandwidth(bandwidth);

    let loessCurveData = [];
    loessCurveData = loessRegression(data);

    return loessCurveData;
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

function getColumnAsNumbers(data, columnName) {
    return data.map(item => {
        const value = parseFloat(item[columnName]);
        return isNaN(value) ? null : value;
    });
}
function formatDateString(dateStr, language) {
    
    const parts = dateStr.split('-');
    const monthNum = parseInt(parts[0], 10);
    const dayNum = parseInt(parts[1], 10);
    // 3. Validate numbers
    if (isNaN(monthNum) || isNaN(dayNum) || monthNum < 1 || monthNum > 12 || dayNum < 1 || dayNum > 31) {
      console.error("Invalid month or day number. Received:", dateStr);
      return dateStr; // Or return null, or throw an error
    }

    const monthNames = {'eng': [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
    ],
    'spn': ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
        "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
    ]};


    const monthName = monthNames[language][monthNum - 1];
        return `${monthName} ${dayNum}`;
  }
  



async function table_properties(working_path, stxt_env, crop){
    const fn = `${working_path}soil_and_nitrogen_values_${crop}.json`;
    console.log("Fetching data from:", fn);
    
    let table_data = await loadData(fn);
    
    table_data = filterData(table_data, "texture", stxt_env);
    
    const phvalue = table_data.map(row => parseFloat(row['phh2o'])).filter(val => !isNaN(val));
    const somvalue = table_data.map(row => parseFloat(row['som'])).filter(val => !isNaN(val));
    const tnitrogen = table_data.map(row => parseFloat(row['total_nitrogen'])).filter(val => !isNaN(val));
 
    const output = { pH: phvalue[0], som: somvalue[0], 
        total_nitrogen: tnitrogen[0]};
    //console.log("Final output object:", output);

    return output;

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

function coffee_application_messages(best_yield_summary, lang, pH, som, farmer_yield, farmer_nitrogen) {
    let n_simulatedyield = best_yield_summary[2][0];
    
    let yield_improvement = ((n_simulatedyield - farmer_yield) / farmer_yield) * 100;
    yield_improvement = yield_improvement < 0 ? 0 : parseFloat(yield_improvement.toFixed(1));
    const tr_dict = {
        'en': {
            'start': 'For the {app_num_str} application,',
            'day0': 'During the first two years, apply {n_value} kg/ha of nitrogen, {day_value} months after planting.',
            'day': "Apply {n_value} kg/ha x year of nitrogen",
            'amount': ", in month {day_value} after flowering.",
            'order': ['first', 'second', 'third'],
            'join': 'and',
            'default': "No relevant recommendation could be identified.",

            'note00': `<li>With these recommendations, the average yield during the crop cycle could increase by approximately <strong>{yield_improvement} %</strong> compared to the yield obtained under the initially entered agronomic management conditions.</li>`,
            'note01': `<li>No nitrogen fertilization strategies were identified that improve the simulated yield under the initially entered agronomic management conditions.</li>`,

            'notephlow': `<li>The estimated average pH value is approximately <strong>{pH}</strong>. This indicates soil acidity problems, and a correction is recommended, for example, liming.</li>`,
            'notephhigh': `<li>The estimated average pH value is approximately <strong>{pH}</strong>. This indicates alkaline soil; it is recommended to use highly assimilable sources and/or organic fertilization.</li>`,
            'noteph': `<li>The estimated average pH value is approximately <strong>{pH}</strong>. It is within an optimal range.</li>`,
            'notesom': `<li>The estimated average soil organic matter is approximately <strong>{som} %</strong>.</li>`,
            'note2': `<li>The analysis was carried out according to the <strong>specific soil and historical average climate conditions (1990-2024) of this village</strong>.</li><br>
                <div class='div_small'><strong>Important:</strong> Use this guide as a reference and always combine it with the <strong>advice of a local expert.</strong><div>`
        },
        'es': {
            'start': 'Para la {app_num_str} applicación,',
            'day0': 'Durante los dos primeros años, aplicar {n_value} kg/ha de nitrógeno, {day_value} meses después de la siembra.',
            'day': "Aplicar {n_value} kg/ha x año de nitrógeno",
            'amount': ",en el mes {day_value} después de floración.",
            'order': ['primera', 'segunda', 'tercera'],
            'join': 'y',
            'default': "No se pudo identificar una recomendación relevante.",

            'note00': `<li>Con estas recomendaciones, el rendimiento promedio durante el ciclo del cultivo, podría aumentar aproximadamente un <strong>{yield_improvement} %</strong> en comparación con el rendimiento obtenido del cultivo bajo las condiciones manejo agronómico inicialmente ingresadas.</li>`,
            'note01': `<li>No se identificaron estrategias de fertilización con nitrógeno que mejoren el rendimiento simulado con las condiciones de manejo agronómico inicialmente ingresadas. </li>`,
            
            'notephlow': `<li>El valor promedio de pH estimado es aproximadamente <strong>{pH}</strong>, este valor de pH indica problemas de acidez en el suelo, se recomienda una correción, por ejemplo encalamiento.`,
            'notephhigh': `<li>El valor promedio de pH estimado es aproximadamente <strong>{pH}</strong>, este valor de pH indica que el suelo es alcalino, se recomienda usar fuentes de alta asimilicaión y/o usar fertilización orgánica.`,
            'noteph': `<li>El valor promedio de pH estimado es aproximadamente <strong>{pH}</strong>. Se encuentra en un rango óptimo`,
            'notesom': `<li>El valor promedio de materia orgánica estimada es aproximadamente <strong>{som} %</strong>.`,
            'note2': `<li>Los análisis se realizaron según las <strong>condiciones específicas de suelo y clima promedio histórico (1990-2024) de esta aldea</strong>.</li><br>
                <div class='div_small'><strong>Importante:</strong> Use esta guía como una referencia y combínela siempre con el <strong>asesoramiento de un experto local.</strong><div>`

        }
    };
    
    let yield_split_results = best_yield_summary;

    let sentences = {};
    const varnames = ['sentence1', 'sentence2', 'sentence3'];
    for (let appIndex = 0; appIndex < 3; appIndex++) {
        var varname = varnames[appIndex]
        console.log(appIndex)
        if (appIndex == 0){
            var appDay = yield_split_results[3][0];
            var appAmount = yield_split_results[3][1];
        } else{
            appDay = yield_split_results[appIndex-1][0];
            appAmount = yield_split_results[appIndex-1][1];
        }

        let sentenceParts = [];
        
        //sentenceParts.push(formatString(tr_dict[lang]['start'], { app_num_str: tr_dict[lang].order[appIndex]}));
        if (yield_improvement > 1 && yield_split_results[3][1] > 5) {
            
            if (appIndex == 0){
                sentenceParts.push(formatString(tr_dict[lang]['day0'], { n_value: appAmount.toFixed(0) , 
                    day_value: appDay.toFixed(0)}));
                
            } else{
                sentenceParts.push(formatString(tr_dict[lang]['day'], { n_value: appAmount.toFixed(0) }));
                sentenceParts.push(formatString(tr_dict[lang]['amount'], { day_value: appDay.toFixed(0) }));
            }
            
        } else {
            sentenceParts.push(tr_dict[lang]['default']);
            sentenceParts.push(['']);
        }

        sentences[varname] = sentenceParts;
    }
    
    var total_nitrogen = yield_split_results[0][1] + yield_split_results[1][1] + yield_split_results[2][1];
    
    var final_message = formatString('');

    if (yield_improvement > 1) {
        final_message = final_message + formatString(tr_dict[lang]['note00'], {
            yield_improvement: yield_improvement
        });
    } else {
        final_message = final_message + formatString(tr_dict[lang]['note01'], {});
    }

    if (yield_split_results[3][1] > 5 && farmer_nitrogen !== 0) {
        final_message = final_message + formatString(tr_dict[lang]['note1'], {
            yield_percentage: yield_split_results[3][1].toFixed(1),
            total_nitrogen: total_nitrogen.toFixed(0)
        });
    }
    
    if (pH < 6) {
        final_message = final_message + formatString(tr_dict[lang]['notephlow'], { pH: pH.toFixed(1) });
    } else if (pH > 7) {
        final_message = final_message + formatString(tr_dict[lang]['notephhigh'], { pH: pH.toFixed(1) });
    } else {
        final_message = final_message + formatString(tr_dict[lang]['noteph'], { pH: pH.toFixed(1) });
    }
    final_message = final_message + formatString(tr_dict[lang]['notesom'], { som: som.toFixed(1) });

    final_message = final_message + tr_dict[lang]['note2'];
    
    sentences['final_note'] = final_message;
    return sentences;
    
}

// --- Main Logic ---
document.addEventListener('DOMContentLoaded', async () => {
    var soil_texture = 'clayloam';
    var crop = 'coffee';
    //const cultivar = 'IB1072'; 
    var cultivar = 'sun'; 
    var language = 'spn'; // or eng
    var path = `data/nitrogen/`;

    var params = {
        language: language,
        working_path: path,
        soiltxt_env: soil_texture,
        crop_cultivar: `${crop}_${cultivar}`,
        yield_upper_threshold: 0.98
    };

    const lang = 'es';
    var working_path = params['working_path'];
    var stxt_env = params['soiltxt_env'];
    var month_day_key = params['month_day'];
    var fn_code = params['crop_cultivar'];
    var crop = 'maize'
    var quantile_value = params['yield_upper_threshold'];
    let yield_split_results = await process_coffee_AgronomicData(working_path, stxt_env, 
        fn_code,  
        quantile_value);
    const sim_values = await table_properties(working_path, stxt_env, crop)
    
    const farmer_nitrogen = sim_values['total_nitrogen']; // ***** ESTO CAMBIA CON LOS DATOS DE LA SIMULACION
    
    var total_nitrogen = yield_split_results['best_yield'][0][1]+yield_split_results['best_yield'][1][1];
    var yield_percentage = yield_split_results['best_yield'][2][1];
    //var total_nitrogen2 = yield_split_results['secondbest_yield'][0][1]+yield_split_results['secondbest_yield'][1][1]+yield_split_results['secondbest_yield'][2][1]
    var best_yield = yield_split_results['best_yield'][2][0];
    //var best_yield2 = yield_split_results['secondbest_yield'][3][0]
    var thresholds = yield_split_results['thresholds'];
    const filteredData = yield_split_results['filtered_data'];
    

    if (filteredData.length === 0) {
        document.getElementById('chart-container-coffee').innerText = `No data found for date: ${month_day_key}.`;
        return;
    }
    const raw_targetval = getColumnAsNumbers(filteredData, 'crop_yield');
    console.log("filtered_data: ",filteredData)
    const raw_nitrogen = getColumnAsNumbers(filteredData, 'nit_ayear3');
    const days = getColumnAsNumbers(filteredData, 'day1');


    let scatterData = [];
    let validTargetVals = [];
    let validNitrogenVals = [];
    let d3Data = [];

    for (let i = 0; i < raw_nitrogen.length; i++) {
        const x = raw_nitrogen[i];
        const y = raw_targetval[i];
        const day = days[i];
        if (typeof x === 'number' && isFinite(x) && typeof y === 'number' && isFinite(y)) {
            scatterData.push([x, y, day]);
            d3Data.push({ nitrogen: x, yield: y });
            validNitrogenVals.push(x);
            validTargetVals.push(y); 
        } 
    }
    if (validTargetVals.length === 0) {
        console.error("No valid yield data points found after filtering.");
        document.getElementById('chart-container').innerText = "No valid data points to display.";
        return;
    }

    var targetminval = Math.min(...validTargetVals) - 10;
    var targetmaxval = Math.max(...validTargetVals);
    let datam = (targetmaxval - targetminval) * 0.1;
    targetmaxval = targetmaxval + datam;
    targetminval = Math.max(0, targetminval); 

    let bandwidth = 0.4; 
    let smoothedvalues = getSmoothValues(d3Data, bandwidth);
    var best_point_data = [];
    if(yield_percentage>5){
        best_point_data = [total_nitrogen,best_yield,
            yield_split_results['best_yield'][0][0],yield_split_results['best_yield'][0][1], //app 1
            yield_split_results['best_yield'][1][0],yield_split_results['best_yield'][1][1], //app 1
            yield_split_results['best_yield'][3][0],yield_split_results['best_yield'][3][1] //app 1
        ]
    }
    console.log('best option recommendations: ',best_point_data)
    const initialChartOptions = {
        legend: { top: 20 },
        tooltip: {
            trigger: 'item',
            formatter: function (params) {
                let html = "";
                html += "<div>" + "modeladocultivo.label_nitrogenkgha" + ": " + params.value[0] + "</div>";
                html += "<div>" + "modeladocultivo.label_cropyieldkgha" + ": " + params.value[1].toFixed(0) + "</div>";
                return html;
            }
        },
        grid: { top: 80 },
        xAxis: {
            type: 'value', name: 'Nitrogen (kg/ha.year)', nameLocation: 'middle', nameGap: 40,
            axisLabel: { fontSize: 18 },
            nameTextStyle: { fontSize: 25, fontWeight: 'bold' }
        },
        yAxis: {
            name: 'Potential Yield (kg/ha)', nameLocation: 'middle', nameGap: 70, type: 'value',
            axisLabel: { fontSize: 18, formatter: function (value) { return value.toFixed(0); } },
            nameTextStyle: { fontSize: 25, fontWeight: 'bold' },
            min: targetminval, max: targetmaxval
        },
        series: [
            // Series 0: Scatter plot (static data)
            {
                name: 'Simulated Data',
                data: scatterData,
                symbolSize: 8,
                itemStyle: { color: '#3eb03a', opacity: 0.3 },
                type: 'scatter',
            },
            // Series 1: Recommendation Point (dynamic data - initial empty)
            {
                name: 'Recommendation',
                data: [best_point_data], // Initialize empty, will be updated
                symbol: 'diamond',
                symbolSize: 25,
                itemStyle: { color: '#ff0000', opacity: 1 },
                type: 'scatter',
                z: 10,
                tooltip: {
                    trigger: 'item',
                    formatter: function (params) {
                            return `
                            Crop Yield: ${params.value[1].toFixed(0)} kg/ha<br/>
                            Establecimiento (Primeros dos años):<br/>
                            Mes ${params.value[6].toFixed(0)} | N ${params.value[7].toFixed(0)} kg/ha.año<br/>
                            Apartir del tercer año:<br/>
                            *Mes ${params.value[2].toFixed(0)} | N ${params.value[3].toFixed(0)} kg/ha.año<br/>
                            *Mes ${params.value[4].toFixed(0)} | N ${params.value[5].toFixed(0)} kg/ha.año<br/>
                            *Después de floración`
                            
                        }},
                // ** Add markArea here **
                markArea: {
                    silent: true, // Makes the area non-interactive (no tooltips, not clickable)
                    data: [
                        // First shaded area
                        [ // An array of two points defining the area
                            {
                                name: '', 
                                yAxis: thresholds[1], 
                                itemStyle: { 
                                    color: 'rgba(180, 220, 180, 0.4)' 
                                }
                            },
                            {
                                yAxis: thresholds[2]       
                            }
                        ]
                    ]
            }},
             // Series 2: Smoothed Line (static data)
            {
                name: 'Trend',
                data: smoothedvalues,
                type: 'line',
                smooth: true,
                showSymbol: false,
                lineStyle: { width: 2, color: '#0000ff' }
            },
            {
                name: 'Farmer nitrogen ref',
                type:'line',
                data:[],
                markLine : {
                    label: {                  
                        show: true,
                        position: 'end',
                        formatter: '{b}' 
                    },
                    silent: true,  
                    lineStyle: {
                        color: '#ffa500', 
                        type: 'dashed',
                        width: 2},
                    data : [
                        {xAxis: farmer_nitrogen, name: 'Nitrogeno del manejo'}]
                    }
            },
        ]
    };

    // --- Initialize Chart ---
    const myChart = initChart('chart-coffee-container', initialChartOptions);

    // --- Messages ---

    let pathdata = 'data/coffee_yield_data_clayloam.csv'
    var summarized_values = await summarize_data(pathdata)
    
    
    //.map(row => parseFloat(row[target])).filter(val => !isNaN(val));
    console.log('MESSAGE ---------------------->>>>. ')
    summarized_values = summarized_values.map(row => row['averagedValue'])
    // getting farmer yield averaged value
    var above_0 = summarized_values.slice(2)
    var farmer_yield = above_0.reduce((accumulator, cv) => accumulator + cv, 0)/ above_0.length
    let recommendations = coffee_application_messages(yield_split_results['best_yield'],lang, sim_values['pH'], sim_values['som'], farmer_yield, farmer_nitrogen);
    
    for (let i = 1; i <= 3; i++){
        var recElement = document.getElementById('rec-box-'+i+'-content');
        var sentence = `${recommendations['sentence'+i][0]}`;
        if (i !=1){
            var sentence = `${recommendations['sentence'+i][0]}${recommendations['sentence'+i][1]}`;
        }
        
        recElement.textContent = sentence;
    }
    
    var noteElement = document.getElementById('rec-note-content');
    var sentence = recommendations['final_note'];
    noteElement.innerHTML  = sentence;
})