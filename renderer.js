let url = 'ws://localhost:8098'
let ws = null;

let app = new Vue( {
  el: '#app',
  data: {
    storage_dir: '',
    loading: false,
    status: 'connecting',
    show_instructions: true,
    output: '',
    inputs: [],
  },
  methods: {
    handleMsg( msg ) {
      console.log( msg )
      let { message, data } = JSON.parse( msg );
      switch ( message ) {
        case 'subscribed':
          this.storage_dir = data.vMixStorage
          this.output = data.status
          ws.sender( 'inputs' )
          this.status = 'connected'
          this.loading = true
          break;
        case 'inputs':
          this.status = 'connected'
          this.inputs = data;
          this.loading = false
          break;
        case 'input_update':
          let input = data;
          for ( let i = 0; i < this.inputs.length; i++ ) {
            if ( this.inputs[ i ].number == input.number ) {
              this.inputs[ i ] = input;
              break;
            }
          }
        case 'output':
          this.output += data
      }
    },
    updateStorageDir() {
      ws.sender( 'update_storage_directory', this.storage_dir )
    },
  },
  mounted() {
    this.loading = true;
    ws = new WebSocket( url );
    ws.sender = function ( message, data ) { ws.send( JSON.stringify( { message, data } ) ) }
    ws.onopen = function () { ws.sender( 'subscribe' ); }
    ws.onmessage = ( event ) => this.handleMsg( event.data )
  }
} )
