var socket = io();
var chart;
var isC = false;

var spikeLess = true;

socket.on('current_temp', function(current_temp){
    console.log(current_temp);

    var sensorName = current_temp.name;
    var newTemp = current_temp.temp;
    var newTS = current_temp.timestamp;
    var newEntryNum = current_temp.entry_num;

    var sensorData = tempData[sensorName].temp_history;

    var isNext = (
            newEntryNum  == (
                (tempData[sensorName].latest_entry_num + 1) % MAX_ENTRIES
                )
            );
    var historyLen = sensorData.length;
    var isFresh = (
            (historyLen > 0) && 
            ((sensorData[historyLen-1].timestamp 
                 + MAX_HISTORY_MS) > newTS)
            );

    // If the client has no history or if the entry is the next  entry, add the
    // new entry to the end
    if((historyLen == 0) || (isNext && isFresh)) {
        tempData[sensorName].latest_entry_num = newEntryNum;
        sensorData.push({
            "timestamp": newTS, 
            "temp": newTemp
        });

        // Update the temp grid
        $("#" + sensorName).text(getDisplayTemp(newTemp, 1));

        // Update chart
        //TODO: Remove spikes
        /*
        if(sensorData.length > 3) {
                var inc = (sensorData[i+1].temp > sensorData[i].temp);
                var incPrev = (sensorData[i].temp > sensorData[i-1].temp);
                var incPrevPrev = (sensorData[i-1].temp > sensorData[i-2].temp);

                var nextTS = sensorData[i].timestamp;
                var nextTemp = null

                if( 
                    !(inc & !incPrev & incPrevPrev) & 
                    !(!inc & incPrev & !incPrevPrev) & 
                    (sensorData[i].temp != prevTemp) 
                    ) {
                    chartData.push({
                        x: sensorData[i].timestamp, 
                        y: getDisplayTemp(sensorData[i].temp, 2)
                    })
                    prevTemp = sensorData[i].temp;
                }
        }
        else {
            chart.data.datasets[getChartIdx(sensorName)].data.push({
                x: newTS, 
                y: getDisplayTemp(newTemp, 2)
            });
        }
        */
        chart.data.datasets[getChartIdx(sensorName)].data.push({
            x: newTS, 
            y: getDisplayTemp(newTemp, 2)
        });
        chart.update();

        // Delete old entries
        deleteOldEntries(sensorName);
    }
    // if there is history and its missing entries, ask for replay
    else {
        // Missed some entries. Ask server for replay
        console.log("Asking since: ",
                sensorData[historyLen-1].timestamp);
        socket.emit("replay_request", {
            "name": sensorName,
            "since": sensorData[historyLen-1].timestamp
        });
    }
});

socket.on('replay_response', function(replayResp){
    console.log("Replaying: ", replayResp);
    tempData[replayResp.name].latest_entry_num = replayResp.entry_num;
    replayResp.temp_history.forEach(function(timestampTemp) {
        tempData[replayResp.name].temp_history.push(timestampTemp);
        // Update chart
        // TODO: remove spikes
        chart.data.datasets[getChartIdx(replayResp.name)].data.push({
            x: timestampTemp.timestamp,
            y: getDisplayTemp(timestampTemp.temp, 2)
        });
    });
    chart.update();

    // Update the temp grid
    $("#" + replayResp.name).text(
            getDisplayTemp(
                replayResp.temp_history[replayResp.temp_history.length - 1].temp, 
                1
                )
            );

    // Delete old entries
    deleteOldEntries(replayResp.name);
});

function isNotOld(element, index, array) {
    // Return true if element was recorded within MAX_HISTORY_MS
    // findIndex will return this index as the new starting position
    return (Date.now() - element["timestamp"]) < MAX_HISTORY_MS;
}

function deleteOldEntries(sensorName) {
    var newIdx =
        tempData[sensorName].temp_history.findIndex(isNotOld);
    if(newIdx < 0) {
        // Entire array is old 
        tempData[sensorName].temp_history.splice(0);
        chart.data.datasets[getChartIdx(sensorName)].data.splice(0);
        chart.update();
    }
    else if (newIdx > 0) {
        // Delete elements 0, 1, 2, ..., newIdx - 1
        tempData[sensorName].temp_history.splice(0, newIdx);
        chart.data.datasets[getChartIdx(sensorName)].data.splice(0, newIdx);
        chart.update();
    }
    // if newIdx is 0, no need to make any changes
}

function getDisplayTemp(celTemp, precision) {
    if(isC) { return celTemp.toFixed(precision) }
    return (1.0*celTemp*9/5 + 32).toFixed(precision);
}

function getChartIdx(sensorName) {
    for(var i = 0; i < chart.data.datasets.length; i++) {
        if(chart.data.datasets[i].label == sensorName) {
            return i
        }
    }
}

function getChartDataset() {
    var chartDataset = [];
    Object.keys(tempData).forEach(function(sensorName) {
        var chartData = [];
        if(!spikeLess) {
            tempData[sensorName].temp_history.forEach(function(timestampTemp){
                chartData.push({
                    x: timestampTemp.timestamp, 
                    y: getDisplayTemp(timestampTemp.temp, 2)
                });
            });
        }
        else {
            var prevTemp = 0;
            var sensorData = tempData[sensorName].temp_history;
            for(var i = 0; i < Math.min(sensorData.length, 3); i++) {
                chartData.push({
                    x: sensorData[i].timestamp, 
                    y: getDisplayTemp(sensorData[i].temp, 2)
                });
                prevTemp = sensorData[i].temp;
            }
            for(var i = 2; i < (sensorData.length-1); i++) {

                var inc = (sensorData[i+1].temp > sensorData[i].temp);
                var incPrev = (sensorData[i].temp > sensorData[i-1].temp);
                var incPrevPrev = (sensorData[i-1].temp > sensorData[i-2].temp);

                var nextTS = sensorData[i].timestamp;
                var nextTemp = null

                if( 
                    !(inc & !incPrev & incPrevPrev) & 
                    !(!inc & incPrev & !incPrevPrev) & 
                    (sensorData[i].temp != prevTemp) 
                    ) {
                    chartData.push({
                        x: sensorData[i].timestamp, 
                        y: getDisplayTemp(sensorData[i].temp, 2)
                    })
                    prevTemp = sensorData[i].temp;
                }
                chartData.push({ x: nextTS, y: nextTemp });
            }
        }

        chartDataset.push({
            label: sensorName, 
            backgroundColor: tempData[sensorName].color,
            borderColor: tempData[sensorName].color,
            data: chartData
        });
    });
    return chartDataset;
}

$(document).ready(function() {
    Chart.defaults.global.defaultFontFamily = "'Lato', sans-serif";
    var ctx = document.getElementById('tempChart').getContext('2d');
    chart = new Chart(ctx, {
        type: 'line',
        data: { datasets: getChartDataset() },
        options: {
            legend: {display: false},
            scales: {
                xAxes: [{
                    type: 'time',
                    time: {unit: 'minute'}
                }]
            }, 
            elements: {
                point: { radius: 0 },
                line: {
                    tension: 0,
                    fill: false
                }
            },
            spanGaps: true
        }
    });

    $( ".toggle" ).change(function() {
          isC = this.checked;

          //update temp grid
          Object.keys(tempData).forEach(function(sensorName) {
              $("#" + sensorName).text(
                      getDisplayTemp(
                          tempData[sensorName].temp_history[tempData[sensorName].temp_history.length - 1].temp, 
                          1
                          )
                      );
          });

          //update chart
          chart.data.datasets = getChartDataset();
          chart.update();
    });
});
