// EDIT THESE SETTINGS IF YOU NEED TO =================
const config = {}
const vMixDefaultStorage = 'C:/Users/AV/Documents/vMixStorage/'      // should agree with settings in vMix
const vMixDefaultUrl = 'http://192.168.50.12:8088/api';              // only change this if proxy is on a different computer

// If you intend to use this with the Unofficial vMix Remote App:
// https://play.google.com/store/apps/details?id=org.jeffmikels.vmix_remote
// the port must be set to 8098
const proxyRunsOnPort = 8098                              // which port does the proxy listen on


// DO NOT EDIT BELOW THIS LINE ========================
const { app, BrowserWindow, ipcMain, nativeTheme } = require( 'electron' )


// REQUIRED MODULES
const { WebSocketServer, WebSocket } = require( 'ws' );
const wss = new WebSocketServer( { noServer: true } );
wss.broadcast = function ( message, data ) {
  wss.clients.forEach( function each( client ) {
    if ( client.readyState === WebSocket.OPEN ) {
      client.send( JSON.stringify( { message, data } ) );
    }
  } );
}

const ifaces = require( 'os' ).networkInterfaces()
const parser = require( 'fast-xml-parser' );
const path = require( 'path' );
const express = require( 'express' );
const nocache = require( 'nocache' );
const axios = require( 'axios' );
const print = console.log;

// GLOBALS
let vMixStorage = vMixDefaultStorage;
let vMixUrl = vMixDefaultUrl;
let myip = 'THIS_COMPUTER_IP';
let ips = [];
let myUrl = '';
for ( let key of Object.keys( ifaces ) ) {
  for ( let device of ifaces[ key ] ) {
    if ( device.family == 'IPv4' && !device.internal ) {
      ips.push( device.address );
    }
  }
}
if ( ips.length > 0 ) myip = ips[ 0 ];
myUrl = `http://${myip}:${proxyRunsOnPort}`

// keep track of the vmix inputs
let inputs = [];
let nextInput = 0;

// FUNCTIONS
function sleep( ms ) {
  return new Promise( resolve => setTimeout( resolve, ms ) );
}

function status() {
  let s = `
=====================================
Running vMix Snapshot Proxy at port 8098' )
Subscribe by websocket:                  ws://${myip}:${proxyRunsOnPort}
Get a list of all inputs:                ${myUrl}/inputs
Force regen one input (0 means program): ${myUrl}/regen/#
Force regen all inputs:                  ${myUrl}/regen
Get input snapshot:                      ${myUrl}/#.jpg

Getting an input snapshot sends only the most recent snapshot.
Snapshots take about 1 second to process.
=====================================`
  return s;
}

function inputUrl( inputNumber ) {
  return `${myUrl}/${inputNumber}.jpg?t=` + Date.now();
}

async function get_inputs() {
  let url = vMixUrl + '?XML'
  let response
  try {
    response = await axios.get( url )
  } catch ( e ) {
    print( e );
    return;
  }
  const xmlData = response.data;
  if ( parser.validate( xmlData ) === true ) {
    let jsonObj = parser.parse( xmlData );
    let count = 0;
    for ( let input of jsonObj.vmix.inputs.input ) {
      count++
      if ( typeof ( input ) === 'string' ) {
        input = { text: input }
      }
      // correct text items from xml
      if ( '#text' in input ) input.text = input[ '#text' ];
      input.number = count;
      input.url = inputUrl( count );
      inputs.push( input );
    }
  }
  wss.broadcast( 'inputs', inputs );
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
      inputs[ inputNumber - 1 ].url = inputUrl( inputNumber );
      url = vMixUrl + `?Function=SnapshotInput&Input=${inputNumber}&Value=${inputNumber}.jpg`
      // send the api command
      axios.get( url ).catch( e => console.log( e.status + ': ' + url ) );

      // set a timeout to see if this snapshot exists
      // if it does, update the inputs, and send a websocket message about this input
      // use axios.head
      setTimeout( async () => {
        try {
          let input = inputs[ inputNumber - 1 ];
          let r = await axios.head( input.url );
          wss.broadcast( 'input_update', input );
          // console.dir( r );
        } catch ( e ) {
          // console.log( e );
        }
      }, 1000 )
    }
  }
}

async function loop() {
  if ( inputs.length == 0 ) {
    await get_inputs();
  } else {
    nextInput = ( nextInput + 1 ) % inputs.length;
    print( `LOOP: Next Input to Regenerate: ${nextInput}` );
    if ( nextInput == 0 ) await get_inputs();
    else await request_snapshots( nextInput );
  }
  setTimeout( loop, 1000 );
}

function main() {
  let clients = []

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
  // server.use( async ( req, res, next ) => {
  //   // always generate a new image every time
  //   print( req.path );
  //   let match = req.path.match( /(\d+)\.jpg/ );
  //   if ( match ) {
  //     let input = match[ 1 ];
  //     request_snapshots( input );
  //   }
  //   // send it on to the static middleware
  //   next();
  // } );

  // we have to do it this way, because the vMixStorage Directory
  // might change at runtime, and this allows it to.
  server.use( ( req, res, next ) => {
    // print( 'Serving static files from: ' + vMixStorage );
    let handler = express.static( vMixStorage );
    handler( req, res, next );
  } );

  // server.use( async ( req, res, next ) => {
  //   // file was not found, so wait a little bit
  //   await sleep( 1000 );

  //   // and try again
  //   next();
  // } );
  // server.use( express.static( vMixDefaultStorage ) );

  // app.use( '/:input', async ( req, res, next ) => {
  // 	await request_snapshots( req.params.input );
  // 	print( req );
  // 	req.path = req.params.input + '.jpg';
  // 	next( req, res );
  // }, express.static( vMixStorage ) );

  wss.on( 'connection', ( ws ) => {
    ws.sender = ( message, data ) => ws.send( JSON.stringify( { message, data } ) );
    ws.on( 'message', ( event ) => {
      let { message, data } = JSON.parse( event );
      console.log( 'received message: %s', message );
      // let {message, data} = JSON.parse(data);
      switch ( message ) {
        case 'subscribe':
          if ( clients.indexOf( ws ) == -1 ) clients.push( ws );
          ws.sender( 'subscribed', { vMixStorage, status: status() } );
          break;
        case 'inputs':
          ws.sender( 'inputs', inputs );
          break;
        case 'update_storage_directory':
          vMixStorage = data;
        default:
          console.log( 'message not recognized' );
          console.log( message );
      }
    } );
    ws.sender( 'connected' );
  } );
  const realServer = server.listen( proxyRunsOnPort )
  realServer.on( 'upgrade', function upgrade( request, socket, head ) {
    wss.handleUpgrade( request, socket, head, ( ws ) => {
      wss.emit( 'connection', ws, request );
    } );
  } );

  print( status() )
  setInterval( () => print( status() ), 1000 * 60 * 5 );
  loop();

  // Launch Electron
  const createWindow = () => {
    const win = new BrowserWindow( {
      width: 800,
      height: 600,
      webPreferences: {
        preload: path.join( __dirname, 'preload.js' )
      }
    } )

    win.loadFile( 'index.html' )

    ipcMain.handle( 'dark-mode:toggle', () => {
      if ( nativeTheme.shouldUseDarkColors ) {
        nativeTheme.themeSource = 'light'
      } else {
        nativeTheme.themeSource = 'dark'
      }
      return nativeTheme.shouldUseDarkColors
    } )

    ipcMain.handle( 'dark-mode:system', () => {
      nativeTheme.themeSource = 'system'
    } )

  }

  app.whenReady().then( () => {
    createWindow()
  } )

  // quit when all the windows are closed
  app.on( 'window-all-closed', () => {
    if ( process.platform === 'darwin' ) app.quit()
  } )

  // reopen a window if the process activates when no windows are open
  app.on( 'activate', () => {
    if ( BrowserWindow.getAllWindows().length === 0 ) createWindow()
  } )
}

main();
