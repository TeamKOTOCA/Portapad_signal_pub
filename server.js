const express = require('express');
const https = require('https');
const fs = require('fs');
const WebSocket = require('ws');
const crypto = require('crypto');

const app = express();

// SSL証明書と秘密鍵を読み込む
const options = {
  key: fs.readFileSync('privkey.pem'),
  cert: fs.readFileSync('fullchain.pem')
};

// HTTPSサーバー作成
const server = https.createServer(options, app);
const wss = new WebSocket.Server({ server });

// HTML出力
app.get('/', (req, res) => {
  const htmlContent = `
    <!DOCTYPE html>
    <html lang="ja">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Portapad Signaling Server(Pubmodel)</title>
    </head>
    <body style="text-align: center;">
        <h1>Portapad Signaling Server</h1>
        <p>シグナリングサーバーは起動中です。</p>
    </body>
    </html>
  `;
  res.send(htmlContent);
});

const clients = new Map();

wss.on('connection', (ws, req) => {
  const ipAddress = req.socket.remoteAddress
    .replace(/^::ffff:/, '')
    .replace(/^::1$/, '127.0.0.1');
  console.log(ipAddress);
  console.log('WebSocketで接続');

  ws.on('message', (message) => {
    console.log('メッセージが来たぞぉ! ->', message);
    console.log('クライアントのIP、', ipAddress , "みたいだわ");
    try {
      const jmessage = JSON.parse(message);
      if(jmessage.mtype == "sdpoffer"){
        console.log("SDPのofferだってさ");
        try{
          const sdp = JSON.parse(jmessage.body);
          const inclients = clients.get(ipAddress);
          const [, clientws] = inclients.get(jmessage.tohost);
          const fromhost = getipfromws(ipAddress, ws);

          const sdpbypass = {
            mtype: "sdp",
            fromhost: fromhost,
            body: sdp
          };
          clientws.send(JSON.stringify(sdpbypass));
          console.log(sdpbypass.fromhost);
        }catch(e){
          console.log("エラー:" + e);
        }
      } else if(jmessage.mtype == "ice"){
        console.log("ICEのofferだってさ");
        try{
          const inclients = clients.get(ipAddress);
          const [, clientws] = inclients.get(jmessage.tohost);
          const fromhost = getipfromws(ipAddress, ws);

          const icebypass = {
            mtype: "ice",
            fromhost: fromhost,
            body: JSON.parse(jmessage.body)
          };
          clientws.send(JSON.stringify(icebypass));
          console.log(icebypass.fromhost);
        }catch(e){
          console.log("エラー:" + e);
        }
      }
    } catch (e) {
      if(message == "host"){
        makeitems(ipAddress, true, ws);
        let sendmessage = {
          mtype: "myname",
          fromhost: "nohoost-nohost-nohost",
          body: getipfromws(ipAddress, ws)
        };
        ws.send(JSON.stringify(sendmessage));
      } else if(message == "client"){
        makeitems(ipAddress, false, ws);
      } else if(message == "viewclients"){
        const getipaddress = clients.get(ipAddress);
        try{
          const jsonString = JSON.stringify(Array.from(getipaddress.entries()));
          ws.send(jsonString);
          console.log(jsonString);
        }catch(e){
          console.log("clientsendでエラー出てるけど大丈夫そ？");
        }
      } else if(message == "hostview"){
        const getipaddress = clients.get(ipAddress);
        if (!getipaddress) return;
        const hostKeys = Array.from(getipaddress.entries())
          .filter(([_, [isHost]]) => isHost)
          .map(([key]) => key);
        try {
          let sendhosts = {
            mtype: "hosts",
            fromhost: null,
            body: JSON.stringify(hostKeys)
          };
          ws.send(JSON.stringify(sendhosts));
          console.log("送信したホスト一覧: ", hostKeys);
        } catch (e) {
          console.log("hostviewの送信エラー:", e);
        }
      }
    }
  });

  const pingInterval = setInterval(() => {
    ws.ping();
  }, 30000);
  ws.on('pong', () => {});

  ws.on('close', () => {
    if (clients.has(ipAddress)) {
      const ipMap = clients.get(ipAddress);
      for (let [key, client] of ipMap) {
        const [, clientSocket] = client;
        if (ws === clientSocket) {
          ipMap.delete(key);
          console.log(`削除されたクライアント: ${key}`);
        }
      }
      if (ipMap.size === 0) {
        clients.delete(ipAddress);
        console.log(`IPアドレス ${ipAddress} の情報も削除されました。`);
      }
    }
    clearInterval(pingInterval);
    console.log('WebSocketの接続が解除された');
  });
});

function makeitems(ipAddress, isHost, ws) {
  if(!clients.has(ipAddress)){
    clients.set(ipAddress, new Map());
  }
  const inipmap = clients.get(ipAddress);
  const geneid = geneId();
  inipmap.set(geneid, [isHost, ws]);
  console.log(`ip: ${ipAddress} ,id: ${geneid} ,ishost ${isHost}`);
}

function geneId() {
  return crypto.randomUUID();
}

function getipfromws(ipAddress, ws){
  const ipMap = clients.get(ipAddress);
  for (const [id, [isHost, socket]] of ipMap.entries()) {
    if (socket === ws) {
      return id;
    }
  }
}

const PORT = 8443;
server.listen(PORT, () => {
  console.log(`HTTPS Server is started at https://localhost:${PORT}`);
});
