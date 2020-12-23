# Server to collect temperature readings

Node server app to collect temperature readings transmitted over bluetooth-low-energy (BLE). The app relies on DBus on a linux system to access the bluetooth messages from the Bluez stack. 

The graphing uses Chart.js embedded in a single view served using Express. Client-side javascript periodically receives new data from the server through websockets and smooths the trendline a bit. 

![screenshot](https://github.com/immanuel/tempnet/blob/master/screenshot.jpg?raw=true)
