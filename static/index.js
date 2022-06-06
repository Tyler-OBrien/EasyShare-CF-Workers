// Todo:
/*
Probably get rid of window.sodium onload
Finish UI
Main Idea is that Phone scans Qr Code and can upload TEXT and FILES
We might want to be careful about how we encrypt files and stream them. It would be best if we could stream everything so nothing needs to be entirely in RAM.

*/

/* State */
const state = {
  privateKey: null,
  publicKey: null,
  channel: null,
  otherPartyPublicKey: null,
  sharedRx: null,
  sharedTx: null,
  websocket: null,
};

/* Crypto */

window.sodium = {
  onload: function (sodium) {
    globalThis.sodium = sodium;
    init();
  },
};

function CreateECDHE(sodium) {
  var key = sodium.crypto_kx_keypair();
  var publicKey = sodium.to_hex(key.publicKey);
  var privateKey = sodium.to_hex(key.privateKey);
  document.getElementById("publicKey").innerHTML = publicKey;
  console.log(publicKey);
  state.publicKey = publicKey;
  state.privateKey = privateKey;
  state.channel = publicKey;
}
// Todo:
// This is intended to be used as the transmit/receive keys for streaming files.
function CreateKeyFromECDHE(sodium, publickey) {
  var publicKeySharedHex = sodium.from_hex(publickey);
  console.log(`Server Public Key: ${publicKeySharedHex}`);
  console.log(`Public Key: ${state.publicKey}`);
  console.log(`Private Key: ${state.privateKey}`);
  if (state.channel == state.publicKey) {
    var key = sodium.crypto_kx_server_session_keys(
      sodium.from_hex(state.publicKey),
      sodium.from_hex(state.privateKey),
      publicKeySharedHex
    );
  } else {
    var key = sodium.crypto_kx_client_session_keys(
      sodium.from_hex(state.publicKey),
      sodium.from_hex(state.privateKey),
      publicKeySharedHex
    );
  }
  console.log(key);
  state.sharedRx = key.sharedRx;
  state.sharedTx = key.sharedTx;
  console.log("Completed making shared session secret...");
}

function SendEncrypted(sodium, message, type) {
  SendEncrypted(sodium, message, type, null, message);
}

function SendEncrypted(sodium, message, type, filename) {
  var nonce = sodium.randombytes_buf(24);
  var encrypted = sodium.crypto_box_easy(
    message,
    nonce,
    sodium.from_hex(state.otherPartyPublicKey),
    sodium.from_hex(state.privateKey)
  );
  console.log(`Sending encrypted message: ${encrypted}`);
  if (filename === null) {
    send_ws(type, sodium.to_hex(encrypted), sodium.to_hex(nonce));
  } else {
    send_ws(type, sodium.to_hex(encrypted), sodium.to_hex(nonce), filename);
  }
}

function Decrypt(sodium, data, nonce) {
  var decrypted = sodium.crypto_box_open_easy(
    sodium.from_hex(data),
    sodium.from_hex(nonce),
    sodium.from_hex(state.otherPartyPublicKey),
    sodium.from_hex(state.privateKey)
  );
  console.log(`Decrypted message: ${decrypted}`);
  return decrypted;
}

function HandleOtherPublicKey(key, channelChange) {
  document.getElementById("ScannedKey").innerHTML = key;
  state.otherPartyPublicKey = key;
  updateWebsocketChannel(key, channelChange);
  enableInputs();
}

/* Websocket Functions */

var websocketLabel = document.getElementById("websocketstatus");

function createWebsocket() {
  const key = state.channel;
  const url = `${location.protocol.endsWith("s:") ? "wss" : "ws"}://${
    location.host
  }/api/connect/${key}`;
  return new WebSocket(url);
}

function updateWebsocketChannel(newChannel, channelChange) {
  if (channelChange) {
    console.log("New Channel, switching...")
  state.channel = newChannel;
  state.websocket.close();
  state.websocket = null;
  check_connection();
  }
}

function websocket_onmessage(event) {
  var data = JSON.parse(event.data);
  if (data.eventName === "publicKey") {
    HandleOtherPublicKey(data.value, false);
  }
  if (data.eventName === "message") {
    var decrypted = Decrypt(globalThis.sodium, data.value, data.nonce);
    var decodeDecrypted = new TextDecoder().decode(decrypted);
    console.log(`Decrypted message: ${decodeDecrypted}`);
    handleNewMessage("Them", decodeDecrypted)
  } else if (data.eventName === "file") {
    var decrypted = Decrypt(globalThis.sodium, data.value, data.nonce);
    var decodeDecrypted = new TextDecoder().decode(decrypted);
    console.log(decodeDecrypted);
    console.log(`Decrypted file: ${decodeDecrypted}`);
    SetUpDownload("They", decodeDecrypted, data.filename);
  } else if (data.eventName === "ping") {
    console.log("Got a ping, sending pong");
    send_ws("pong", "", "");
  }

  }

function websocket_onerror(err) {
  console.error("Socket encountered error: ", err.message, "Closing socket");
  state.websocket.close();
  disableInputs();
}

function websocket_onclose(closeEvent) {
  console.log(
    "Socket is closed. Will Attempt to reconnect.",
    closeEvent.reason
  );
  websocketLabel.innerHTML = "Disconnected";
  disableInputs();
}

function websocket_onopen(openEvent) {
  console.log("Socket is open.");
  websocketLabel.innerHTML = "Connected";
  send_ws("publicKey", state.publicKey);
  enableInputs();
}

function isWebsocketConnected() {
  return state.websocket && state.websocket.readyState === state.websocket.OPEN;
}

function check_connection() {
  // https://developer.mozilla.org/en-US/docs/Web/API/WebSocket/readyState
  if (
    state.websocket === null ||
    (state.websocket && state.websocket.readyState === state.websocket.CLOSED)
  ) {
    try {
      console.log("Trying to connect to state.websocket...");
      websocketLabel.innerHTML = "Connecting";
      websocket = createWebsocket();
      state.websocket = websocket; // assign to global var space
      console.log("Websocket Status is: ", state.websocket.readyState);
      websocket_bind(websocket);
    } catch (err) {
      console.error(err);
      console.log("Error connecting to Websocket, will retry shortly...");
    }
  }
  send_ping();
}

function websocket_bind(websocket) {
  websocket.onmessage = websocket_onmessage;
  websocket.onerror = websocket_onerror;
  websocket.onclose = websocket_onclose;
  websocket.onopen = websocket_onopen;
}

function send_ws(eventName, value) {
  var data = {
    eventName: eventName,
    value: value,
  };
  send_websocket_data(JSON.stringify(data));
}

function send_ws(eventName, value, nonce) {
  var data = {
    eventName: eventName,
    value: value,
    nonce: nonce,
  };
  send_websocket_data(JSON.stringify(data));
}
function send_ws(eventName, value, nonce, filename) {
  var data = {
    eventName: eventName,
    value: value,
    nonce: nonce,
    filename: filename,
  };
  send_websocket_data(JSON.stringify(data));
}

function send_websocket_data(data) {
  if (
    websocket === undefined ||
    (websocket && websocket.readyState !== websocket.OPEN)
  ) {
    console.log("Websocket not connected, cannot send data yet..");
  } else {
    websocket.send(data);
  }
}

/* Websocket ping pong */

function send_ping() {
  console.log("Sending ping...");
  send_ws("ping", "")
}

/* End Websocket Functions */

/* QR Code Handling */

function generateQRCode() {


  var qrcode = new QRCode(document.getElementById("qrcode"), {
    text: `https://easyshare.chaika.workers.dev/?key=${state.publicKey}`,
    width: 250,
    height: 250,
    colorDark : "#000000",
    colorLight : "#ffffff",
    correctLevel : QRCode.CorrectLevel.H
  });
}

function onScanSuccess(decodedText, decodedResult) {
  // handle the scanned code as you like, for example:

  console.log(`Code matched = ${decodedText}`, decodedResult);
  decodedText = decodedText.replace("https://easyshare.chaika.workers.dev/?key=", "");
  HandleOtherPublicKey(decodedText, true)
}

function onScanFailure(error) {
  // handle scan failure, usually better to ignore and keep scanning.
  // for example:
  console.warn(`Code scan error = ${error}`);
}

/* UI */

function OnSendText(type) {
  var text = document.getElementById("text-send-value").value;
  handleNewMessage("You", text)
  SendEncrypted(globalThis.sodium, text, "message");
}

function OnConnectButtonPress() {
  var getValue = document.getElementById("qr-code-value").value.trim();
  HandleOtherPublicKey(getValue, true)
}

function HandleFiles(event) {
  for (let file of Array.from(event.target.files)) {
    const reader = new FileReader();
    reader.onload = function () {
      const data = reader.result;
      console.log(data);
      SendEncrypted(globalThis.sodium, data, "file", file.name);
      SetUpDownload("You", data, file.name);
    };
    reader.readAsDataURL(file);
  }
}

function SetUpDownload(party, fileData, filename) {
  const div = document.createElement("div");
  const p = document.createElement("p");
  p.innerText = `${party} sent a file:`;
  const anchor = document.createElement("a");
  anchor.href = fileData;
  anchor.download = filename;

  anchor.innerText = filename;
  div.appendChild(p);
  div.appendChild(anchor);
  document.getElementById("messages").appendChild(div);
}


function enableInputs() {
  if (state.otherPartyPublicKey !== null) {
    console.log("Enabling inputs");
  document.getElementById("text-send-button").disabled = false;
  document.getElementById("filepicker").disabled = false;
  }
}

function disableInputs() {
  document.getElementById("text-send-button").disabled = true;
  document.getElementById("filepicker").disabled = true;
}

function handleNewMessage(party, message) {
  document.getElementById(
    "messages"
  ).innerHTML += `<p>${party}: ${message}</p>`;
}
/* Initialization */

function init() {
  // Generate Keys
  CreateECDHE(globalThis.sodium);
  generateQRCode();
  // On first load, load up the websocket connection
  check_connection();
  // Then, every two seconds, check if the websocket is still open. If not, try to reconnect.
  setInterval(check_connection, 2000);
}

function checkIfQRCodeInQueryString() {
  var urlParams = new URLSearchParams(window.location.search);
  if (urlParams.has("key")) {
  getValue = urlParams.get("key");
  HandleOtherPublicKey(getValue, true);
  }
}

document.getElementById("filepicker").addEventListener("change", (e) => {
  HandleFiles(e);
});

Html5Qrcode.getCameras().then((devices) => {
  if (devices && devices.length) {
    const formatsToSupport = [Html5QrcodeSupportedFormats.QR_CODE];
    const html5QrcodeScanner = new Html5QrcodeScanner(
      "qr-code-full-region",
      {
        fps: 10,
        formatsToSupport: formatsToSupport,
        supportedScanTypes: [Html5QrcodeScanType.SCAN_TYPE_CAMERA],
      },
      /* verbose= */ false
    );
    html5QrcodeScanner.render(onScanSuccess, onScanFailure);
  }
});
