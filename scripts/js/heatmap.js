// set the dimensions and margins of the graph

function draw_heat_map(text_class) {
    const margin1 = {top: 80, right: 40, bottom: 80, left: 80},
    width = 800 - margin1.left - margin1.right,
    height = 450 - margin1.top - margin1.bottom;

    // append the svg object to the body of the page
    const svg1 = d3.select("#my_dataviz")
    .append("svg")
    .attr("width", width + margin1.left + margin1.right)
    .attr("height", height + margin1.top + margin1.bottom)
    .append("g")
    .attr("transform", `translate(${margin1.left}, ${margin1.top})`);

    const tooltip = d3.select("body").append("div")
    .attr("class", "tooltip")
    .style("opacity", 0)
    .style("background-color", "white")
    .style("border", "solid")
    .style("border-width", "2px")
    .style("border-radius", "5px")
    .style("padding", "5px");


    //Read the data
    d3.csv("data/oni_data_"+text_class+".csv").then(function(data) {
        data.forEach(d => {
            d.value = +d.value;  // Convert value to number
        });
        
        // Labels of row and columns -> unique identifier of the column called 'group' and 'variable'
        const myGroups = Array.from(new Set(data.map(d => d.group)));
        const myVars = Array.from(new Set(data.map(d => d.variable)));

        // Build X scales and axis:
        const x = d3.scaleBand()
            .range([ 0, width ])
            .domain(myGroups)
            .padding(0.05);
        svg1.append("g")
            .style("font-size", 15)
            .attr("transform", `translate(0, ${height+20})`)
            .call(d3.axisBottom(x).tickSize(0))
            .selectAll("text")
            .attr("transform", "rotate(-65)" )
            .select(".domain").remove();

        // Build Y scales and axis:
        const y = d3.scaleBand()
            .range([ height, 0 ])
            .domain(myVars)
            .padding(0.05);
        svg1.append("g")
            .style("font-size", 15)
            .call(d3.axisLeft(y).tickSize(0))
            .select(".domain").remove();

        // Build color scale
        const myColor = d3.scaleSequential()
        .interpolator(d3.interpolateRdYlGn)
        .domain([1000, d3.max(data, d => d.value)])


        // Three function that change the tooltip when user hover / move / leave a cell
        const mouseover = function (event, d) {
            
            d3.select(this)
                .style("stroke", "black")
                .style("opacity", 1);
                
            tooltip.style("opacity", 1)
                .html(`<br> ONI: <b>${d.value}</b>`)
                .style("left", (event.pageX + 10) + "px")  // Slightly offset for visibility
                .style("top", (event.pageY - 30) + "px");
        };
        const mousemove = function(event, d) {
            d3.select(this)
            .style("stroke", "black")
            .style("opacity", 1);

            tooltip.style("opacity", 1)
                .html(`<br> ONI: <b>${d.group}</b>`)
                .style("left", (event.pageX + 10) + "px")  // Slightly offset for visibility
                .style("top", (event.pageY - 30) + "px");

        };
        const mouseleave = function () {
            tooltip.style("opacity", 0);
            d3.select(this)
                .style("stroke", "none")
                .style("opacity", 0.8);
        };

        // add the squares
        svg1.selectAll("rect")
        .data(data, d => d.group + ':' + d.variable)
        .join("rect")
        .attr("x", d => x(d.group))
        .attr("y", d => y(d.variable))
        .attr("rx", 4)
        .attr("ry", 4)
        .attr("width", x.bandwidth())
        .attr("height", y.bandwidth())
        .style("fill", d => myColor(d.value))
        .style("stroke-width", 4)
        .style("stroke", "none")
        .style("opacity", 0.8)
            .on("mouseover", mouseover)
            .on("mousemove", mousemove)
            .on("mouseleave", mouseleave);
        });

    // Add title to graph
    svg1.append("text")
        .attr("x", 0)
        .attr("y", -50)
        .attr("text-anchor", "left")
        .style("font-size", "22px")
        .text("Maize potential yield");

    // Add subtitle to graph
    svg1.append("text")
        .attr("x", 0)
        .attr("y", -20)
        .attr("text-anchor", "left")
        .style("font-size", "14px")
        .style("fill", "grey")
        .style("max-width", 400)
        .text(" Oceanic Niño Index (ONI) ");

    svg1.append("text")
        .attr("class", "x label")
        .attr("text-anchor", "middle")
        .attr("x", width / 2)
        .attr("y", height + margin1.bottom - 5)  // Position below x-axis
        .text("Planting Date - Month - Day");
}

draw_heat_map("clay");