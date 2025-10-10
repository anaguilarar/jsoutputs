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


async function processAgronomicData(working_path, stxt_env, fn_code, month_day_key, quantile_value) {

    // Construct file path - in browser JS, this would be a URL to fetch
    const fn = `${working_path}nitrogen_results_${stxt_env}_${fn_code}.json`;
    console.log("Fetching data from:", fn);
    const target = 'crop_yield'
    let datanut_all;
    datanut_all = await loadData(fn)
    console.log("data loaded from:", fn);

    //const month_day_key = "04-04"; 


    const filteredData = filterData(datanut_all, "month_day", month_day_key);
    var yield_base = filterData(filteredData, "total_nitrogen", 0);
    yield_base = yield_base.map(row => parseFloat(row[target])).filter(val => !isNaN(val));
    console.log(`yield for 0 nitrogen: ${yield_base}`)
        // bestdf = datanut.sort_values(['crop_yield']).loc[datanut[target]>=datanut[target].quantile(quantile_value)].sort_values(['total_nitrogen']).reset_index()
    const targetValues = filteredData.map(row => parseFloat(row[target])).filter(val => !isNaN(val));

    const quantileThreshold = calculateQuantile(targetValues, quantile_value);

    let df_subsetbestyields = filterDataLessThan(filteredData, 'crop_yield', quantileThreshold)


    // datanut['category'] = pd.qcut(datanut['crop_yield'], q=3, labels=['Low', 'Medium', 'High'])
    // Implementing qcut is more involved. Here's a simplified way to categorize:
    const yieldsForCat = df_subsetbestyields.map(row => parseFloat(row[target])).filter(val => !isNaN(val)).sort((a,b) => a-b);
    

    const q1_thresh = calculateQuantile(yieldsForCat, 2/7);
    const q2_thresh = calculateQuantile(yieldsForCat, 5/7);

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


    // for val in ['Low', 'Medium', 'High']:
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
        //console.log("Median values for category:", datanutsubsetv);
        app_rec[val] = [[datanutsubsetv['day1'],datanutsubsetv['n1']],
                        [datanutsubsetv['day2'],datanutsubsetv['n2']],
                        [datanutsubsetv['day3'],datanutsubsetv['n3']],
                        [datanutsubsetv['crop_yield'], 100*(1-(yield_base/datanutsubsetv['crop_yield']))]];
        // messages_tp_eng.push(...) or messages_tp_sp.push(...) based on datanutsubsetv
    }
    const output = { best_yield: app_rec['High'] , secondbest_yield: app_rec['Low'], filtered_data: df_subsetbestyields}
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


async function coffee_application_messages(best_yield_summary, month_day_key, lang, pH, som, farmer_yield, farmer_nitrogen) {

    let n_simulatedyield = best_yield_summary[3][0];
    let yield_improvement = ((n_simulatedyield - farmer_yield) / farmer_yield) * 100;
    yield_improvement = yield_improvement < 0 ? 0 : parseFloat(yield_improvement.toFixed(1));

    const tr_dict = {
        'en': {
            'start': "For the {app_num_str} application,",
            'day': "Apply the fertilizer in the day {day_value} after planting",
            'amount': "use  {n_value} kg/ha of nitrogen",
            'order': ['first', 'second', 'third'],
            'join': 'and',
            'default': "No relevant recommendation could be identified.",
            'note00': `<li>With these recommendations, yield could increase by approximately <strong>{yield_improvement} %</strong> compared to the yield obtained from the crop under the initially entered agronomic management conditions.</li>`,
            'note01': `<li>No nitrogen fertilization strategies were identified that improve the simulated yield under the initially entered agronomic management conditions.</li>`,
            'note1': `<li>Compared to a crop without nitrogen fertilization, these recommendations could increase yield by approximately <strong>{yield_percentage} %</strong>.</li> <li>This increase would be achieved by applying a total of <strong>{total_nitrogen} kg N/ha</strong>, which can be distributed according to your agronomic management.</li>`,
            'notephlow': `<li>The estimated average pH value is approximately <strong>{pH}</strong>. This pH indicates soil acidity problems, and correction is recommended, such as liming.</li>`,
            'notephhigh': `<li>The estimated average pH value is approximately <strong>{pH}</strong>. This pH indicates the soil is alkaline. It is recommended to use highly assimilable sources and/or apply organic fertilization.</li>`,
            'noteph': `<li>The estimated average pH value is approximately <strong>{pH}</strong>. It is within an optimal range.</li>`,
            'notesom': '<li>The estimated average organic matter value is approximately <strong>{som} %</strong>.</li>',
            'note2': `<li>The analyses were performed for the planting date <strong>{month_day}</strong> based on the <strong> specific soil and historical climate conditions (1990-2024) of this village</strong>.</li><br>
                <div class='div_small'><strong>Important:</strong> Use this guide as a reference and always combine it with <strong>the advice of a local expert.</strong><div>`
        },
        'es': {
            'start': 'Para la {app_num_str} applicación,',
            'day': "Aplicar en el día {day_value} después de siembra, ",
            'amount': "usar {n_value} kg/ha de nitrógeno",
            'order': ['primera', 'segunda', 'tercera'],
            'join': 'y',
            'default': "No se pudo identificar una recomendación relevante.",

            'note00': `<li>Con estas recomendaciones, el rendimiento podría aumentar aproximadamente un <strong>{yield_improvement} %</strong> en comparación con el rendimiento obtenido del cultivo bajo las condiciones manejo agronómico inicialmente ingresadas.</li>`,
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
        let sentenceParts = [];
        let appDay = yield_split_results[appIndex][0];
        let appAmount = yield_split_results[appIndex][1];
        //sentenceParts.push(formatString(tr_dict[lang]['start'], { app_num_str: tr_dict[lang].order[appIndex]}));
        if (yield_improvement > 1 && yield_split_results[3][1] > 5) {
            sentenceParts.push(formatString(tr_dict[lang]['day'], { day_value: appDay.toFixed(0) }));
            sentenceParts.push(formatString(tr_dict[lang]['amount'], { n_value: appAmount.toFixed(0) }));
        } else {
            sentenceParts.push(tr_dict[lang]['default']);
            sentenceParts.push(['']);
        }

        sentences[varnames[appIndex]] = sentenceParts;
    }
    var total_nitrogen = yield_split_results[0][1] + yield_split_results[1][1] + yield_split_results[2][1];
    var month_day_string = formatDateString(month_day_key, lang);
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

    final_message = final_message + formatString(tr_dict[lang]['note2'], {
        month_day: month_day_string
    });
    sentences['final_note'] = final_message;
    return sentences;
    
}



document.addEventListener('DOMContentLoaded', async () => {
    console.log('Recommendations Logic: Script started.');
    
    const soil_texture = 'clayloam';
    const month_day_key = "07-25"; 
    const crop = 'maize';
    const cultivar = 'IB1072'; 
    const geocode = '151415';
    const language = 'spn'; // or eng
    const path = `runs_bayesian/${geocode}/`;
    
    const params = {
        language: language,
        month_day:   month_day_key,
        working_path: path,
        soiltxt_env: soil_texture,
        crop_cultivar: `${crop}_${cultivar}`,
        yield_upper_threshold: 0.98
    };

    console.log(params);
    var best_variable = [[0]];
    let recommendations = await application_messages(params);
    console.log(recommendations);
    
    for (let i = 1; i <= 3; i++){
        var recElement = document.getElementById('rec-box-'+i+'-content');
        
        var sentence = `${recommendations['sentence'+i][0]}, ${recommendations['sentence'+i][1]}`;
        console.log('first message: ', sentence)
        recElement.textContent = sentence;
    }

    var noteElement = document.getElementById('rec-note-content');
    var sentence = recommendations['final_note']
    noteElement.innerHTML  = sentence;
})