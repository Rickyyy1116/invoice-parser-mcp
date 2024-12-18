#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { google } from 'googleapis';

interface InvoiceItem {
  item: string;
  amount: number;
}

interface InvoiceData {
  items: InvoiceItem[];
  invoiceDate?: string;
  sender?: string;
}

// Google Sheetsへのデータ転記クラス
class SheetWriter {
  private auth;
  private sheets;
  private spreadsheetId: string;
  
  constructor() {
    const credentialsPath = process.env.GOOGLE_CREDENTIALS_PATH;
    const spreadsheetId = process.env.SPREADSHEET_ID;

    if (!credentialsPath) {
      throw new Error('GOOGLE_CREDENTIALS_PATH environment variable is not set');
    }

    if (!spreadsheetId) {
      throw new Error('SPREADSHEET_ID environment variable is not set');
    }

    this.spreadsheetId = spreadsheetId;
    this.auth = new google.auth.GoogleAuth({
      keyFile: credentialsPath,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    this.sheets = google.sheets({ version: 'v4', auth: this.auth });
  }
  
  async writeToSheet(data: InvoiceData) {
    const { items, invoiceDate = '', sender = '' } = data;
    
    // まず現在のデータを取得
    const response = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: 'A:D', // A列からD列までのデータを取得
    });
    
    const currentValues = response.data.values || [];
    
    // ヘッダー行がない場合は追加
    if (currentValues.length === 0) {
      currentValues.push(['請求日', '請求元', '項目', '金額']);
    }

    // 請求項目ごとに新しい行を作成
    const newRows = items.map(({ item, amount }, index) => {
      // 最初の項目の行には全てのメタデータを含める
      if (index === 0) {
        return [invoiceDate, sender, item, amount];
      }
      // 2つ目以降の項目は、メタデータ部分は空欄
      return ['', '', item, amount];
    });

    // 新しい行を追加
    const nextRow = currentValues.length + 1;
    await this.sheets.spreadsheets.values.update({
      spreadsheetId: this.spreadsheetId,
      range: `A${nextRow}`, // 次の空き行から開始
      valueInputOption: 'RAW',
      requestBody: {
        values: newRows,
      },
    });
  }
}

class InvoiceParserServer {
  private server: Server;
  private writer: SheetWriter;
  private transport: StdioServerTransport;
  
  constructor() {
    this.server = new Server(
      {
        name: 'invoice-parser',
        version: '0.1.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );
    
    this.writer = new SheetWriter();
    this.transport = new StdioServerTransport();
    
    this.setupHandlers();
  }
  
  private setupHandlers() {
    // ツール一覧のハンドラー
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'save_to_sheet',
          description: 'Claudeが抽出した請求書データをGoogle Sheetsに保存',
          inputSchema: {
            type: 'object',
            properties: {
              items: {
                type: 'array',
                description: '請求項目と金額の配列',
                items: {
                  type: 'object',
                  properties: {
                    item: {
                      type: 'string',
                      description: '請求項目'
                    },
                    amount: {
                      type: 'number',
                      description: '金額'
                    }
                  },
                  required: ['item', 'amount']
                }
              },
              invoiceDate: {
                type: 'string',
                description: '請求日（オプション）'
              },
              sender: {
                type: 'string',
                description: '請求元（オプション）'
              }
            },
            required: ['items']
          }
        }
      ]
    }));
    
    // ツール実行のハンドラー
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      if (request.params.name !== 'save_to_sheet') {
        throw new McpError(
          ErrorCode.MethodNotFound,
          `Unknown tool: ${request.params.name}`
        );
      }
      
      const args = request.params.arguments as unknown;
      if (!this.isInvoiceData(args)) {
        throw new McpError(
          ErrorCode.InvalidParams,
          'Invalid invoice data format'
        );
      }
      
      try {
        // Google Sheetsに保存
        await this.writer.writeToSheet(args);
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                message: '請求書データを正常に保存しました',
                savedData: args,
              }, null, 2),
            },
          ],
        };
      } catch (err) {
        const error = err as Error;
        throw new McpError(
          ErrorCode.InternalError,
          `Error saving to spreadsheet: ${error.message}`
        );
      }
    });
  }

  private isInvoiceData(data: unknown): data is InvoiceData {
    if (typeof data !== 'object' || data === null) return false;
    
    const d = data as Record<string, unknown>;
    if (!Array.isArray(d.items)) return false;
    
    return d.items.every(item => 
      typeof item === 'object' && item !== null &&
      typeof (item as InvoiceItem).item === 'string' &&
      typeof (item as InvoiceItem).amount === 'number'
    );
  }
  
  async run() {
    await this.server.connect(this.transport);
    console.error('Invoice Parser MCP server running on stdio');
    
    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }
}

const server = new InvoiceParserServer();
server.run().catch((err: Error) => console.error('Server error:', err.message));