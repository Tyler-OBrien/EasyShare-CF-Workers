export class Websocket implements DurableObject {
  // Store this.state for later access
  constructor(private readonly state: DurableObjectState) {
    this.websockets = [];
  }

  async handleSession(websocket: WebSocket) {
    websocket.accept();
    this.websockets.push(websocket);

    websocket.addEventListener("message", async (message) => {
      this.websockets.filter(ws => ws !== websocket).forEach(ws => ws.send(message.data));
    });

    websocket.addEventListener("close", async (evt) => {
      // Handle when a client closes the WebSocket connection
      console.log("Closing Session: " + evt.code);
      console.log(evt);
      this.websockets = this.websockets.filter(ws => ws !== websocket);
    });
    websocket.addEventListener("error", async (evt) => {
      console.log("Error in handle Session: " + evt.message);
      console.log(evt);
      this.websockets = this.websockets.filter(ws => ws !== websocket);
    });
  }

  async fetch(request: Request) {
    const upgradeHeader = request.headers.get("Upgrade");
    if (upgradeHeader !== "websocket") {
      console.log("Invalid Upgrade Header")
      return new Response("Expected websocket", { status: 400 });
    }
    if (this.websockets.length > 1) {
      return new Response("Already max clients...", { status: 400 });
    }
    console.log("New Valid Websocket Connection");
    const [client, server] = Object.values(new WebSocketPair());
    await this.handleSession(server);

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }
}
