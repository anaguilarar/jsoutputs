function exceedance_plots(text_class){
  const margin = {top: 50, right: 40, bottom: 50, left: 70},
        width = 500 - margin.left - margin.right,
        height = 400 - margin.top - margin.bottom;

  // Create SVG container
  const svg = d3.select("#exceedance_agperiods")
      .append("svg")
      .attr("width", width + margin.left + margin.right)
      .attr("height", height + margin.top + margin.bottom)
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

          
  const tooltip = d3.select("body").append("div")
      .attr("class", "tooltip")

//d3.csv("https://raw.githubusercontent.com/holtzy/data_to_viz/master/Example_dataset/5_OneCatSevNumOrdered.csv").then( function(data) {
  d3.csv("data/cumulative_distribution_frequency_ag_periods_"+text_class+".csv").then( function(data) {
  
      data.forEach(d => {
          d.yield = +d.yield;
          d.n = +d.n;
      });

      // add the options to the button
      
      // group the data: I want to draw one line per group
      
      const allGroup = new Set(data.map(d => d.ag_period))

      //const sumstat = d3.group(data, d => d.name);// nest function allows to group the calculation per level of a factor
      d3.select("#selectbutton")
          .selectAll('myOptions')
          .data(allGroup)
          .enter()
          .append('option')
          .text(function (d) { return d; }) // text showed in the menu
          .attr("value", function (d) { return d; })

      // What is the list of groups?
      // Add an svg element for each group. The will be one beside each other and will go on the next row when no more room available
  
      // Add X axis --> it is a date format
      // Define scales
      const xScale = d3.scaleLinear()
          .domain(d3.extent(data, d => d.yield))
          .range([0, width]);

      const yScale = d3.scaleLinear()
          .domain([0, d3.max(data, d => d.n)])
          .range([height, 0]);

      // Add X Axis
      svg.append("g")
          .attr("transform", `translate(0, ${height})`)
          .call(d3.axisBottom(xScale).ticks(5));

      // Add Y Axis
      svg.append("g")
          .call(d3.axisLeft(yScale));

          // Add lines
      
      const colorScale = d3.scaleOrdinal()
          .domain(["Historical", "El Niño", "La Niña"])
          .range(["green", "red", "blue"]);
      
      const line = svg.selectAll(".line")
          .data(d3.group(data.filter(function(d){return d.ag_period=="Primera"}), d => d.name))
          .join("path")
          .attr("fill", "none")
          .attr("stroke", d => colorScale(d[0]))
          .attr("stroke-width", 1.5)
          .attr("d", d => d3.line()
              .x(d => xScale(d.yield))
              .y(d => yScale(d.n))
              (d[1])
          )
      
      const circle = svg.selectAll("circle")
          .data(data.filter(function(d){return d.ag_period=="Primera"}))
          .enter()
          .append("circle")
          .attr("cx", d => xScale(d.yield))
          .attr("cy", d => yScale(d.n))
          .attr("r", 3)
          .attr("fill", "blue")
          .style("fill", function (d) { return colorScale(d.name) } );

      const dot = svg.selectAll(".dot")
          .data(data.filter(function(d){return d.ag_period=="Primera"}))
          .enter()
          .append("circle")
          .attr("class", "dot")
          .attr("cx", d => xScale(d.yield))
          .attr("cy", d => yScale(d.n))
          .style("fill", function (d) { return colorScale(d.name) } )
          .attr("r", 3)
          .on("mouseover", function (event, d) {
              d3.select(this).transition().attr("r", 4);
              tooltip.style("display", "block")
                  .html(`CDF <b>${d3.format(".2f")(d.n)}</b> 
                  <br> 🌽 Potential Yield: <b>${d3.format(".2f")(d.yield)}</b>
                  <br> ONI: <b>${d.name}</b>`)
                  .style("left", (event.pageX + 10) + "px")
                  .style("top", (event.pageY - 30) + "px");
          })
          .on("mouseout", function () {
              d3.select(this).transition().attr("r", 3);
              tooltip.style("display", "none");
          });

          
          
      
          // A function that update the chart
      function update(selectedGroup) {

              // Create new data with the selection?
              const dataFilterg = d3.group(data.filter(function(d){return d.ag_period==selectedGroup}), d => d.name)

      
              // Give these new data to update line
              line
                  .datum(dataFilterg)
                  .transition()
                  .duration(1000)
                  .join("path")
                  .attr("fill", "none")
                  .attr("stroke", d => colorScale(d[0]))
                  .attr("stroke-width", 1.5)
                  .attr("d", d => d3.line()
                      .x(d => xScale(d.yield))
                      .y(d => yScale(d.n))
                      (d[1])
                  )

              const dataFilter = data.filter(function(d){return d.ag_period=="Primera"})
              circle
                  .data(dataFilter)
                  .transition()
                  .duration(1000)
                  .enter()
                  .append("circle")
                  .attr("cx", d => xScale(d.yield))
                  .attr("cy", d => yScale(d.n))
                  .attr("r", 3)
                  .attr("fill", "blue")
                  .style("fill", function (d) { return colorScale(d.name) } );


              dot.
                  data(dataFilter)
                  .enter()
                  .append("circle")
                  .attr("class", "dot")
                  .attr("cx", d => xScale(d.yield))
                  .attr("cy", d => yScale(d.n))
                  .style("fill", function (d) { return colorScale(d.name) } )
                  .attr("r", 3)
                  .on("mouseover", function (event, d) {
                      d3.select(this).transition().attr("r", 4);
                      tooltip.style("display", "block")
                          .html(`CDF <b>${d3.format(".2f")(d.n)}</b> 
                          <br> 🌽 Potential Yield: <b>${d3.format(".2f")(d.yield)}</b>
                          <br> ONI: <b>${d.name}</b>`)
                          .style("left", (event.pageX + 10) + "px")
                          .style("top", (event.pageY - 30) + "px");
                  })
                  .on("mouseout", function () {
                      d3.select(this).transition().attr("r", 3);
                      tooltip.style("display", "none");
                  });

          }

              // Legend
      const legend = svg.selectAll(".legend")
      .data(["Historical", "El Niño", "La Niña"])
      .enter().append("g")
      .attr("class", "legend")
      .attr("transform", (d, i) => `translate(0,${i * 20})`);

      legend.append("rect")
          .attr("x", 85)
          .attr("width", 15)
          .attr("height", 15)
          .style("fill", d => colorScale(d));

      legend.append("text")
          .attr("x", 80)
          .attr("y", 9)
          .attr("text-anchor", "end")
          .style("font-size", "18px")
          .text(d => d);
      
      d3.select("#selectbutton").on("change", function(event,d) {
              // recover the option that has been chosen
              const selectedOption = d3.select(this).property("value")
              // run the updateChart function with this selected option
              update(selectedOption)
          })
  });
}

exceedance_plots('clay')