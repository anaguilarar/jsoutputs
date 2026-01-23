const PHASE_MAP = {
  "Flowering": 0,
  "Neutral": 1,
  "El Niño": 2,
  "La Niña": 3
};

const PHASE_COLORS = [
  "#f0f0f0", // Flowering
  "#bdbdbd", // Neutral
  "#fc8d59", // El Niño
  "#91bfdb"  // La Niña
];

const PLANTING_DATE = "1999-01-01";


function coffeeYear(dateStr, plantingDate) {
  const d = new Date(dateStr);
  const p = new Date(plantingDate);
  return Math.max(
    0,
    Math.min(8, Math.floor((d - p) / (365.25 * 24 * 3600 * 1000)))
  );
}

function computeCoffeeYear(dateStr, plantingDateStr) {
  const d = new Date(dateStr);
  const p = new Date(plantingDateStr);
  return Math.max(0, Math.min(8, d.getFullYear() - p.getFullYear()));
}

fetch("data/coffee_oni.csv")
  .then(r => r.text())
  .then(text => {
    const raw = Papa.parse(text, { header: true, dynamicTyping: true }).data;

    buildChart(raw);
  });


function dominantPhase(counts) {
  let max = 0, sel = "Neutral";
  for (const k in counts) {
    if (counts[k] > max) {
      max = counts[k];
      sel = k;
    }
  }
  return sel;
}


function buildChart(data) {
    const plantingDate = "1999-01-01";

    const agg = {};
    const chart = echarts.init(document.getElementById("chartPotentialyieldoni"));

  // ---------------------------
  // Axes categories
  // ---------------------------
  const cycles = [...new Set(
    data
    .map(d => d.n_cycle)
    .filter(v => Number.isFinite(v))
    )]
    .sort((a,b)=>a-b)
    .map(c => `Cycle ${c}`);

  const years = Array.from({length: 9}, (_, i) => `Year ${i}`);
  
  // ---------------------------
  // Phase encoding
  // ---------------------------
  const phaseMap = {
    "Flowering": 0,
    "Neutral": 1,
    "El Niño": 2,
    "La Niña": 3
  };

  const phaseColors = [
    "#f0f0f0", // Flowering
    "#bdbdbd", // Neutral
    "#fc8d59", // El Niño
    "#91bfdb"  // La Niña
  ];

  // ---------------------------
  // Heatmap data
  // [x, y, value]
  // ---------------------------
  const heatmapMap = new Map();
    cycles.forEach(c =>
    years.forEach(y =>
        heatmapMap.set(`${y}|${c}`, 0)
    )
    );

    // Fill actual data
    data.forEach(d => {
  if (!Number.isFinite(d.n_cycle)) return;

  const y = coffeeYear(d.HDAT, plantingDate);
  const key = `${d.n_cycle}|${y}`;

  if (!agg[key]) {
    agg[key] = {
      cycle: `Cycle ${d.n_cycle}`,
      year: `Year ${y}`,
      phaseCount: {},
      flowering: false
    };
  }

  agg[key].flowering ||= d.DayFl === 1;
  agg[key].phaseCount[d.Phase] =
    (agg[key].phaseCount[d.Phase] || 0) + 1;
});

    const heatmapData = Object.values(agg).map(d => {
        let v = 0;
        if (!d.flowering) {
            if (d.phase === "Neutral") v = 1;
            if (d.phase === "El Niño") v = 2;
            if (d.phase === "La Niña") v = 3;
        }
        return [d.year, d.cycle, v];
        });

  // ---------------------------
  // Boxplot source
  // ---------------------------
  const boxSource = data
  .filter(d => Number.isFinite(d.n_cycle) && d["DayHarv(1)"] > 0)
  .map(d => [`Cycle ${d.n_cycle}`, d.harvDM_f_hay]);

  data.forEach(d => {
    if (d["DayHarv(1)"] > 0) {
      boxSource.push([`Cycle ${d.n_cycle}`, d.harvDM_f_hay]);
    }
  });

  // ---------------------------
  // Option
  // ---------------------------
  const option = {
  title: {
    text: "ENSO Phase (Heatmap) and Harvest Distribution by Cycle",
    left: "center"
  },

  grid: [
    { left: 90, right: "40%", top: 80, bottom: 60 },
    { left: "68%", right: 40, top: 80, bottom: 60 }
  ],

  xAxis: [
    {
      type: "category",
      data: years,
      name: "Coffee plant age",
      gridIndex: 0
    },
    {
      type: "value",
      name: "Harvest DM",
      gridIndex: 1
    }
  ],

  yAxis: [
    {
      type: "category",
      data: cycles,
      gridIndex: 0
    },
    {
      type: "category",
      data: cycles,
      gridIndex: 1
    }
  ],

  visualMap: {
    type: "piecewise",
    right: 10,
    top: "middle",
    dimension: 2,
    categories: [0,1,2,3],
    inRange: {
      color: ["#f0f0f0","#bdbdbd","#fc8d59","#91bfdb"]
    },
    formatter: v => ["Flowering","Neutral","El Niño","La Niña"][v]
  },

  dataset: [
  { id: "box_raw", source: boxSource },
  {
    id: "box_trans",
    fromDatasetId: "box_raw",
    transform: {
      type: "boxplot",
      config: { itemNameFormatter: d => d.value }
    }
  }
],

  series: [
    {
      type: "heatmap",
      data: heatmapData,
      xAxisIndex: 0,
      yAxisIndex: 0,
      itemStyle: {
        borderColor: "#fff",
        borderWidth: 1
      }
    },

    {
    type: "boxplot",
    datasetId: "box_trans",
    xAxisIndex: 1,
    yAxisIndex: 1,
    layout: "horizontal",
    encode: {
        x: [1, 2, 3, 4, 5],
        y: 0
    }
    }
  ]
};

  chart.setOption(option);
}