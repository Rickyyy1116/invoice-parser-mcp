# Invoice Parser MCP Server

Claude用のMCPサーバーで、請求書PDFから抽出したデータをGoogle Sheetsに自動転記します。

## 機能

- Claudeが請求書PDFから抽出した以下の情報をGoogle Sheetsに保存
  - 請求日（オプション）
  - 請求元（オプション）
  - 請求項目と金額

## セットアップ

1. Google Cloud Projectの設定
   - Google Cloud Consoleで新しいプロジェクトを作成
   - Google Sheets APIを有効化
   - サービスアカウントを作成し、JSONキーをダウンロード
   - ダウンロードしたJSONキーを`credentials.json`として保存

2. インストール
```bash
npm install @rikukawa/invoice-parser-mcp
```

3. MCP設定ファイルの更新
```json
{
  "mcpServers": {
    "invoice-parser": {
      "command": "node",
      "args": ["/path/to/node_modules/@rikukawa/invoice-parser-mcp/build/index.js"],
      "env": {
        "GOOGLE_CREDENTIALS_PATH": "/path/to/credentials.json",
        "SPREADSHEET_ID": "your-spreadsheet-id"
      },
      "disabled": false,
      "alwaysAllow": []
    }
  }
}
```

## 使用方法

1. Claudeに請求書PDFをアップロード
2. 以下のようにMCPツールを使用してデータを保存

```typescript
await use_mcp_tool({
  server_name: "invoice-parser",
  tool_name: "save_to_sheet",
  arguments: {
    items: [
      { item: "商品A", amount: 1000 },
      { item: "商品B", amount: 2000 }
    ],
    invoiceDate: "2023年10月1日",    // オプション
    sender: "株式会社〇〇"           // オプション
  }
});
```

## スプレッドシートの形式

スプレッドシートには以下の形式でデータが保存されます：

- ヘッダー行（1行目）
  - A1: 請求日
  - B1: 請求元
  - C1: 項目
  - D1: 金額

- データ行（2行目以降）
  - 1つ目の項目の行: すべての情報（請求日、請求元、項目、金額）
  - 2つ目以降の項目の行: 項目と金額のみ（請求日と請求元は空欄）

新しいデータは既存のデータの後に行として追加されていきます。

## 開発

```bash
# 依存パッケージのインストール
npm install

# 開発用ビルド（ファイル変更の監視）
npm run dev

# 本番用ビルド
npm run build
```

## ライセンス

MIT
