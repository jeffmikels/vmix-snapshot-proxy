
// EDIT THESE SETTINGS IF YOU NEED TO =================

const vMixStorage = 'C:/Users/AV/Documents/vMixStorage/'  // should agree with settings in vMix
const vmixUrl = 'http://localhost:8088/api';              // only change this if proxy is on a different computer

// DO NOT EDIT BELOW THIS LINE ========================


// REQUIRED MODULES
const ifaces = require('os').networkInterfaces()
const parser = require( 'fast-xml-parser' );
const got = require( 'got' );
const express = require( 'express' );
const nocache = require( 'nocache' );
const print = console.log;

// GLOBALS
let myip = 'THIS_COMPUTER_IP';
for (let key of Object.keys(ifaces)) {
	for (let device of ifaces[key]) {
		if (device.family == 'IPv4' && !device.internal) {
			myip = device.address;
			break 2;
		}
	}
}

let inputs = [];

// If you intend to use this with the Unofficial vMix Remote App:
// https://play.google.com/store/apps/details?id=org.jeffmikels.vmix_remote
// the port must be set to 8098
const proxyRunsOnPort = 8098                              // which port does the proxy listen on


// FUNCTIONS
function sleep( ms ) {
	return new Promise( resolve => setTimeout( resolve, ms ) );
}

function status() {
	print( '=====================================' )
	print( 'Running vMix Snapshot Proxy at port 8098' )
	print( `Get a list of all inputs:                http://${myip}:${proxyRunsOnPort}/` )
	print( `Force regen one input (0 means program): http://${myip}:${proxyRunsOnPort}/regen/#` )
	print( `Force regen all inputs:                  http://${myip}:${proxyRunsOnPort}/regen` )
	print( `Get input snapshot:                      http://${myip}:${proxyRunsOnPort}/#.jpg` )
	print( `` )
	print( `Getting an input snapshot sends the most recent snapshot, and queues the generation of a new one.` )
	print( `Snapshots take about 1 second to process` )
	print( '=====================================' )
}

async function get_inputs() {
	let url = vmixUrl + '?XML'
	print( url )
	const response = await got( url )
	const xmlData = response.body;
	if ( parser.validate( xmlData ) === true ) {
		let jsonObj = parser.parse( xmlData );
		inputs = jsonObj.vmix.inputs.input;
	}
}

// vmix inputs are 1-indexed
async function request_snapshots( inputNumber = -1 ) {
	if ( inputNumber == -1 ) {
		for ( let i = 1; i <= inputs.length; i++ ) request_snapshots( i );
	} else {
		let url;
		if ( inputNumber == 0 ) { url = vmixUrl + `?Function=Snapshot&Value=0.jpg` }
		else {
			let input = inputs[ inputNumber - 1 ];
			url = vmixUrl + `?Function=SnapshotInput&Input=${inputNumber}&Value=${inputNumber}.jpg`
		}
		print( url )
		const response = await got( url );
		print( response.body )
	}
}


function main() {
	// connect to vmix
	get_inputs();

	// express setup
	const app = express();
	app.set( 'etag', false )
	app.use( nocache() );

	app.get( '/', async ( req, res ) => {
		await get_inputs();
		res.json( inputs )
	} );

	app.get( '/regen', async ( req, res ) => {
		await request_snapshots();
		res.json( 'snapshots are regenerating' )
	} );

	app.get( '/regen/:input', async ( req, res ) => {
		await request_snapshots( req.params.input );
		res.json( 'snapshot ' + req.params.input + ' is regenerating' )
	} );

	// express handles middleware in the order it is added
	// handle input image requests
	app.use( async ( req, res, next ) => {
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
	app.use( express.static( vMixStorage ) );
	app.use( async ( req, res, next ) => {
		// file was not found, so wait a little bit
		await sleep( 1000 );

		// and try again
		next();
	} );
	app.use( express.static( vMixStorage ) );

	// app.use( '/:input', async ( req, res, next ) => {
	// 	await request_snapshots( req.params.input );
	// 	print( req );
	// 	req.path = req.params.input + '.jpg';
	// 	next( req, res );
	// }, express.static( vMixStorage ) );

	status();
	setInterval( status, 1000 * 60 * 5 );
	app.listen( proxyRunsOnPort )
}

main();

