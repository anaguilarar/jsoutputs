/*
 * P-K yield response heat map from the QUEFTS outputs of WeatherSoilDataProcessor/scripts/quefts_response.py.
 *
 * Data (copied from runs/<GEOCODIGO>/quefts):
 *   data/quefts/quefts_index_<crop>.json                       files with their texture, TRNO and planting day
 *   data/quefts/quefts_response_<crop>_<texture>_trno<NN>.csv  one row per N x P x K rate
 *
 * The texture and planting date menus choose the file, the nitrogen menu filters its rows.
 * The N, P and K rates are added on top of the fertiliser of the DSSAT run (n/p/k_base_kg_ha columns).
 * A click on a cell draws the two response curves through it (P at the clicked K, K at the clicked P)
 * with the variation between years: median and the P25-P75 band. The curves use the total rate (management +
 * extra), with a vertical line at the management rate and a dotted one at the clicked rate.
 * The "Mostrar" menu chooses the value: the gain over the management alone (kg/ha or %, computed year by year,
 * default) or the total yield.
 * URL options: quefts_pk_heatmap.html?crop=bean&data=data/quefts/&texture=loam&date=06-13&n=0&p=40&k=40&show=gain
 *   other villages: ?crop=maize&data=data/quefts/080416/   ?crop=bean&data=data/quefts/151705/
 */

const LOCAL_LABELS = {
    "modeladocultivo.label_cropyieldkgha": "Rendimiento (kg/ha)",
    "modeladocultivo.label_phosphoruskgha": "Fósforo adicional (kg P/ha)",
    "modeladocultivo.label_potassiumkgha": "Potasio adicional (kg K/ha)",
    "modeladocultivo.label_basemanagement": "Fertilización del manejo (N-P-K)",
    "modeladocultivo.label_attainableyield": "Rendimiento alcanzable (mediana)",
    "modeladocultivo.label_yieldgain": "Ganancia",
    "modeladocultivo.label_median": "Mediana",
    "modeladocultivo.label_selectedrate": "Dosis seleccionada",
    "modeladocultivo.label_years": "años",
    "modeladocultivo.label_yieldgainkgha": "Ganancia de rendimiento (kg/ha)",
    "modeladocultivo.label_yieldgainpct": "Ganancia de rendimiento (%)",
    "modeladocultivo.label_managementyield": "Rendimiento con el manejo (mediana)",
    "modeladocultivo.label_management": "Manejo",
    "modeladocultivo.label_phosphorustotalkgha": "Fósforo total (kg P/ha)",
    "modeladocultivo.label_potassiumtotalkgha": "Potasio total (kg K/ha)"
};
// Production uses the Laravel translation object. Unknown keys come back as the key so they are easy to spot.
const Lang = { get: key => LOCAL_LABELS[key] || key };

const params = new URLSearchParams(window.location.search);
const CROP = params.get('crop') || 'bean';
const DATA_PATH = params.get('data') || 'data/quefts/';

const selTexture = document.getElementById('texture');
const selDate = document.getElementById('planting-date');
const selNitrogen = document.getElementById('nitrogen');
const selShow = document.getElementById('show-value');

// value shown in the heat map and the curves: median and P25-P75 band of the CSV columns
const GREENS = ['#f7fcf5', '#c7e9c0', '#74c476', '#238b45', '#00441b'];
const SHOW = {
    gain:  { label: 'modeladocultivo.label_yieldgainkgha', col: 'yield_gain', unit: 'kg/ha', fmt: v => `+${Math.round(v)}`, colors: GREENS },
    pct:   { label: 'modeladocultivo.label_yieldgainpct', col: 'yield_gain_pct', unit: '%', fmt: v => `+${v.toFixed(1)}`, colors: GREENS },
    total: { label: 'modeladocultivo.label_cropyieldkgha', col: 'yield', unit: 'kg/ha', fmt: v => `${Math.round(v)}`,
             colors: ['#a50026', '#f46d43', '#fee08b', '#a6d96a', '#1a9850'] }
};
fillSelect(selShow, [['gain', 'Ganancia (kg/ha)'], ['pct', 'Ganancia (%)'], ['total', 'Rendimiento total (kg/ha)']],
           params.get('show'));
const show = () => SHOW[selShow.value];
const q = (r, pct) => r[`${show().col}_p${pct}`];
const queftsChart = echarts.init(document.getElementById('chartQueftsPK'));
const curveCharts = {
    p: echarts.init(document.getElementById('chartQueftsCurveP')),
    k: echarts.init(document.getElementById('chartQueftsCurveK'))
};
const num = v => (v === null || v === '' || isNaN(Number(v))) ? null : Number(v);
let selected = { p: num(params.get('p')), k: num(params.get('k')) };     // clicked cell (kg/ha), kept between redraws

let queftsIndex = null;
const tableCache = {};      // file name -> rows

function showError(message) {
    document.getElementById('status-log').textContent = message;
    console.error(message);
}

function fillSelect(select, options, wanted) {
    select.innerHTML = '';
    options.forEach(([value, text]) => select.add(new Option(text, value)));
    if (wanted != null && options.some(([value]) => String(value) === String(wanted))) select.value = wanted;
}

function loadTable(file) {
    if (tableCache[file]) return Promise.resolve(tableCache[file]);
    return new Promise((resolve, reject) => {
        Papa.parse(DATA_PATH + file, {
            download: true, header: true, dynamicTyping: true, skipEmptyLines: true,
            complete: results => { tableCache[file] = results.data; resolve(results.data); },
            error: err => reject(new Error(`${DATA_PATH + file}: ${err.message || err}`))
        });
    });
}

function fillDates(wanted) {
    const dates = queftsIndex.files.filter(f => f.texture === selTexture.value);
    fillSelect(selDate, dates.map(f => [f.file, f.planting_day]),
               (dates.find(f => f.planting_day === wanted) || {}).file);
}

async function draw() {
    document.getElementById('status-log').textContent = '';
    let rows;
    try {
        rows = await loadTable(selDate.value);
    } catch (err) {
        return showError(err.message);
    }

    const nRates = [...new Set(rows.map(r => r.n_kg_ha))].sort((a, b) => a - b);
    // the menu shows the season total (management of the DSSAT run + extra N); the value is the extra N of the CSV
    const nBase = rows[0].n_base_kg_ha ?? 0;
    fillSelect(selNitrogen, nRates.map(n => [n, (n === 0 && nBase > 0) ? `${nBase} (manejo)` : `${nBase + n}`]),
               selNitrogen.value || params.get('n'));
    rows = rows.filter(r => r.n_kg_ha === Number(selNitrogen.value));

    const pRates = [...new Set(rows.map(r => r.p_kg_ha))].sort((a, b) => a - b);
    const kRates = [...new Set(rows.map(r => r.k_kg_ha))].sort((a, b) => a - b);
    const values = rows.map(r => q(r, 50));
    const first = rows[0];
    const reference = rows.find(r => r.p_kg_ha === 0 && r.k_kg_ha === 0) || first;

    document.getElementById('summary').textContent =
        `${Lang.get('modeladocultivo.label_attainableyield')}: ${Math.round(first.yield_attainable_p50)} kg/ha ` +
        `(${first.n_years} ${Lang.get('modeladocultivo.label_years')}) · ` +
        `${Lang.get('modeladocultivo.label_managementyield')}: ${Math.round(reference.yield_p50)} kg/ha · ` +
        `${Lang.get('modeladocultivo.label_basemanagement')}: ` +
        `${first.n_base_kg_ha ?? 0}-${first.p_base_kg_ha ?? 0}-${first.k_base_kg_ha ?? 0} kg/ha`;
    document.getElementById('note').textContent =
        'Las dosis de P y K se suman a la fertilización del manejo simulado en DSSAT (0 = solo el manejo). ' +
        'El N adicional es 0: el rendimiento alcanzable de DSSAT ya incluye el N del manejo' +
        (CROP === 'bean' ? ' y QUEFTS no considera respuesta del frijol al N aplicado (cultivo fijador).' : '.');

    queftsChart.setOption({
        tooltip: {
            formatter: p => {
                const r = p.data.row;
                return `P ${r.p_kg_ha} kg/ha (P₂O₅ ${r.p2o5_kg_ha})<br>K ${r.k_kg_ha} kg/ha (K₂O ${r.k2o_kg_ha})<br>` +
                    `<b>${Lang.get('modeladocultivo.label_yieldgain')}: +${Math.round(r.yield_gain_p50)} kg/ha ` +
                    `(+${r.yield_gain_pct_p50.toFixed(1)} %)</b><br>` +
                    `${Lang.get('modeladocultivo.label_yieldgain')} P25–P75: +${Math.round(r.yield_gain_p25)} – ` +
                    `+${Math.round(r.yield_gain_p75)} kg/ha<br>` +
                    `${Lang.get('modeladocultivo.label_cropyieldkgha')}: ${Math.round(r.yield_p50)} ` +
                    `(${Lang.get('modeladocultivo.label_median')})`;
            }
        },
        grid: { left: 70, right: 150, top: 30, bottom: 60 },
        xAxis: {
            type: 'category', data: pRates, name: Lang.get('modeladocultivo.label_phosphoruskgha'),
            nameLocation: 'middle', nameGap: 35, splitArea: { show: true }
        },
        yAxis: {
            type: 'category', data: kRates, name: Lang.get('modeladocultivo.label_potassiumkgha'),
            nameLocation: 'middle', nameGap: 45, splitArea: { show: true }
        },
        visualMap: {
            min: Math.floor(Math.min(...values)), max: Math.ceil(Math.max(...values)) || 1,
            calculable: true, orient: 'vertical', right: 10, top: 'center', itemHeight: 300,
            text: [show().unit, ''], precision: show().unit === '%' ? 1 : 0,
            inRange: { color: show().colors }
        },
        series: [{
            type: 'heatmap',
            data: rows.map(r => ({
                value: [pRates.indexOf(r.p_kg_ha), kRates.indexOf(r.k_kg_ha), q(r, 50)], row: r,
                itemStyle: (r.p_kg_ha === selected.p && r.k_kg_ha === selected.k) ? { borderColor: '#000', borderWidth: 2 } : null
            })),
            label: { show: false },
            emphasis: { itemStyle: { borderColor: '#333', borderWidth: 1 } }
        }]
    }, true);

    drawCurves(rows);
}

// Yield against one nutrient with the other fixed at the clicked rate; the bands are the variation between years.
function drawCurve(chart, rows, nutrient, fixed) {
    const other = nutrient === 'p' ? 'k' : 'p';
    const curve = rows.filter(r => r[`${other}_kg_ha`] === fixed).sort((a, b) => a[`${nutrient}_kg_ha`] - b[`${nutrient}_kg_ha`]);
    // x = total rate of the season: management of the DSSAT run + extra rate of the CSV
    const base = curve[0][`${nutrient}_base_kg_ha`] ?? 0;
    const total = r => base + r[`${nutrient}_kg_ha`];
    const xy = f => curve.map(r => [total(r), f(r)]);
    // band between two percentiles as one polygon (line stacking does not work on a value x axis); its data
    // are the band points, so the y axis also covers the band
    const band = (low, high, opacity) => {
        const lower = xy(r => q(r, low)), upper = xy(r => q(r, high));
        return {
            type: 'custom', name: `P${low}–P${high}`, silent: true, z: 1, data: lower.concat(upper),
            itemStyle: { color: '#1a9850', opacity: opacity * 2 },
            renderItem: (params, api) => params.dataIndex !== 0 ? null : {
                type: 'polygon',
                shape: { points: upper.concat(lower.slice().reverse()).map(p => api.coord(p)) },
                style: { fill: '#1a9850', opacity }
            }
        };
    };
    const s = show();
    const axisName = Lang.get(nutrient === 'p' ? 'modeladocultivo.label_phosphoruskgha' : 'modeladocultivo.label_potassiumkgha');
    const totalName = Lang.get(nutrient === 'p' ? 'modeladocultivo.label_phosphorustotalkgha' : 'modeladocultivo.label_potassiumtotalkgha');
    const vline = (x, label, style, position) => ({ xAxis: x, lineStyle: style,
                                                    label: { formatter: label, fontSize: 11, position, color: style.color } });

    chart.setOption({
        title: { text: `${axisName} — ${other.toUpperCase()} = ${fixed} kg/ha`, textStyle: { fontSize: 13, fontWeight: 'normal' }, left: 'center' },
        tooltip: {
            trigger: 'axis',
            formatter: items => {
                const r = curve[items[0].dataIndex];
                return `${nutrient.toUpperCase()} ${total(r)} kg/ha (${Lang.get('modeladocultivo.label_management')} ${base} ` +
                    `+ ${r[`${nutrient}_kg_ha`]})<br>` +
                    `<b>${Lang.get('modeladocultivo.label_median')}: ${s.fmt(q(r, 50))} ${s.unit}</b><br>` +
                    `P25–P75: ${s.fmt(q(r, 25))} – ${s.fmt(q(r, 75))} ${s.unit}`;
            }
        },
        legend: { bottom: 0, data: [Lang.get('modeladocultivo.label_median'), 'P25–P75'] },
        grid: { left: 60, right: 20, top: 40, bottom: 75 },
        xAxis: { type: 'value', min: 0, max: v => v.max, name: totalName, nameLocation: 'middle', nameGap: 28 },
        yAxis: { type: 'value', scale: s.col === 'yield', name: Lang.get(s.label), nameLocation: 'middle', nameGap: 45 },
        series: [
            band(25, 75, 0.3),
            { type: 'line', name: Lang.get('modeladocultivo.label_median'), data: xy(r => q(r, 50)), symbolSize: 6,
              lineStyle: { color: '#0b5d2a', width: 2 }, itemStyle: { color: '#0b5d2a' },
              markLine: { silent: true, symbol: 'none', data: [
                  vline(base, `${Lang.get('modeladocultivo.label_management')} (${base})`,
                        { color: '#b2182b', type: 'solid', width: 1.5 }, 'insideEndTop'),
                  vline(base + selected[nutrient], Lang.get('modeladocultivo.label_selectedrate'),
                        { color: '#000', type: 'dotted' }, 'insideEndBottom')
              ] } }
        ]
    }, true);
}

function drawCurves(rows) {
    const found = rows.some(r => r.p_kg_ha === selected.p && r.k_kg_ha === selected.k);
    document.getElementById('div-quefts-curves').classList.toggle('d-none', !found);
    document.getElementById('curves-hint').classList.toggle('d-none', found);
    if (!found) return;
    Object.values(curveCharts).forEach(c => c.resize());      // the container was hidden
    drawCurve(curveCharts.p, rows, 'p', selected.k);
    drawCurve(curveCharts.k, rows, 'k', selected.p);
}

async function init() {
    try {
        const response = await fetch(`${DATA_PATH}quefts_index_${CROP}.json`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        queftsIndex = await response.json();
    } catch (err) {
        return showError(`${DATA_PATH}quefts_index_${CROP}.json: ${err.message}. Is the page served over http://?`);
    }
    const textures = [...new Set(queftsIndex.files.map(f => f.texture))];
    fillSelect(selTexture, textures.map(t => [t, t]), params.get('texture'));
    fillDates(params.get('date'));
    draw();
}

selTexture.addEventListener('change', () => {
    // keep the same planting day when the new texture also has it
    const current = selDate.options[selDate.selectedIndex];
    fillDates(current ? current.text : null);
    draw();
});
selDate.addEventListener('change', draw);
selNitrogen.addEventListener('change', draw);
selShow.addEventListener('change', draw);
queftsChart.on('click', p => {
    if (!p.data || !p.data.row) return;
    selected = { p: p.data.row.p_kg_ha, k: p.data.row.k_kg_ha };
    draw();
});
window.addEventListener('resize', () => [queftsChart, ...Object.values(curveCharts)].forEach(c => c.resize()));

init();
