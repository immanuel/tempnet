var dbus = require('dbus-native');
var systemBus = dbus.systemBus();
var btService = systemBus.getService('org.bluez');

var express = require('express');
var app = express();
var http = require('http').Server(app);
var io = require('socket.io')(http);

var MAX_ENTRIES = 10000;
var MAX_HISTORY_HR = 2;
var MAX_HISTORY_MS = MAX_HISTORY_HR*60*60*1000; 

var devices = require('./devices.js');

btService.getInterface('/org/bluez/hci0','org.bluez.Adapter1',function(err, iFace){
    if(err) { console.log(err);}
    else { 
        iFace.SetDiscoveryFilter([ // array is js array
                ['DuplicateData', ['b', false]], // dict_entry is 2 element array - key,value
                ]);
        iFace.StartDiscovery(); 
    }
});

function makeDeviceHandler(deviceAddr) {
    var device_path = "/org/bluez/hci0/" + deviceAddr;
    return function() {
        btService.getInterface(device_path, 'org.freedesktop.DBus.Properties', function(err,device_iFace) {
            if(err) { 
                // console.log(deviceAddr, " not found"); 
                // If device not found, get a new handler and call again
                // after some time
                var newHandler = makeDeviceHandler(deviceAddr);
                setTimeout(newHandler, 1000);
            } 
            else {
                console.log(deviceAddr, " found"); 
                device_iFace.on('PropertiesChanged', (changed_iFace, changed_prop) => {
                    changed_prop.forEach(prop => {
                        if(prop[0] == 'ManufacturerData') {
                            // Get temp reading
                            const tempBuffer = prop[1][1][0][0][1][1][0];
                            var tempReading = (tempBuffer[0] + 256*(tempBuffer[1]))/100.0;

                            if(tempReading > 0.5) {
                                // Put the temp reading in the local temp history
                                var tempEntry = {
                                    "timestamp": Date.now(),
                                    "temp": tempReading
                                };
                                devices[deviceAddr]["temp_history"].push(tempEntry);
                                devices[deviceAddr]["latest_entry_num"] =
                                    (1+devices[deviceAddr]["latest_entry_num"]) % MAX_ENTRIES;

                                // Send the temp reading to clients
                                var msg = {
                                    "name": devices[deviceAddr]["name"],
                                    "entry_num": devices[deviceAddr]["latest_entry_num"],
                                    "timestamp": Date.now(),
                                    "temp": tempReading
                                };
                                io.emit('current_temp', msg);

                                // Delete historic entries
                                var newIdx =
                                    devices[deviceAddr]["temp_history"].findIndex(isNotOld);
                                if(newIdx < 0) {
                                    // Entire array is old 
                                    // Unlikely since we just added an element
                                    devices[deviceAddr]["temp_history"].splice(0);
                                }
                                else if (newIdx > 0) {
                                    // Delete elements 0, 1, 2, ..., newIdx - 1
                                    devices[deviceAddr]["temp_history"].splice(0, newIdx);
                                }
                                // if newIdx is 0, no need to make any changes
                            }
                        }
                    });
                });
            }
        })
    };
}
 
Object.keys(devices).forEach(deviceAddr => {
    deviceHandler = makeDeviceHandler(deviceAddr);
    deviceHandler();
});

function isNotOld(element, index, array) {
    // Return true if element was recorded within MAX_HISTORY_MS
    // findIndex will return this index as the new starting position
    return (Date.now() - element["timestamp"]) < MAX_HISTORY_MS;
}

function isStartingIdx(element, index, array) {
    // Return true when the next element is found
    return (element["timestamp"] > this.since);
}

io.on('connect', socket => {
    socket.on('replay_request', replayReq => {
        // TODO: Check if the request is valid

        var deviceAddr;
        var deviceAddrList = Object.keys(devices);
        for(var i = 0; i<deviceAddrList.length; i++){
            if(devices[deviceAddrList[i]]["name"] == replayReq["name"]) {
                deviceAddr = deviceAddrList[i];
                break;
            }
        }
        var startIdx =
            devices[deviceAddr]["temp_history"].findIndex(
                    isStartingIdx,
                    replayReq
                    );

        var replayRes = {
            "entry_num" : devices[deviceAddr]["latest_entry_num"],
            "name": devices[deviceAddr]["name"]
        };

        if(startIdx >= 0) {
            replayRes["temp_history"] =
                devices[deviceAddr]["temp_history"].slice(startIdx);
        }
        else {
            replayRes["temp_history"] = []
        }
        socket.emit('replay_response', replayRes);
    });
});

app.use(express.static('static'));
app.set('view engine', 'ejs');

app.get('/', function(req, res) {
    var current_temp = [];
    Object.keys(devices).forEach(device => {
        current_temp.push(devices[device]);
    });
    res.render('index', {
        devices: current_temp,
        max_entries: MAX_ENTRIES, 
        max_history_ms: MAX_HISTORY_MS
    });
});

http.listen(80, function() {console.log('Started webserver');});

