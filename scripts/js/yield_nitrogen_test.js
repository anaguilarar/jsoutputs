/*
 * Local test harness for the production "potential yield click -> nitrogen scatter" handler.
 *
 * Layout of this file:
 *   1. LOCAL SHIMS      things the production page provides (Lang, resultsAldea, draw_potentialyieldweather, log)
 *   2. HELPERS          copied from nitrogen_scatter_plot_.js (with guards so a missing file reports instead of crashing)
 *   3. YIELD CHART      builds potentialYieldChart from data/yield_data_<texture>.csv
 *   4. CLICK HANDLER    the production code. Every local change is marked with "LOCAL TEST"
 *
 * URL shortcuts: yield_nitrogen_test.html?texture=loam&date=05-07  (selects the texture and simulates the click)
 */

// ---------------------------------------------------------------------------------------------
// 1. LOCAL SHIMS
// ---------------------------------------------------------------------------------------------
const LOCAL_LABELS = {
    "modeladocultivo.label_nitrogenkgha": "Nitrógeno (kg/ha)",
    "modeladocultivo.label_cropyieldkgha": "Rendimiento (kg/ha)",
    "modeladocultivo.label_potentialyield": "Rendimiento potencial (kg/ha)",
    "modeladocultivo.label_simulateddata": "Datos simulados",
    "modeladocultivo.label_recommendation": "Recomendación",
    "modeladocultivo.label_trend": "Tendencia",
    "modeladocultivo.label_simulatedyield": "Rendimiento simulado",
    "modeladocultivo.label_farmernitrogenref": "Nitrógeno del manejo",
    "modeladocultivo.label_day": "Día",
    "modeladocultivo.label_plantingdate": "Fecha de siembra"
};
// Production uses the Laravel translation object. Unknown keys come back as the key so they are easy to spot.
const Lang = { get: key => LOCAL_LABELS[key] || key };

let resultsAldea = null;      // production fills this from the map search; null -> falls back to #aldea
let farmer_yield = null;      // implicit global in the production snippet
let potentialYieldChart = null;

function draw_potentialyieldweather(monthDay) {
    logStep('info', `draw_potentialyieldweather("${monthDay}") called (stub, not part of this test)`);
}

function logStep(kind, message) {
    const row = document.createElement('div');
    row.className = kind;
    const tag = { ok: '[ OK ]', warn: '[WARN]', error: '[FAIL]', info: '[    ]' }[kind] || '[    ]';
    row.textContent = `${tag} ${message}`;
    const box = document.getElementById('status-log');
    box.appendChild(row);
    box.scrollTop = box.scrollHeight;
    (kind === 'error' ? console.error : console.log)(message);
}

function clearLog() {
    document.getElementById('status-log').innerHTML = '';
}

// ---------------------------------------------------------------------------------------------
// 2. HELPERS (from nitrogen_scatter_plot_.js)
// ---------------------------------------------------------------------------------------------
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

// LOCAL TEST: returns null (and logs) when the file is missing or is not JSON, instead of throwing.
async function loadData(path) {
    let response;
    try {
        response = await fetch(path);
    } catch (err) {
        logStep('error', `${path}: request failed (${err.message}). Is the page served over http://?`);
        return null;
    }
    if (!response.ok) {
        logStep('error', `${path}: HTTP ${response.status} (file not found?)`);
        return null;
    }
    try {
        const data = await response.json();
        logStep('ok', `${path}: loaded ${Array.isArray(data) ? data.length + ' rows' : 'object'}`);
        return data;
    } catch (err) {
        logStep('error', `${path}: not valid JSON (${err.message})`);
        return null;
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

async function processAgronomicData(working_path, stxt_env, fn_code, month_day_key, quantile_value) {
    const fn = `${working_path}nitrogen_results_${stxt_env}_${fn_code}.json`;
    const target = 'crop_yield';
    const datanut_all = await loadData(fn);
    if (!Array.isArray(datanut_all) || datanut_all.length === 0) return null;

    const columnNames = Object.keys(datanut_all[0]);
    const napps = columnNames.filter(x => x.startsWith("n")).length;

    const filteredData = filterData(datanut_all, "month_day", month_day_key);
    // LOCAL TEST: without this guard the code below fails with "Cannot read properties of undefined (reading '0')".
    if (filteredData.length === 0) {
        const keys = [...new Set(datanut_all.map(r => r.month_day))];
        logStep('error', `${fn}: no rows with month_day = "${month_day_key}". Dates in the file: ${keys.join(', ')}`);
        return null;
    }
    logStep('ok', `month_day "${month_day_key}": ${filteredData.length} simulations, ${napps} nitrogen applications`);

    let yield_base = filterData(filteredData, "total_nitrogen", 0);
    yield_base = yield_base.map(row => parseFloat(row[target])).filter(val => !isNaN(val));
    if (yield_base.length !== 1) {
        logStep('warn', `expected exactly 1 zero-nitrogen simulation as baseline, found ${yield_base.length}`);
    }
    const targetValues = filteredData.map(row => parseFloat(row[target])).filter(val => !isNaN(val));
    const quantileThreshold = calculateQuantile(targetValues, quantile_value);

    let df_subsetbestyields = filterDataLessThan(filteredData, 'crop_yield', quantileThreshold);
    df_subsetbestyields = filterDataGreatherThan(df_subsetbestyields, 'crop_yield', 0);

    const yield_value = df_subsetbestyields.map(row => parseFloat(row[target]));

    const minY = Math.min(...yield_value);
    const maxY = Math.max(...yield_value);
    const seriesData_n = yield_value.map(p => [p, (p - minY) / (maxY - minY)]);
    const m = seriesData_n.filter(row => row[1] < 0.90).sort((a, b) => b[1] - a[1]);
    const yieldsForCat = df_subsetbestyields.map(row => parseFloat(row[target])).filter(val => !isNaN(val)).sort((a, b) => a - b);
    const q1_thresh = calculateQuantile(yieldsForCat, 1 / 10);
    if (m.length === 0) {
        logStep('error', `month_day "${month_day_key}": yields have no spread (min = max = ${minY}), thresholds cannot be computed`);
        return null;
    }
    const q2_thresh = m[0][0];

    const datanut = df_subsetbestyields.map(row => {
        const yieldVal = parseFloat(row[target]);
        let category = 'High';
        if (yieldVal <= q1_thresh) {
            category = 'Low';
        } else if (yieldVal <= q2_thresh) {
            category = 'Medium';
        }
        return { ...row, category: category };
    });

    const app_rec = {};
    for (const val of ['Low', 'Medium', 'High']) {
        let datanutsubset = datanut.filter(row => row.category === val);
        if (datanutsubset.length === 0) {
            logStep('warn', `no simulations in category ${val}`);
            continue;
        }
        datanutsubset = datanutsubset.sort((a, b) => a.total_nitrogen - b.total_nitrogen);
        const datanutsubsetv = datanutsubset[0];

        const yield_improvement = ((datanutsubsetv['crop_yield'] - yield_base) / yield_base) * 100;
        const aggregated_data = [];
        for (let i = 0; i < napps; i++) {
            aggregated_data.push([datanutsubsetv[`day${i + 1}`], datanutsubsetv[`n${i + 1}`]]);
        }
        aggregated_data.push([datanutsubsetv['crop_yield'], yield_improvement]);
        app_rec[val] = aggregated_data;
    }
    if (!app_rec['High']) {
        logStep('error', 'no "High" category, so there is no best_yield recommendation');
        return null;
    }

    const output = {
        best_yield: app_rec['High'], secondbest_yield: app_rec['Low'],
        filtered_data: datanut, thresholds: [q1_thresh, q2_thresh, quantileThreshold]
    };
    console.log('processAgronomicData output', output);
    return [output, napps];
}

async function table_properties(working_path, stxt_env, crop) {
    const fn = `${working_path}soil_and_nitrogen_values_${crop}.json`;
    let table_data = await loadData(fn);
    if (!Array.isArray(table_data)) return null;

    const textures = table_data.map(r => r.texture);
    table_data = filterData(table_data, "texture", stxt_env);
    if (table_data.length === 0) {
        logStep('error', `${fn}: no row for texture "${stxt_env}". Textures in the file: ${textures.join(', ')}`);
        return null;
    }

    const phvalue = table_data.map(row => parseFloat(row['phh2o'])).filter(val => !isNaN(val));
    const somvalue = table_data.map(row => parseFloat(row['som'])).filter(val => !isNaN(val));
    const tnitrogen = table_data.map(row => parseFloat(row['total_nitrogen'])).filter(val => !isNaN(val));

    const output = { pH: phvalue[0], som: somvalue[0], total_nitrogen: tnitrogen[0] };
    logStep('ok', `soil table for "${stxt_env}": pH ${output.pH}, SOM ${output.som}, farmer nitrogen ${output.total_nitrogen}`);
    return output;
}

function formatString(template, values) {
    let formattedString = template;
    for (const key in values) {
        const regex = new RegExp(`\\{${key}\\}`, 'g');
        formattedString = formattedString.replace(regex, values[key]);
    }
    return formattedString;
}

function formatDateString(dateStr, language) {
    const parts = dateStr.split('-');
    const monthNum = parseInt(parts[0], 10);
    const dayNum = parseInt(parts[1], 10);
    if (isNaN(monthNum) || isNaN(dayNum) || monthNum < 1 || monthNum > 12 || dayNum < 1 || dayNum > 31) {
        console.error("Invalid month or day number. Received:", dateStr);
        return dateStr;
    }
    const monthNames = {
        'en': ["January", "February", "March", "April", "May", "June",
            "July", "August", "September", "October", "November", "December"],
        'es': ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
            "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"]
    };
    return `${monthNames[language][monthNum - 1]} ${dayNum}`;
}

function application_messages(best_yield_summary, month_day_key, lang, pH, som, farmer_yield, farmer_nitrogen) {
    const tr_dict = {
        'en': {
            'day': "Apply the fertilizer in the day {day_value} after planting",
            'amount': "use  {n_value} kg/ha of nitrogen",
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
            'day': "Aplicar en el día {day_value} después de siembra, ",
            'amount': "usar {n_value} kg/ha de nitrógeno",
            'default': "No se pudo identificar una recomendación relevante.",
            'note00': `<li>Con estas recomendaciones, el rendimiento podría aumentar aproximadamente un <strong>{yield_improvement} %</strong> en comparación con el rendimiento obtenido del cultivo bajo las condiciones manejo agronómico inicialmente ingresadas.</li>`,
            'note01': `<li>No se identificaron estrategias de fertilización con nitrógeno que mejoren el rendimiento simulado con las condiciones de manejo agronómico inicialmente ingresadas. </li>`,
            'note1': `<li>Comparado con un cultivo sin fertilización nitrogenada, estas recomendaciones podrían aumentar el rendimiento aproximadamente un <strong>{yield_percentage} %</strong>. </li> <li>Este incremento se obtendría aplicando un total de <strong>{total_nitrogen} kg N/ha</strong>, que puede ser distribuido de acuerdo a su manejo agrónomico.`,
            'notephlow': `<li>El valor promedio de pH estimado es aproximadamente <strong>{pH}</strong>, este valor de pH indica problemas de acidez en el suelo, se recomienda una correción, por ejemplo encalamiento.`,
            'notephhigh': `<li>El valor promedio de pH estimado es aproximadamente <strong>{pH}</strong>, este valor de pH indica que el suelo es alcalino, se recomienda usar fuentes de alta asimilicaión y/o usar fertilización orgánica.`,
            'noteph': `<li>El valor promedio de pH estimado es aproximadamente <strong>{pH}</strong>. Se encuentra en un rango óptimo`,
            'notesom': `<li>El valor promedio de materia orgánica estimada es aproximadamente <strong>{som} %</strong>.`,
            'note2': `<li>Los análisis se realizaron para la fecha de siembra <strong>{month_day}</strong> según las <strong>condiciones específicas de suelo y clima promedio histórico (1990-2024) de esta aldea</strong>.</li><br>
                <div class='div_small'><strong>Importante:</strong> Use esta guía como una referencia y combínela siempre con el <strong>asesoramiento de un experto local.</strong><div>`
        }
    };

    const np = best_yield_summary.length - 1;     // number of applications; the last entry is [yield, % improvement]
    const n_simulatedyield = best_yield_summary[np][0];

    let yield_improvement = ((n_simulatedyield - farmer_yield) / farmer_yield) * 100;
    yield_improvement = yield_improvement < 0 ? 0 : parseFloat(yield_improvement.toFixed(1));

    const sentences = {};
    for (let appIndex = 0; appIndex < np; appIndex++) {
        const sentenceParts = [];
        const appDay = best_yield_summary[appIndex][0];
        const appAmount = best_yield_summary[appIndex][1];
        if (yield_improvement > 1 && best_yield_summary[np][1] > 5) {
            sentenceParts.push(formatString(tr_dict[lang]['day'], { day_value: appDay.toFixed(0) }));
            sentenceParts.push(formatString(tr_dict[lang]['amount'], { n_value: appAmount.toFixed(0) }));
        } else {
            sentenceParts.push(tr_dict[lang]['default']);
            sentenceParts.push('');
        }
        sentences['sentence' + (appIndex + 1)] = sentenceParts;
    }

    let total_nitrogen = 0;
    for (let i = 0; i < np; i++) total_nitrogen += best_yield_summary[i][1];

    const month_day_string = formatDateString(month_day_key, lang);
    let final_message = '';

    if (yield_improvement > 1) {
        final_message += formatString(tr_dict[lang]['note00'], { yield_improvement: yield_improvement });
    } else {
        final_message += tr_dict[lang]['note01'];
    }
    if (best_yield_summary[np][1] > 5 && farmer_nitrogen !== 0) {
        final_message += formatString(tr_dict[lang]['note1'], {
            yield_percentage: best_yield_summary[np][1].toFixed(1),
            total_nitrogen: total_nitrogen.toFixed(0)
        });
    }
    if (pH < 6) {
        final_message += formatString(tr_dict[lang]['notephlow'], { pH: pH.toFixed(1) });
    } else if (pH > 7) {
        final_message += formatString(tr_dict[lang]['notephhigh'], { pH: pH.toFixed(1) });
    } else {
        final_message += formatString(tr_dict[lang]['noteph'], { pH: pH.toFixed(1) });
    }
    final_message += formatString(tr_dict[lang]['notesom'], { som: som.toFixed(1) });
    final_message += formatString(tr_dict[lang]['note2'], { month_day: month_day_string });

    sentences['final_note'] = final_message;
    return sentences;
}

function getSmoothValues(data, bandwidth) {
    const loessRegression = d3.regressionLoess()
        .x(d => d.nitrogen)
        .y(d => d.yield)
        .bandwidth(bandwidth);
    return loessRegression(data);
}

function getColumnAsNumbers(data, columnName) {
    return data.map(item => {
        const value = parseFloat(item[columnName]);
        return isNaN(value) ? null : value;
    });
}

// LOCAL TEST: disposes a previous instance first, because the handler may have replaced the div content with a message.
function initChart(elementId, options) {
    const chartDom = document.getElementById(elementId);
    if (!chartDom) {
        console.error(`Chart container with id "${elementId}" not found.`);
        return null;
    }
    const previous = echarts.getInstanceByDom(chartDom);
    if (previous) previous.dispose();
    chartDom.innerHTML = '';
    const myChart = echarts.init(chartDom);
    myChart.setOption(options);
    window.addEventListener('resize', () => { if (!myChart.isDisposed()) myChart.resize(); });
    return myChart;
}

// ---------------------------------------------------------------------------------------------
// 3. YIELD CHART (local stand-in for the production potentialYieldChart)
//    Expects the columns of yield_data_loam.csv: pdat_year_month_day, month_day, y, y_upper, y_lower
// ---------------------------------------------------------------------------------------------
const YIELD_COLUMNS = ['pdat_year_month_day', 'month_day', 'y', 'y_upper', 'y_lower'];

async function loadYieldCsv(path) {
    let response;
    try {
        response = await fetch(path);
    } catch (err) {
        logStep('error', `${path}: request failed (${err.message}). Is the page served over http://?`);
        return null;
    }
    if (!response.ok) {
        logStep('error', `${path}: HTTP ${response.status} (file not found?)`);
        return null;
    }
    const parsed = Papa.parse(await response.text(), { header: true, dynamicTyping: true, skipEmptyLines: true });
    const missing = YIELD_COLUMNS.filter(c => !parsed.meta.fields.includes(c));
    if (missing.length > 0) {
        logStep('error', `${path}: missing columns ${missing.join(', ')}. Found: ${parsed.meta.fields.join(', ')}`);
        return null;
    }

    const rows = [];
    let skipped = 0;
    for (const row of parsed.data) {
        const [yy, mm, dd] = String(row.pdat_year_month_day).split('-').map(Number);
        const timestamp = Date.UTC(yy, mm - 1, dd);     // UTC, same convention the click handler uses to read it back
        if (!isFinite(timestamp) || typeof row.y !== 'number' || !isFinite(row.y)) { skipped++; continue; }
        rows.push({ timestamp, month_day: row.month_day, y: row.y, y_upper: row.y_upper, y_lower: row.y_lower });
    }
    rows.sort((a, b) => a.timestamp - b.timestamp);
    logStep(rows.length > 0 ? 'ok' : 'error', `${path}: ${rows.length} planting dates` + (skipped ? `, ${skipped} rows skipped (bad date or yield)` : ''));
    return rows.length > 0 ? rows : null;
}

// Compares the planting dates of the yield CSV against the month_day keys of the nitrogen JSON,
// so a mismatch is visible before clicking anything.
async function preflightCheck(yieldRows) {
    const texture = $('input[name="texture"]:checked').val();
    const crop = $("#crop").val();
    const fn = `${$("#local-nitrogen-path").val()}nitrogen_results_${texture}_${crop}_${$("#variety").val()}.json`;
    const nitrogen = await loadData(fn);
    if (Array.isArray(nitrogen)) {
        const keys = new Set(nitrogen.map(r => r.month_day));
        const unmatched = yieldRows.map(r => r.month_day).filter(md => !keys.has(md));
        if (unmatched.length === 0) {
            logStep('ok', 'every planting date of the yield CSV has nitrogen simulations');
        } else {
            logStep('error', `${unmatched.length} of ${yieldRows.length} planting dates have no nitrogen simulations: ${unmatched.join(', ')}`);
            logStep('info', `dates in the nitrogen file: ${[...keys].join(', ')}`);
        }
    }
    await table_properties($("#pathresults").val(), texture, crop);
}

async function drawPotentialYield() {
    clearLog();
    $("#div-session-potentialyield").addClass('d-none');
    const texture = $('input[name="texture"]:checked').val();
    const path = `${$("#local-yield-path").val()}yield_data_${texture}.csv`;

    const chartDom = document.getElementById('chartPotentialyield');
    if (potentialYieldChart) { potentialYieldChart.dispose(); potentialYieldChart = null; }
    chartDom.innerHTML = '';

    const rows = await loadYieldCsv(path);
    if (!rows) {
        chartDom.innerText = `Could not draw ${path}, see the log above.`;
        return;
    }

    const band = { type: 'line', stack: 'band', symbol: 'none', silent: true, lineStyle: { opacity: 0 }, tooltip: { show: false } };
    potentialYieldChart = echarts.init(chartDom);
    potentialYieldChart.setOption({
        title: { text: `yield_data_${texture}.csv`, left: 'center', textStyle: { fontSize: 14 } },
        tooltip: {
            trigger: 'item',
            formatter: p => `${new Date(p.data[0]).toISOString().slice(5, 10)}<br/>${p.data[1].toFixed(0)} kg/ha`
        },
        grid: { top: 60, left: 90, right: 40, bottom: 60 },
        xAxis: { type: 'time', name: Lang.get("modeladocultivo.label_plantingdate"), nameLocation: 'middle', nameGap: 35 },
        yAxis: { type: 'value', name: Lang.get("modeladocultivo.label_potentialyield"), nameLocation: 'middle', nameGap: 65, scale: true },
        series: [
            { ...band, name: 'lower', data: rows.map(r => [r.timestamp, r.y_lower]) },
            { ...band, name: 'range', data: rows.map(r => [r.timestamp, r.y_upper - r.y_lower]), areaStyle: { color: '#3eb03a', opacity: 0.2 } },
            // The clickable series: data[0] = planting date (UTC timestamp), data[1] = yield, as the handler expects.
            { name: 'yield', type: 'line', data: rows.map(r => [r.timestamp, r.y]), symbolSize: 10, itemStyle: { color: '#19923e' }, z: 5 }
        ]
    });

    potentialYieldChart.on("click", onPotentialYieldClick);
    await preflightCheck(rows);
    return rows;
}

// ---------------------------------------------------------------------------------------------
// 4. CLICK HANDLER (production code; in production it is the anonymous function passed to
//    potentialYieldChart.on("click", ...))
// ---------------------------------------------------------------------------------------------
function onPotentialYieldClick(params) {
    if (params.componentType === "series") {
        let timestamp = params.data[0]; // Obtener fecha

        farmer_yield = params.data[1];


        let dateObj = new Date(timestamp);

        // Obtener siempre en UTC para evitar desfase de zona horaria
        let formattedMonthday = (`0${dateObj.getUTCMonth() + 1}`).slice(-2) + "-" + (`0${dateObj.getUTCDate()}`).slice(-2);

        logStep('info', `--- click: planting date ${formattedMonthday}, simulated yield ${Number(farmer_yield).toFixed(0)} kg/ha ---`); // LOCAL TEST

        $("#div-session-potentialyield").removeClass('d-none');
        draw_potentialyieldweather(formattedMonthday);

        let soil_texture = $('input[name="texture"]:checked').val();
        let month_day_key = formattedMonthday;
        let crop = $("#crop").val();
        let cultivar = $("#variety").val();
        let geocode = resultsAldea || $("#aldea").val();
        let language = 'es';
        let pathresults = $("#pathresults").val();

        $("#nitrogen_scatter").addClass('d-none');

        async function main() {
            let working_path = ''
            if (crop == 'bean') {
                working_path = 'storage/nitrogen_simulations/' + crop + '/runs_bayesian2/' + geocode + '/';
            } else {
                working_path = 'storage/nitrogen_simulations/' + crop + '/runs_bayesian/' + geocode + '/';
            }
            working_path = $("#local-nitrogen-path").val(); // LOCAL TEST: read from the local folder instead of storage/

            const stxt_env = soil_texture;
            const fn_code = crop + '_' + cultivar;
            const quantile_value = 0.98;

            // Esperar el resultado de la función async
            let results = await processAgronomicData(working_path, stxt_env, fn_code, month_day_key, quantile_value);
            const valuePh_Som_N = await table_properties(pathresults, stxt_env, crop);

            // Sin simulaciones de nitrógeno para la aldea (o sin datos del suelo) no hay recomendaciones:
            // se quitan las de un punto anterior. Antes la página fallaba
            if (results === null || valuePh_Som_N === null) {
                for (let i = 1; i <= 3; i++) {
                    $("#div-recommendation-box-" + i).addClass('d-none');
                }
                logStep('error', 'no nitrogen results or no soil values: recommendations hidden, nothing drawn'); // LOCAL TEST
                return;
            }
            let yield_split_results = results[0]
            let napps = results[1]

            //////////////////////////////////////////////////
            //////////////////////////////////////////////////
            var total_nitrogen;
            var yield_percentage;
            var best_yield;

            if (napps == 3) {
                total_nitrogen = yield_split_results['best_yield'][0][1] + yield_split_results['best_yield'][1][1] + yield_split_results['best_yield'][2][1];
                yield_percentage = yield_split_results['best_yield'][3][1];
                best_yield = yield_split_results['best_yield'][3][0];
            } else {
                total_nitrogen = yield_split_results['best_yield'][0][1] + yield_split_results['best_yield'][1][1];
                yield_percentage = yield_split_results['best_yield'][2][1];
                best_yield = yield_split_results['best_yield'][2][0];
            }
            //////////////////////////////////////////////////
            //////////////////////////////////////////////////

            let pH = valuePh_Som_N.pH;
            let som = valuePh_Som_N.som;
            let farmer_nitrogen = valuePh_Som_N.total_nitrogen;

            const thresholds = yield_split_results['thresholds'];
            const filteredData = yield_split_results['filtered_data'];

            $("#chartNitrogenscatter").removeClass('d-none');


            if (filteredData.length === 0) {
                document.getElementById('chartNitrogenscatter').innerText = `No data found for date: ${month_day_key}.`;
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
                document.getElementById('chartNitrogenscatter').innerText = "No valid data points to display.";
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

            if (yield_percentage >= 5) {
                if (napps == 3) {
                    best_point_data = [total_nitrogen, best_yield,
                        yield_split_results['best_yield'][0][0], yield_split_results['best_yield'][0][1], //app 1
                        yield_split_results['best_yield'][1][0], yield_split_results['best_yield'][1][1], //app 1
                        yield_split_results['best_yield'][2][0], yield_split_results['best_yield'][2][1] //app 1
                    ]
                }
                else {
                    best_point_data = [total_nitrogen, best_yield,
                        yield_split_results['best_yield'][0][0], yield_split_results['best_yield'][0][1], //app 1
                        yield_split_results['best_yield'][1][0], yield_split_results['best_yield'][1][1], //app 1
                    ]
                }

            }

            const initialChartOptions = {
                legend: { top: 20 },
                tooltip: {
                    trigger: 'item',
                    formatter: function (params) {
                        let html = "";
                        html += "<div>" + Lang.get("modeladocultivo.label_nitrogenkgha") + ": " + params.value[0] + "</div>";
                        html += "<div>" + Lang.get("modeladocultivo.label_cropyieldkgha") + ": " + params.value[1].toFixed(0) + "</div>";
                        return html;
                    }
                },
                grid: { top: 80 },
                xAxis: {
                    type: 'value',
                    name: Lang.get("modeladocultivo.label_nitrogenkgha"),
                    nameLocation: 'middle',
                    nameGap: 40, // Aumenta separación entre etiquetas y nombre del eje
                    nameTextStyle: { // Nombre del eje
                        fontSize: 16,
                        fontWeight: 'bold',

                    },
                    axisLabel: { // Etiquetas del eje
                        fontSize: 14,
                    }
                },
                yAxis: {
                    type: 'value',
                    name: Lang.get("modeladocultivo.label_potentialyield"),
                    nameLocation: 'middle',
                    nameGap: 70, // Aumenta separación entre etiquetas y nombre del eje
                    nameTextStyle: { // Nombre del eje
                        fontSize: 16,
                        fontWeight: 'bold',

                    },
                    axisLabel: { // Etiquetas del eje
                        fontSize: 14,
                        margin: 20, // espacio entre label y eje
                        formatter: value => value.toLocaleString("en-US", {
                            minimumFractionDigits: 0, maximumFractionDigits: 0
                        })

                    },
                    min: targetminval, max: targetmaxval
                },
                series: [
                    {
                        name: Lang.get("modeladocultivo.label_simulateddata"),
                        data: scatterData,
                        symbolSize: 8,
                        itemStyle: { color: '#3eb03a', opacity: 0.3 },
                        type: 'scatter',
                    },
                    // Series 1: Recommendation Point (dynamic data - initial empty)
                    {
                        name: Lang.get("modeladocultivo.label_recommendation"),
                        data: [best_point_data], // Initialize empty, will be updated
                        symbol: 'diamond',
                        symbolSize: 15,
                        itemStyle: { color: '#ff0000', opacity: 1 },
                        type: 'scatter',
                        z: 10,
                        tooltip: {
                            trigger: 'item',
                            formatter: function (params) {
                                let html = "";
                                html += "<div>" + Lang.get("modeladocultivo.label_nitrogenkgha") + ": " + params.value[0] + "</div>";
                                html += "<div>" + Lang.get("modeladocultivo.label_cropyieldkgha") + ": " + params.value[1].toFixed(0) + "</div>";
                                html += "<div>" + Lang.get("modeladocultivo.label_day") + ": " + params.value[2].toFixed(0) + " | " + Lang.get("modeladocultivo.label_nitrogenkgha") + ":" + params.value[3].toFixed(0) + "</div>";
                                html += "<div>" + Lang.get("modeladocultivo.label_day") + ": " + params.value[4].toFixed(0) + " | " + Lang.get("modeladocultivo.label_nitrogenkgha") + ":" + params.value[5].toFixed(0) + "</div>";
                                html += "<div>" + Lang.get("modeladocultivo.label_day") + ": " + params.value[6].toFixed(0) + " | " + Lang.get("modeladocultivo.label_nitrogenkgha") + ":" + params.value[7].toFixed(0) + "</div>";
                                return html;
                            }
                        },
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
                        }
                    },
                    // Series 2: Smoothed Line (static data)
                    {
                        name: Lang.get("modeladocultivo.label_trend"),
                        data: smoothedvalues,
                        type: 'line',
                        smooth: true,
                        showSymbol: false,
                        lineStyle: { width: 2, color: '#0000ff' }
                    },
                    // Series 3: Horizontal line for yield
                    {
                        name: Lang.get("modeladocultivo.label_simulatedyield"),
                        type: 'line',
                        data: [{ x: null, y: null }], // O {x: 0, y: null} para que no afecte el gráfico
                        symbol: 'circle',
                        showSymbol: true,
                        lineStyle: {
                            color: '#a020f0',
                            type: 'dashed',
                            width: 2
                        },
                        itemStyle: {
                            color: '#a020f0'
                        },
                        tooltip: { show: false },
                        markLine: {
                            label: {
                                show: true,
                                position: 'insideEndTop',
                                formatter: '{b}'
                            },
                            silent: true,
                            lineStyle: {
                                color: '#a020f0',
                                type: 'dashed',
                                width: 2
                            },
                            data: [
                                {
                                    name: Lang.get("modeladocultivo.label_simulatedyield"),
                                    yAxis: farmer_yield
                                }
                            ]
                        }
                    },
                    {
                        name: Lang.get("modeladocultivo.label_farmernitrogenref"),
                        type: 'line',
                        data: [{ x: null, y: null }], // O {x: 0, y: null} para que no afecte el gráfico
                        symbol: 'circle',
                        showSymbol: true,
                        lineStyle: {
                            color: '#ffa500',
                            type: 'dashed',
                            width: 2
                        },
                        itemStyle: {
                            color: '#ffa500'
                        },
                        tooltip: { show: false },
                        markLine: {
                            label: {
                                show: true,
                                position: 'insideEndTop',
                                formatter: '{b}'
                            },
                            silent: true,
                            lineStyle: {
                                color: '#ffa500',
                                type: 'dashed',
                                width: 2
                            },
                            data: [
                                {
                                    name: Lang.get("modeladocultivo.label_farmernitrogenref"),
                                    xAxis: farmer_nitrogen
                                }
                            ]
                        }
                    },
                ]
            };

            // ---------------------------------------------------------------------------------
            // LOCAL TEST: the pasted production code ended at initialChartOptions. Everything from
            // here to the end of main() follows nitrogen_scatter_plot_.js and should be replaced
            // by (or compared with) the real continuation of the production handler.
            // ---------------------------------------------------------------------------------
            initChart('chartNitrogenscatter', initialChartOptions);
            logStep('ok', `scatter drawn: ${scatterData.length} points, best yield ${best_yield.toFixed(0)} kg/ha with ${total_nitrogen} kg N/ha (+${yield_percentage.toFixed(1)} % vs no nitrogen)`);
            if (yield_percentage < 5) {
                logStep('warn', 'improvement below 5 %: the recommendation diamond is not drawn');
            }

            let recommendations = application_messages(yield_split_results['best_yield'], month_day_key, language, pH, som, farmer_yield, farmer_nitrogen);
            for (let i = 1; i <= 3; i++) {
                if (i <= napps) {
                    $("#div-recommendation-box-" + i).removeClass('d-none');
                    document.getElementById('rec-box-' + i + '-content').textContent =
                        `${recommendations['sentence' + i][0]}${recommendations['sentence' + i][1]}`;
                } else {
                    $("#div-recommendation-box-" + i).addClass('d-none');
                }
            }
            document.getElementById('rec-note-content').innerHTML = recommendations['final_note'];
            $("#nitrogen_scatter").removeClass('d-none');
            logStep('ok', `recommendations written for ${napps} applications`);
        }

        // LOCAL TEST: report anything that throws inside main() in the log instead of only in the console.
        return main().catch(err => {
            logStep('error', `handler threw: ${err.message}`);
            console.error(err);
        });
    }
}

// ---------------------------------------------------------------------------------------------
// Page wiring
// ---------------------------------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', async () => {
    const query = new URLSearchParams(window.location.search);
    if (query.get('texture')) {
        const radio = $(`input[name="texture"][value="${query.get('texture')}"]`);
        if (radio.length) radio.prop('checked', true);
    }

    $('input[name="texture"]').on('change', drawPotentialYield);
    $('#btn-reload').on('click', drawPotentialYield);
    window.addEventListener('resize', () => { if (potentialYieldChart) potentialYieldChart.resize(); });

    const rows = await drawPotentialYield();

    // ?date=MM-DD simulates a click on that planting date
    const date = query.get('date');
    if (rows && date) {
        const row = rows.find(r => r.month_day === date);
        if (!row) {
            logStep('error', `?date=${date} is not a planting date of the yield CSV`);
        } else {
            await onPotentialYieldClick({ componentType: 'series', data: [row.timestamp, row.y] });
        }
    }
    document.body.setAttribute('data-test-done', '1');
});
