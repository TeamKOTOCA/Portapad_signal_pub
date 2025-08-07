const express = require('express');
const path = require('path');
const http = require('http');//httpサーバー
const WebSocket = require('ws');
const { json } = require('stream/consumers');
const crypto = require('crypto');
const { send } = require('process');
const { type } = require('os');

const app = express();
const server = http.createServer(app); // HTTPサーバー作成
const wss = new WebSocket.Server({ server }); // WebSocketをHTTPサーバーに統合

// /静的ファイルを公開 ポート3000
app.get('/', (req, res) => {
  const htmlContent = `
    <!DOCTYPE html>
    <html lang="ja">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Portapad Signaling Server(Pubmodel)</title>
    </head>
    <body style"text-aligin: center;">
        <h1>Portapad Signaling Server</h1>
        <p>シグナリングサーバーは起動中です。</p>
    </body>
    </html>
  `;
  res.send(htmlContent);
});

// クライアント一覧
const clients = new Map();

// WebSocketの接続処理
wss.on('connection', (ws, req) => {
    const ipAddress = (req.headers['x-forwarded-for'] || req.connection.remoteAddress || '')
    .split(',')[0] // x-forwarded-forに複数IPが入ることがあるので最初のだけ取る
    .replace(/^::ffff:/, '') // IPv4マッピング除去
    .replace(/^::1$/, '127.0.0.1'); // IPv6ループバック対応
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
                        console.log("jmessage 全体:", jmessage);
                        //SDPを取り出す
                        var sdp = JSON.parse(jmessage.body);
                        //指定されたhostにsdpオファー転送
                        const inclients = clients.get(ipAddress);
                        const [, clientws] = inclients.get(jmessage.tohost);

                            const fromhost = getipfromws(ipAddress, ws);
                            //返すデータ
                            const sdpbypass = {
                                mtype: "sdp",
                                fromhost: fromhost,
                                body: sdp
                            }
                            clientws.send(JSON.stringify(sdpbypass));
                            console.log(sdpbypass.fromhost);
                    }catch(e){
                        console.log("エラー:" + e);
                    }
                }else if(jmessage.mtype == "ice"){
                    console.log("ICEのofferだってさ");
                    //ICEを取り出す
                    var ice = jmessage.body;
                    try{
                        //指定されたhostにICEオファー転送
                        const inclients = clients.get(ipAddress);
                        const [, clientws] = inclients.get(jmessage.tohost);

                            const fromhost = getipfromws(ipAddress, ws);

                            //返すデータ
                            const icebypass = {
                                mtype: "ice",
                                fromhost: fromhost,
                                body: JSON.parse(ice)
                            }
                            clientws.send(JSON.stringify(icebypass));
                            console.log(icebypass.fromhost);
                    }catch(e){
                        console.log("エラー:" + e);
                    }
                }
            }
            catch (e) {
                console.log("JSONじゃないっぽいわ");
                console.log(message);
                //登録処理
                if(message == "host"){
                    makeitems(ipAddress, true, ws);
                    let sendmessage = {
                        mtype: "myname",
                        fromhost: "nohoost-nohost-nohost",
                        body: getipfromws(ipAddress, ws)
                    }
                    ws.send(JSON.stringify(sendmessage));
                }else if(message == "client"){
                    makeitems(ipAddress, false, ws);
                }else if(message == "viewclients"){
                    
                    //クライアント一覧を返す
                    const getipaddress = clients.get(ipAddress);
                    try{
                        const jsonString = JSON.stringify(Array.from(getipaddress.entries()));

                        ws.send(jsonString);
                        console.log(jsonString);
                    }catch(e){
                        console.log("clientsendでエラー出てるけど大丈夫そ？");
                    }
                }else if(message == "hostview"){
                    const getipaddress = clients.get(ipAddress);
                    if (!getipaddress) return;

                    // host（ishost === true）のID（key）のみを抽出
                    const hostKeys = Array.from(getipaddress.entries())
                        .filter(([_, [isHost]]) => isHost) // isHostがtrueのものだけ
                        .map(([key]) => key);

                    try {
                        let sendhosts = {
                            mtype: "hosts",
                            fromhost: null,
                            body: JSON.stringify(hostKeys)
                        }
                        ws.send(JSON.stringify(sendhosts));
                        console.log("送信したホスト一覧: ", hostKeys);
                    } catch (e) {
                        console.log("hostviewの送信エラー:", e);
                    }
                }
            }
        })

        // 30秒ごとにPingを送る
        const pingInterval = setInterval(() => {
            ws.ping();
        }, 30000);
        // クライアントからPongを受信したとき
        ws.on('pong', () => {});

        ws.on('close', () => {
            if (clients.has(ipAddress)) {
                console.log("ipはある")
                const ipMap = clients.get(ipAddress);
                // WebSocketが切断されたクライアントを探して削除
                for (let [key, client] of ipMap) {
                    const [, clientSocket] = client; // [isHost, WebSocket
                    if (ws === clientSocket) {
                        ipMap.delete(key); // クライアントを削除
                        console.log(`削除されたクライアント: ${key}`);
                    }
                }
                
                // IPアドレスに紐づく全てのクライアントが削除された場合、IPアドレスの情報も削除
                if (ipMap.size === 0) {
                    clients.delete(ipAddress);
                    console.log(`IPアドレス ${ipAddress} の情報も削除されました。`);
                }
            }

            console.log('WebSocketの接続が解除された');
        });
});

//クライアント登録処理
function makeitems(ipAddress, Ishost, ws) {
    if(!clients.has(ipAddress)){
        clients.set(ipAddress, new Map());
    }
    const inipmap = clients.get(ipAddress);
    const geneid = geneId();
    inipmap.set(geneid, [Ishost, ws]);
    
    console.log(`ip: ${ipAddress} ,id: ${geneid} ,ishost ${Ishost} `);
}

//ランダムUUIDを作る
function geneId() {
    return crypto.randomUUID();
}

//IDをwsから割る。ipも引数
function getipfromws(ipAddress, ws){
        // IPアドレスに紐づいた Map（ID -> [isHost, WebSocket]）を取得
        const ipMap = clients.get(ipAddress);
    
        // Map の全てのエントリ（idと[isHost, ws]）をループする
        for (const [id, [isHost, socket]] of ipMap.entries()) {
            // 今の WebSocket が一致しているか確認
            if (socket === ws) {
                // 一致していれば、そのIDとホストかどうかを返す
                return id;
            }
        }
}

//サーバーを起動
const PORT = 8080;
server.listen(PORT, () => {
    console.log(`Server is started at http://localhost:${PORT}`);
});