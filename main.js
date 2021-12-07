// EDIT THESE SETTINGS IF YOU NEED TO =================
const config = {}
const vMixDefaultStorage = 'C:/Users/AV/Documents/vMixStorage/'  // should agree with settings in vMix
const vMixDefaultUrl = 'http://192.168.50.12:8088/api';              // only change this if proxy is on a different computer

// If you intend to use this with the Unofficial vMix Remote App:
// https://play.google.com/store/apps/details?id=org.jeffmikels.vmix_remote
// the port must be set to 8098
const proxyRunsOnPort = 8098                              // which port does the proxy listen on


// DO NOT EDIT BELOW THIS LINE ========================
const { app, BrowserWindow, ipcMain, nativeTheme } = require('electron')
	

// REQUIRED MODULES
const { WebSocketServer } = require('ws');
const ifaces = require('os').networkInterfaces()
const parser = require( 'fast-xml-parser' );
const path = require( 'path' );
const express = require( 'express' );
const nocache = require( 'nocache' );
const got = require( 'got' );
const ws = require('ws');
const print = console.log;

// GLOBALS
let vMixUrl = vMixDefaultUrl;
let myip = 'THIS_COMPUTER_IP';
let ips = [];
let myUrl = '';
for (let key of Object.keys(ifaces)) {
	for (let device of ifaces[key]) {
		if (device.family == 'IPv4' && !device.internal) {
			ips.push(device.address);
		}
	}
}
if (ips.length > 0) myip = ips[0];
myUrl = `http://${myip}:${proxyRunsOnPort}`

// keep track of the vmix inputs
let inputs = [];


// FUNCTIONS
function sleep( ms ) {
	return new Promise( resolve => setTimeout( resolve, ms ) );
}

function status() {
	print( '=====================================' )
	print( 'Running vMix Snapshot Proxy at port 8098' )
	print( `Get a list of all inputs:                ${myUrl}/inputs` )
	print( `Force regen one input (0 means program): ${myUrl}/regen/#` )
	print( `Force regen all inputs:                  ${myUrl}/regen` )
	print( `Get input snapshot:                      ${myUrl}/#.jpg` )
	print( `` )
	print( `Getting an input snapshot sends the most recent snapshot, and queues the generation of a new one.` )
	print( `Snapshots take about 1 second to process` )
	print( '=====================================' )
}

async function get_inputs() {
	let url = vMixUrl + '?XML'
	const response = await got( url )
	const xmlData = response.body;
	if ( parser.validate( xmlData ) === true ) {
		let jsonObj = parser.parse( xmlData );
    let count = 0;
    for (let input of jsonObj.vmix.inputs.input ) {
      count++
      if (typeof(input) === 'string') {
        input = {text: input}
      }
      // correct text items from xml
      if ('#text' in input) input.text = input['#text'];
      input.number = count;
      inputs.push(input);
    }
	}
}

// vmix inputs are 1-indexed
// inputNumber defaults to -1 which will update all snapshots
// when inputNumber is 0, the snapshot will be taken from the output/program feed
async function request_snapshots( inputNumber = -1 ) {
	if ( inputNumber == -1 ) {
		for ( let i = 1; i <= inputs.length; i++ ) request_snapshots( i );
	} else {
		let url;
		if ( inputNumber == 0 ) { url = vMixUrl + `?Function=Snapshot&Value=0.jpg` }
		else {
			let input = inputs[ inputNumber - 1 ];
			url = vMixUrl + `?Function=SnapshotInput&Input=${inputNumber}&Value=${inputNumber}.jpg`
      input.url = `${myUrl}/${inputNumber}.jpg`;

      // set a timeout to see if this snapshot exists
      // if it does, update the inputs, and send a websocket message about this input
      // use got.head
		}
		let response = await got( url );
		print( response.body )
	}
}


function main() {
  let clients = []

	// connect to vmix
	get_inputs();

	// express setup
	const server = express();
	server.set( 'etag', false )
	server.use( nocache() );

	server.get( '/inputs', async ( req, res ) => {
		await get_inputs();
		res.json( inputs )
	} );

	server.get( '/regen', async ( req, res ) => {
		await request_snapshots();
		res.json( 'snapshots are regenerating' )
	} );

	server.get( '/regen/:input', async ( req, res ) => {
		await request_snapshots( req.params.input );
		res.json( 'snapshot ' + req.params.input + ' is regenerating' )
	} );

	// express handles middleware in the order it is added
	// handle input image requests
	server.use( async ( req, res, next ) => {
		// always generate a new image every time
		print( req.path );
		let match = req.path.match( /(\d+)\.jpg/ );
		if ( match ) {
			let input = match[ 1 ];
			request_snapshots( input );
		}
		// send it on to the static middleware
		next();
	} );
	server.use( express.static( vMixDefaultStorage ) );
	server.use( async ( req, res, next ) => {
		// file was not found, so wait a little bit
		await sleep( 1000 );

		// and try again
		next();
	} );
	server.use( express.static( vMixDefaultStorage ) );

	// app.use( '/:input', async ( req, res, next ) => {
	// 	await request_snapshots( req.params.input );
	// 	print( req );
	// 	req.path = req.params.input + '.jpg';
	// 	next( req, res );
	// }, express.static( vMixStorage ) );

  const wss = new WebSocketServer({ noServer: true });
  wss.broadcast = function(message, data) {
    wss.clients.forEach(function each(client) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({message, data}));
      }
    });
  }
  wss.on('connection', (ws) => {
    ws.sender = (message, data) => ws.send(JSON.stringify({message, data}));
    ws.on('message', (command) => {
      command = command.toString();
      console.log('received command: %s', command);
      // let {message, data} = JSON.parse(data);
      switch (command) {
        case 'subscribe':
          if (clients.indexOf(ws) == -1) clients.push(ws);
          ws.sender('subscribed');
          break;
        case 'inputs':
          ws.sender('inputs', inputs);
          break;
        default:
          console.log('command not recognized');
          console.log(command);
      }
    });  
    ws.sender('connected');
  });
  const realServer = server.listen( proxyRunsOnPort )
  realServer.on('upgrade', function upgrade(request, socket, head) {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  });

	status();
	setInterval( status, 1000 * 60 * 5 );

  // Launch Electron
  const createWindow = () => {
    const win = new BrowserWindow({
      width: 800,
      height: 600,
      webPreferences: {
        preload: path.join(__dirname, 'preload.js')
      }  
    })
  
    win.loadFile('index.html')

    ipcMain.handle('dark-mode:toggle', () => {
      if (nativeTheme.shouldUseDarkColors) {
        nativeTheme.themeSource = 'light'
      } else {
        nativeTheme.themeSource = 'dark'
      }
      return nativeTheme.shouldUseDarkColors
    })
  
    ipcMain.handle('dark-mode:system', () => {
      nativeTheme.themeSource = 'system'
    })
  
  }
  
  app.whenReady().then(() => {    
    createWindow()
  })

  // quit when all the windows are closed
  app.on('window-all-closed', () => {
    if (process.platform === 'darwin') app.quit()
  })

  // reopen a window if the process activates when no windows are open
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
}

main();

