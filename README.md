# Portapad_signal_pub

PortaPad 用の HTTPS / WebSocket シグナリングサーバーです。

## 必要なもの

- Node.js
- `privkey.pem`
- `fullchain.pem`

## 起動

```powershell
npm install
npm start
```

## 動作

- WebSocket で `host` と `client` の登録を受け付けます
- `sdpoffer` と `ice` をホストへ中継します
- ホスト一覧は全接続から集約して返します
- `https://localhost:8443/` に稼働確認ページを返します

## 確認用エンドポイント

- `GET /` : 稼働確認ページ
- `GET /health` : JSON のヘルスチェック

## 補足

- 現在の実装では接続 ID をグローバルに管理します
- そのため、同じ IP に限定されずにホストとクライアントをつなげます
