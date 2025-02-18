function draw_potential_yield(text_class){
        
    const margin = { top: 20, right: 30, bottom: 50, left: 80 };
    const width = 800 - margin.left - margin.right;
    const height = 500 - margin.top - margin.bottom;

    const svg = d3.select("#coffee_potential_yield_chart")
    .append("svg")
    .attr("width", width + margin.left + margin.right)
    .attr("height", height + margin.top + margin.bottom)
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

    const tooltip = d3.select("body").append("div")
        .attr("class", "tooltip");

        // 📌 Define a parser for MM-DD format (assume year 2024)
    const parseDate = d3.timeParse("%Y-%m-%d");

    // Load Data
    d3.csv("data/yield_data_"+text_class+".csv").then(data => {
        // Parse date and convert numeric values
        data.forEach(d => {
            d.date = parseDate(d.nyear_month_day);
            
            d.response = parseFloat(d.harvDM_f_hay);
            d.group = d.period;
        });

        const nestedData = d3.group(data, d => d.group);

        // Define color scale for different groups
        const color = d3.scaleOrdinal()
            .range(['#e41a1c','#377eb8','#4daf4a','#984ea3','#ff7f00','#ffff33','#a65628','#f781bf','#999999'])

        // Set scales
        const x = d3.scaleTime()
            .domain(d3.extent(data, d => d.date))
            .range([0, width]);

        const y = d3.scaleLinear()
            .domain([d3.min(data, d => d.response) - 5, d3.max(data, d => d.response) + 5])
            .range([height, 0]);
        
        // Add axes
        const xAxis = d3.axisBottom(x)
        .tickFormat(d3.timeFormat("%y"));
        // Configure Y-axis

        // Add X Axis
        svg.append("g")
            .attr("transform", `translate(0,${height})`)
            .call(xAxis)
            //.call(d3.axisBottom(x).tickFormat(d3.timeFormat("%m-%W")))
            .selectAll("text")
            .attr("transform", "rotate(-15)")
            .style("text-anchor", "end");
            //text("Month - Week");
        
        svg.append("text")
            .attr("class", "x label")
            .attr("text-anchor", "middle")
            .attr("x", width / 2)
            .attr("y", height + margin.bottom - 5)  // Position below x-axis
            .text("Coffee Plant Cycle (Years)");
        
        svg.append("text")
            .attr("class", "y label")
            .attr("text-anchor", "middle")
            .attr("y", -margin.left + 20)
            .attr("transform", `rotate(-90)`)  // Rotate for y-axis
            .attr("x", -height/2)  // Position below x-axis
            .text("Potential yield (kg/ha)");
            
        // Add Y Axis
        svg.append("g")
            .call(d3.axisLeft(y));
        
        svg.selectAll(".line")
            .data(nestedData)
            .join("path")
              .attr("fill", "none")
              .attr("stroke", function(d){ return color(d[0]) })
              .attr("stroke-width", 1.5)
              .attr("d", function(d){
                return d3.line()
                  .x(function(d) { return x(d.date); })
                  .y(function(d) { return y(+d.response); })
                  (d[1])
              })
        // ********** ADD TOOLTIP **********
    const tooltip = d3.select("body").append("div")
        .attr("class", "tooltip")
        .style("display", "none");
        
              // ********** ADD INTERACTIVE DOTS **********
        svg.selectAll(".dot")
        .data(data)
        .enter()
        .append("circle")
        .attr("class", "dot")
        .attr("cx", d => x(d.date))
        .attr("cy", d => y(d.response))
        .attr("r", 2)
        .attr("fill", d => color(d.group)) // Match dot color to group color
        .on("mouseover", function (event, d) {
            d3.select(this).transition().attr("r", 3);
            tooltip.style("display", "block")
                .html(`📅 <b>${d3.timeFormat("%b-%d")(d.date)}</b><br>🫘 Potential Yield: <b>${d3.format(".2f")(d.response)}</b><br>🌱 Group: <b>${d.group}</b>`)
                .style("left", (event.pageX + 10) + "px")
                .style("top", (event.pageY - 30) + "px");
        })
        .on("mouseout", function () {
            d3.select(this).transition().attr("r", 2);
            tooltip.style("display", "none");
        });

        // ********** ADD LEGEND **********
        const legend = svg.append("g")
            .attr("transform", `translate(${width - 150}, 10)`) // Position legend
            .selectAll("g")
            .data([...nestedData.keys()])
            .enter()
            .append("g")
            .attr("transform", (d, i) => `translate(0, ${i * 20})`);

        // Add colored rectangles
        legend.append("rect")
            .attr("width", 15)
            .attr("height", 15)
            .attr("fill", d => color(d));

        // Add text labels
        legend.append("text")
            .attr("x", 20)
            .attr("y", 12)
            .text(d => d)
            .style("font-size", "12px")
            .style("alignment-baseline", "middle");


    }).catch(error => console.log(error));



}

draw_potential_yield("clayloam")