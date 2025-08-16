# Portapad_signal_pub

## 概要

Portapad のシグナリングサーバーの公開用リポジトリです。  
すべてをオンプレミス環境で動かしたい方に向いています。

## 前提条件

- Node.js 実行環境（v18 以上推奨）
- 有効な SSL/TLS 証明書（`fullchain.pem` と `private.pem` など）

## インストール手順

1. リポジトリをクローンします:

    ```bash
    git clone https://github.com/TeamKOTOCA/Portapad_signal_pub.git
    cd Portapad_signal_pub
    ```

2. 必要なパッケージをインストールします:

    ```bash
    npm install crypto express ws http
    ```

3. 証明書ファイルを用意します（例: `fullchain.pem` と `private.pem` をご自身の証明書に置き換えてください）。

4. サーバーを起動します:

    ```bash
    node server.js
    ```

5. ブラウザで以下にアクセスして動作確認します:

    ```
    https://localhost:8443/
    ```

    「起動中」と表示されれば、正常に起動しています。

## 注意事項

- 自己署名証明書を使用した場合、WebSocket 接続が失敗する可能性があります。Let's Encrypt などの信頼された認証局による証明書を使用してください。
- 稀にエラーが出る場合があります。コードは比較的シンプルな構造のため、ご自身で解析・対応が可能です。

## 使用技術

- Node.js
- Express
- ws（WebSocket）
- HTTPS（TLS）

## ライセンス

このプロジェクトは [CC BY-SA](https://creativecommons.org/licenses/by-sa/4.0/deed.ja) ライセンスの下で提供されています。

[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/TeamKOTOCA/Portapad_signal_pub)
