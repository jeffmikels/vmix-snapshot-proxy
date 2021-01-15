# vMix Snapshot Proxy


vMix has a robust API, but one key limitation of the API is that while you can
tell vMix to take a snapshot of an input, it will save the image on the vMix
machine but not send the image over the network.

This is a small application running on the nodejs framework to act as a proxy
for those images.

The application is especially helpful in providing preview images of each input for

[Unofficial vMix Remote Control](https://play.google.com/store/apps/details?id=org.jeffmikels.vmix_remote)



## Installation

These commands should be run on the same computer that is running vMix.

```bash
$ git clone https://github.com/jeffmikels/vmix-snapshot-proxy.git
$ cd vmix-snapshot-proxy
$ npm install
```

## Usage

Edit the settings at the top of `index.js`.

Start vMix and then the proxy server...

```
$ node index.js
```

You'll see something like the following output

```
=====================================
Running vMix Snapshot Proxy at port 8098
Get a list of all inputs:                http://192.168.1.1:8098/
Force regen one input (0 means program): http://192.168.1.1:8098/regen/#
Force regen all inputs:                  http://192.168.1.1:8098/regen
Get input snapshot:                      http://192.168.1.1:8098/#.jpg

Getting an input snapshot sends the most recent snapshot, and queues the generation of a new one.
Snapshots take about 1 second to process
=====================================
```

Open a browser and visit:

`http://[PROXY_IP_ADDRESS]:8098/[INPUT_NUMBER].jpg`

Every time you visit that address, you will receive a new snapshot image of the selected input.