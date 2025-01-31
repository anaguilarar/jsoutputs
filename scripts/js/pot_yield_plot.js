function draw_potential_yield(text_class){
        
    const margin = { top: 20, right: 30, bottom: 50, left: 80 };
    const width = 800 - margin.left - margin.right;
    const height = 500 - margin.top - margin.bottom;

    const svg = d3.select("#potential_yield_chart")
    .append("svg")
    .attr("width", width + margin.left + margin.right)
    .attr("height", height + margin.top + margin.bottom)
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

    const tooltip = d3.select("body").append("div")
        .attr("class", "tooltip");

    // 📌 Define a parser for MM-DD format (assume year 2024)
    const parseDate = d3.timeParse("%m-%d");

    // Load Data
    d3.csv("data/yield_data_"+text_class+".csv").then(data => {
        // Parse date and convert numeric values
        data.forEach(d => {
            //d.date = parseDate(d.doy);
            d.date = parseDate(d.month_day);
            d.date.setFullYear(2024); // Assume the same year for consistency
            d.response = +d.y;
            d.y_lower = +d.y_lower;
            d.y_upper = +d.y_upper;
        });

        // Set scales
        const x = d3.scaleTime()
            .domain(d3.extent(data, d => d.date))
            .range([0, width]);

        const y = d3.scaleLinear()
            .domain([d3.min(data, d => d.y_lower) - 5, d3.max(data, d => d.y_upper) + 5])
            .range([height, 0]);
        
        // Add axes
        const xAxis = d3.axisBottom(x)
        .tickFormat(d3.timeFormat("%b"));
        // Configure Y-axis


        // Add X Axis
        svg.append("g")
            .attr("transform", `translate(0,${height})`)
            .call(xAxis)
            //.call(d3.axisBottom(x).tickFormat(d3.timeFormat("%m-%W")))
            .selectAll("text")
            .attr("transform", "rotate(-30)")
            .style("text-anchor", "end");
            //text("Month - Week");
        
        svg.append("text")
            .attr("class", "x label")
            .attr("text-anchor", "middle")
            .attr("x", width / 2)
            .attr("y", height + margin.bottom - 5)  // Position below x-axis
            .text("Planting Date - Month");
        
        svg.append("text")
            .attr("class", "y label")
            .attr("text-anchor", "middle")
            .attr("y", -margin.left + 20)
            .attr("transform", `rotate(-90)`)  // Rotate for y-axis
            .attr("x", -height/2)  // Position below x-axis
            .text("Potential yield");
            
        // Add Y Axis
        svg.append("g")
            .call(d3.axisLeft(y));
        
            
        // Confidence Interval (Shaded Area)
        svg.append("path")
            .datum(data)
            .attr("fill", "lightgray")
            .attr("opacity", 0.5)
            .attr("d", d3.area()
                .x(d => x(d.date))
                .y0(d => y(d.y_lower))
                .y1(d => y(d.y_upper))
            );

        // Line Chart
        svg.append("path")
            .datum(data)
            .attr("class", "line")
            .attr("stroke", "green")
            .attr("stroke-width", 2)
            .attr("fill", "none")
            .attr("d", d3.line()
                .x(d => x(d.date))
                .y(d => y(d.response))
            );

        // Add Points
        svg.selectAll("circle")
            .data(data)
            .enter()
            .append("circle")
            .attr("cx", d => x(d.date))
            .attr("cy", d => y(d.response))
            .attr("r", 4)
            .attr("fill", "blue");
        
        svg.selectAll(".dot")
            .data(data)
            .enter()
            .append("circle")
            .attr("class", "dot")
            .attr("cx", d => x(d.date))
            .attr("cy", d => y(d.response))
            .attr("r", 5)
            .on("mouseover", function (event, d) {
                d3.select(this).transition().attr("r", 8);
                tooltip.style("display", "block")
                    .html(`📅 <b>${d3.timeFormat("%b - %d")(d.date)}</b><br>🌽 Potential Yield: <b>${d3.format(".2f")(d.response)}</b>`)
                    .style("left", (event.pageX + 10) + "px")
                    .style("top", (event.pageY - 30) + "px");
            })
            .on("mouseout", function () {
                d3.select(this).transition().attr("r", 5);
                tooltip.style("display", "none");
            });

    }).catch(error => console.log(error));
}

draw_potential_yield("clay")