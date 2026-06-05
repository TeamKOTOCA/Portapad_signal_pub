const https = require('https');
const fs = require('fs');
const WebSocket = require('ws');
const crypto = require('crypto');

const PORT = 8443;
const options = {
  key: fs.readFileSync('privkey.pem'),
  cert: fs.readFileSync('fullchain.pem'),
};

/**
 * 接続一覧
 * id -> { ws, role, ipAddress }
 */
const connections = new Map();

function normalizeIp(address) {
  if (!address) {
    return 'unknown';
  }
  return address.replace(/^::ffff:/, '').replace(/^::1$/, '127.0.0.1');
}

function getConnectionIdBySocket(ws) {
  for (const [id, entry] of connections.entries()) {
    if (entry.ws === ws) {
      return id;
    }
  }
  return null;
}

function cleanupSocket(ws) {
  const removed = [];
  for (const [id, entry] of connections.entries()) {
    if (entry.ws === ws) {
      connections.delete(id);
      removed.push(id);
    }
  }
  return removed;
}

function registerConnection(ws, role, ipAddress) {
  cleanupSocket(ws);
  const id = crypto.randomUUID();
  connections.set(id, { ws, role, ipAddress });
  return id;
}

function sendToClient(clientId, payload) {
  const entry = connections.get(clientId);
  if (!entry) {
    return false;
  }

  if (entry.ws.readyState !== WebSocket.OPEN) {
    connections.delete(clientId);
    return false;
  }

  entry.ws.send(JSON.stringify(payload));
  return true;
}

function parseBody(body) {
  if (body && typeof body === 'object') {
    return body;
  }

  if (typeof body === 'string') {
    return JSON.parse(body);
  }

  return body;
}

function getHostIds() {
  return Array.from(connections.entries())
    .filter(([, entry]) => entry.role === 'host' && entry.ws.readyState === WebSocket.OPEN)
    .map(([id]) => id);
}

function getClientSnapshot() {
  return Array.from(connections.entries()).map(([id, entry]) => ({
    id,
    role: entry.role,
    ipAddress: entry.ipAddress,
    readyState: entry.ws.readyState,
  }));
}

const server = https.createServer(options, (req, res) => {
  const url = new URL(req.url, `https://${req.headers.host || 'localhost'}`);

  if (req.method === 'GET' && url.pathname === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<!DOCTYPE html>
<html lang="ja">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>PortaPad Signaling Server</title>
    <style>
      body {
        margin: 0;
        font-family: "Segoe UI", "Hiragino Kaku Gothic ProN", "Yu Gothic", sans-serif;
        background: #f6f8fc;
        color: #1f2a37;
        display: grid;
        min-height: 100vh;
        place-items: center;
      }
      main {
        width: min(560px, calc(100vw - 32px));
        background: white;
        border: 1px solid #d3deee;
        border-radius: 16px;
        box-shadow: 0 6px 24px rgba(20, 100, 204, 0.12);
        padding: 28px;
        box-sizing: border-box;
        text-align: center;
      }
      .status {
        display: inline-block;
        margin-top: 8px;
        padding: 8px 14px;
        border-radius: 999px;
        background: #e7f4ff;
        color: #145ca8;
        font-weight: 700;
      }
      p {
        line-height: 1.7;
      }
      code {
        background: #f1f5f9;
        padding: 2px 6px;
        border-radius: 6px;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>PortaPad Signaling Server</h1>
      <p class="status">稼働中</p>
      <p>WebRTC のシグナリングを中継しています。<br>Web クライアントと Windows ホストの両方から接続してください。</p>
      <p>接続先の既定値は <code>wss://localhost:8443</code> です。</p>
    </main>
  </body>
</html>`);
    return;
  }

  if (req.method === 'GET' && url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({
      ok: true,
      hosts: getHostIds().length,
      clients: connections.size,
    }));
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Not Found');
});

const wss = new WebSocket.Server({ server });

wss.on('connection', (ws, req) => {
  const ipAddress = normalizeIp(req.socket.remoteAddress);
  console.log(`接続: ${ipAddress}`);

  let registeredId = null;

  ws.on('message', rawMessage => {
    const message = rawMessage.toString();
    console.log(`受信: ${message}`);

    if (message === 'host') {
      registeredId = registerConnection(ws, 'host', ipAddress);
      ws.send(JSON.stringify({
        mtype: 'myname',
        fromhost: 'nohoost-nohost-nohost',
        body: registeredId,
      }));
      return;
    }

    if (message === 'client') {
      registeredId = registerConnection(ws, 'client', ipAddress);
      return;
    }

    if (message === 'hostview') {
      ws.send(JSON.stringify({
        mtype: 'hosts',
        fromhost: null,
        body: JSON.stringify(getHostIds()),
      }));
      return;
    }

    if (message === 'viewclients') {
      ws.send(JSON.stringify(getClientSnapshot()));
      return;
    }

    let parsed;
    try {
      parsed = JSON.parse(message);
    } catch {
      return;
    }

    if (parsed.mtype !== 'sdpoffer' && parsed.mtype !== 'ice') {
      return;
    }

    const targetId = parsed.tohost;
    const fromhost = getConnectionIdBySocket(ws) || registeredId;
    if (!targetId || !fromhost) {
      return;
    }

    let body;
    try {
      body = parseBody(parsed.body);
    } catch (error) {
      console.log(`本文の解析に失敗: ${error}`);
      return;
    }

    const payload = {
      mtype: parsed.mtype === 'sdpoffer' ? 'sdp' : 'ice',
      fromhost,
      body,
    };

    if (!sendToClient(targetId, payload)) {
      console.log(`転送失敗: target=${targetId}, from=${fromhost}`);
    }
  });

  const pingInterval = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.ping();
    }
  }, 30000);

  ws.on('close', () => {
    clearInterval(pingInterval);
    const removed = cleanupSocket(ws);
    console.log(`切断: ${ipAddress} (${removed.join(', ') || 'no-id'})`);
  });

  ws.on('error', error => {
    console.log(`WebSocket エラー: ${ipAddress} ${error.message}`);
  });
});

server.listen(PORT, () => {
  console.log(`HTTPS Server is started at https://localhost:${PORT}`);
});
