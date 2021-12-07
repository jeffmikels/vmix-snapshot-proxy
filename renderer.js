let url = 'ws://localhost:8098'
let ws = null;

let app = new Vue({
  el: '#app',
  data: {
    loading: false,
    inputs: [],
  },
  methods: {
    handleMsg(msg) {
      console.log(msg)
      let {message, data} = JSON.parse(msg);
      switch(message) {
        case 'subscribed':
          ws.send('inputs')
          break;
        case 'inputs':
          this.inputs = data;
          this.loading = false;
          break;
      }

    },
  },
  mounted(){
    ws = new WebSocket(url);
    ws.onopen = function() {ws.send('subscribe');}
    ws.onmessage = (event)=>this.handleMsg(event.data)
  }
})