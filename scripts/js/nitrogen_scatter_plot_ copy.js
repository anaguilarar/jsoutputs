
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

async function processAgronomicData(working_path, stxt_env, fn_code, 
    month_day_key, quantile_value) {

    
    const fn = `${working_path}nitrogen_results_${stxt_env}_${fn_code}.json`;
    console.log("Fetching data from:", fn);
    const target = 'crop_yield';
    let datanut_all;
    datanut_all = await loadData(fn);
    
    const filteredData = filterData(datanut_all, "month_day", month_day_key);
    var yield_base = filterData(filteredData, "total_nitrogen", 0);
    yield_base = yield_base.map(row => parseFloat(row[target])).filter(val => !isNaN(val));
    const targetValues = filteredData.map(row => parseFloat(row[target])).filter(val => !isNaN(val));
    const quantileThreshold = calculateQuantile(targetValues, quantile_value);

    let df_subsetbestyields = filterDataLessThan(filteredData, 'crop_yield', quantileThreshold);
    df_subsetbestyields = filterDataGreatherThan(df_subsetbestyields, 'crop_yield', 0);
    const yieldsForCat = df_subsetbestyields.map(row => parseFloat(row[target])).filter(val => !isNaN(val)).sort((a,b) => a-b);
    const q1_thresh = calculateQuantile(yieldsForCat, 2/7);
    const q2_thresh = calculateQuantile(yieldsForCat, 3/7);

    const datanut = df_subsetbestyields.map(row => {
        const yieldVal = parseFloat(row[target]);
        let category = 'High'; // Default to High
        if (yieldVal <= q1_thresh) {
            category = 'Low';
        } else if (yieldVal <= q2_thresh) {
            category = 'Medium';
        }
        return { ...row, category: category };
    });


    var app_rec = {};
    for (const val of ['Low', 'Medium', 'High']) {
        //console.log("\nCategory:", val);
        const datanutsubset = datanut.filter(row => row.category === val);
        if (datanutsubset.length === 0) {
            console.log(`No data in category: ${val}`);
            continue;
        }

        const columnsForMedian = ['day1', 'day2', 'day3', 'n1', 'n2', 'n3', 'crop_yield', 'total_nitrogen'];
        const datanutsubsetv = {};

        for (const col of columnsForMedian) {
            const colValues = datanutsubset.map(row => parseFloat(row[col])).filter(num => !isNaN(num));
            datanutsubsetv[col] = calculateMedian(colValues);
        }
        let yield_improvement = ((datanutsubsetv['crop_yield'] - yield_base) / yield_base) * 100

        //console.log("Median values for category:", datanutsubsetv);
        app_rec[val] = [[datanutsubsetv['day1'],datanutsubsetv['n1']],
                        [datanutsubsetv['day2'],datanutsubsetv['n2']],
                        [datanutsubsetv['day3'],datanutsubsetv['n3']],
                        [datanutsubsetv['crop_yield'], yield_improvement]];
        // messages_tp_eng.push(...) or messages_tp_sp.push(...) based on datanutsubsetv
    }
    const output = { best_yield: app_rec['High'] , secondbest_yield: app_rec['Low'], 
        filtered_data: datanut, thresholds: [q1_thresh, q2_thresh, quantileThreshold]};
    //console.log("Final output object:", output);

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

function application_messages(best_yield_summary, pH, som) {
    const tr_dict = {
        'en': {
            'start': "For the {app_num_str} application,",
            'day': "Apply the fertilizer in the day {day_value} after planting",
            'amount': "use  {n_value} kg/ha of nitrogen",
            'order': ['first', 'second', 'third'],
            'join': 'and',
            'default': "No relevant recommendation could be identified.",
            'note1': `<li>These recommendations can increase potential yield by <strong>{yield_percentage} %</strong> compared to a crop without fertilizer application.</li>
            <li>This increase is achieved by applying a total of <strong>{total_nitrogen} kg/ha</strong>, which can be distributed according to your agronomic management.</li>`,
            'notephlow': `<li>The pH value is <strong>{pH}</strong>, indicating soil acidity issues. A correction is recommended, such as liming.</li>`,
            'notephhigh': `<li>The pH value is <strong>{pH}</strong>, indicating that the soil is alkaline. It is recommended to use highly assimilable sources and/or organic fertilization.</li>`,
            'noteph': `<li>The pH value is <strong>{pH}</strong>.</li>`,
            'notesom': '<li>The organic matter value is <strong>{som} %</strong>.</li>',
            'note2': `<li>The analyses were performed for the planting date <strong>{month_day}</strong> based on the <strong> specific soil and historical climate conditions (1990-2024) of this village</strong>.</li><br>
                <strong>Important:</strong> Use this guide as a reference and always combine it with <strong>the advice of a local expert.</strong>`
            },
        'sp': {
            'start': 'Para la {app_num_str} applicación,',
            'day': "Aplicar en el día {day_value} después de siembra, ",
            'amount': "usar {n_value} kg/ha de nitrógeno",
            'order': ['primera', 'segunda', 'tercera'],
            'join': 'y',
            'default': "No se pudo identificar una recomendación relevante.",
            'note0': `<li>Estas recomendaciones permiten aumentar el rendimiento en un <strong>{yield_percentage} %</strong>, respecto al cultivo simulado. </li> <li>Este incremento se obtiene aplicando un total de <strong>{total_nitrogen} kg/ha</strong>, que puede ser distribuido de acuerdo a su manejo agrónomico.`,
            
            'note1': `<li>Estas recomendaciones permiten aumentar el rendimiento en un <strong>{yield_percentage} %</strong>, respecto a un cultivo sin aplicación de fertilizantes. </li> <li>Este incremento se obtiene aplicando un total de <strong>{total_nitrogen} kg/ha</strong>, que puede ser distribuido de acuerdo a su manejo agrónomico.`,
            'notephlow': `<li>El valor de pH es <strong>{pH}</strong>, este valor de pH indica problemas de acidez en el suelo, se recomienda una correción, como por ejemplo encalamiento.`,
            'notephhigh': `<li>El valor de pH es <strong>{pH}</strong>, este valor de pH indica que el suelo es alcalino, se recomienda usar fuentes de alta asimilicaión y/o usar fertilización orgánica.`,
            'noteph': `<li>El valor de pH es <strong>{pH}</strong>.`,
            'notesom': `<li>El valor de materia orgánica es <strong>{som} %</strong>.`,
            'note2': `<li>Los análisis se realizaron para la fecha de siembra <strong>{month_day}</strong> según las <strong>condiciones específicas de suelo y clima promedio histórico (1990-2024) de esta aldea</strong>.</li><br>
                <strong>Importante:</strong> Use esta guía como una referencia y combínela siempre con el <strong>asesoramiento de un experto local</strong>.`

            }
    };
    
    const lang = 'eng'
    const month_day_key = params['month_day'];

    let yield_split_results = best_yield_summary;
    
    let sentences = {};
    const varnames = ['sentence1', 'sentence2', 'sentence3'];
    for(let appIndex = 0; appIndex<3; appIndex++){
        let sentenceParts = [];
        let appDay = yield_split_results[appIndex][0];
        let appAmount = yield_split_results[appIndex][1];
        //sentenceParts.push(formatString(tr_dict[lang]['start'], { app_num_str: tr_dict[lang].order[appIndex]}));
        if(yield_split_results[3][1]>5){
            sentenceParts.push(formatString(tr_dict[lang]['day'], { day_value: appDay.toFixed(0)}));
            sentenceParts.push(formatString(tr_dict[lang]['amount'], { n_value: appAmount.toFixed(0)}));
        }else{
            sentenceParts.push(tr_dict[lang]['default']);
            sentenceParts.push(['']);
        }

        sentences[varnames[appIndex]]=  sentenceParts;
    }
    var total_nitrogen = yield_split_results[0][1]+yield_split_results[1][1]+yield_split_results[2][1];
    var month_day_string = formatDateString(month_day_key, lang);
    var final_message = formatString('');
    if(yield_split_results[3][1]>5){
        final_message = final_message + formatString(tr_dict[lang]['note1'], { yield_percentage: yield_split_results[3][1].toFixed(1),
            total_nitrogen: total_nitrogen.toFixed(0)
        });
    }
    if(pH < 6){
        final_message = final_message + formatString(tr_dict[lang]['notephlow'], { pH: pH.toFixed(1)});
    }else if (pH > 7){
        final_message = final_message + formatString(tr_dict[lang]['notephhigh'], { pH: pH.toFixed(1)});
    }else{
        final_message = final_message + formatString(tr_dict[lang]['noteph'], { pH: pH.toFixed(1)});
    }
    final_message = final_message + formatString(tr_dict[lang]['notesom'], { som: som.toFixed(2)});

    final_message = final_message + formatString(tr_dict[lang]['note2'], {
            month_day: month_day_string
        });
    sentences['final_note'] = final_message
    return sentences;
    
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
  

const soil_texture = 'clay';
const month_day_key = "06-13"; 
const crop = 'bean';
//const cultivar = 'IB1072'; 
const cultivar = 'IB0006'; 
const geocode = '070116';
const language = 'spn'; // or eng
const path = `data/nitrogen/`;

const params = {
    language: language,
    month_day:   month_day_key,
    working_path: path,
    soiltxt_env: soil_texture,
    crop_cultivar: `${crop}_${cultivar}`,
    yield_upper_threshold: 0.98
};

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

// --- Main Logic ---
document.addEventListener('DOMContentLoaded', async () => {



    const lang = params['language'];
    const working_path = params['working_path'];
    const stxt_env = params['soiltxt_env'];
    const month_day_key = params['month_day'];
    const fn_code = params['crop_cultivar'];
    const crop = 'maize'
    const quantile_value = params['yield_upper_threshold'];
    let yield_split_results = await processAgronomicData(working_path, stxt_env, 
        fn_code, month_day_key, 
        quantile_value);
    const sim_values = await table_properties(working_path, stxt_env, crop)
    
    const farmer_nitrogen = sim_values['total_nitrogen']; // ***** ESTO CAMBIA CON LOS DATOS DE LA SIMULACION
    const farmer_yield = 1000; // ***** ESTO CAMBIA CON LOS DATOS DE LA SIMULACION
    
    console.log("Table values:", sim_values['pH']);

    var total_nitrogen = yield_split_results['best_yield'][0][1]+yield_split_results['best_yield'][1][1]+yield_split_results['best_yield'][2][1];
    var yield_percentage = yield_split_results['best_yield'][3][1];
    //var total_nitrogen2 = yield_split_results['secondbest_yield'][0][1]+yield_split_results['secondbest_yield'][1][1]+yield_split_results['secondbest_yield'][2][1]
    var best_yield = yield_split_results['best_yield'][3][0];
    //var best_yield2 = yield_split_results['secondbest_yield'][3][0]
    var thresholds = yield_split_results['thresholds'];
    const filteredData = yield_split_results['filtered_data'];


    if (filteredData.length === 0) {
        document.getElementById('chart-container').innerText = `No data found for date: ${month_day_key}.`;
        return;
    }
    const raw_targetval = getColumnAsNumbers(filteredData, 'crop_yield');
    
    const raw_nitrogen = getColumnAsNumbers(filteredData, 'total_nitrogen');
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
            yield_split_results['best_yield'][2][0],yield_split_results['best_yield'][2][1] //app 1
        ]
    }
     

    const initialChartOptions = {
        tooltip: {
            trigger: 'item',
            formatter: function (params) {
                    return `Nitrogen: ${params.value[0]} kg/ha<br/>
                    Crop Yield: ${params.value[1].toFixed(0)} kg/ha`;
                }
        },
        grid: { left: '15%', right: '10%', bottom: '10%', containLabel: true },
        xAxis: {
            type: 'value', name: 'Nitrogen (kg/ha)', nameLocation: 'middle', nameGap: 40,
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
                            return `Nitrogen: ${params.value[0]} kg/ha<br/>
                            Crop Yield: ${params.value[1].toFixed(0)} kg/ha<br/>
                            Day ${params.value[2].toFixed(0)} | N ${params.value[3].toFixed(0)} kg/ha<br/>
                            Day ${params.value[4].toFixed(0)} | N ${params.value[5].toFixed(0)} kg/ha<br/>
                            Day ${params.value[6].toFixed(0)} | N ${params.value[7].toFixed(0)} kg/ha<br/>`;
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
                lineStyle: { width: 4, color: '#0000ff' } 
            },
            // Series 3: Horizontal line for yield
            {
                name: 'Farmer yield ref', 
                type:'line',
                data:[],
                markLine : {
                    label: {              
                        show: true,
                        position: 'insideEndTop',
                        formatter: '{b}' 
                    },
                    silent: true,  
                    lineStyle: {
                        color: '#ffa500', 
                        type: 'dashed',
                        width: 2},
                    data : [
                        {name: 'Rendimiento simulado', yAxis: farmer_yield}]
                    }
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
    const myChart = initChart('chart-container', initialChartOptions);

    console.log('Recommendations Logic: Script started.');
    let recommendations = application_messages(yield_split_results['best_yield'], sim_values['pH'], sim_values['som']);
    for (let i = 1; i <= 3; i++){
        var recElement = document.getElementById('rec-box-'+i+'-content');
        var sentence = `${recommendations['sentence'+i][0]}${recommendations['sentence'+i][1]}`;
        recElement.textContent = sentence;
    }

    var noteElement = document.getElementById('rec-note-content');
    var sentence = recommendations['final_note'];
    noteElement.innerHTML  = sentence;
})