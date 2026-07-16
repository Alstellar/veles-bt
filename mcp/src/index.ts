#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema
} from '@modelcontextprotocol/sdk/types.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BridgeServer, generateToken } from './bridgeServer.js';
import { DEFAULT_MCP_PORT } from './protocol.js';
import { callTool, PHASE_A_TOOLS } from './tools.js';

function parseArgs(argv: string[]): { port: number; token: string } {
  let port = DEFAULT_MCP_PORT;
  let token = '';

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--port' && argv[i + 1]) {
      port = Number(argv[i + 1]);
      i += 1;
      continue;
    }
    if (arg.startsWith('--port=')) {
      port = Number(arg.slice('--port='.length));
      continue;
    }
    if (arg === '--token' && argv[i + 1]) {
      token = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg.startsWith('--token=')) {
      token = arg.slice('--token='.length);
    }
  }

  if (!Number.isFinite(port) || port <= 0 || port > 65535) {
    port = DEFAULT_MCP_PORT;
  }
  if (!token) {
    token = generateToken();
  }

  return { port, token };
}

function printStartupBanner(port: number, token: string): void {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const repoMcp = path.resolve(here, '..');
  const commandPath = path.join(repoMcp, 'dist', 'index.js');

  // MCP stdio uses stdout for protocol — banner must go to stderr.
  console.error('════════════════════════════════════════════════════════');
  console.error(' Veles Helper MCP companion (Phase A — read tools)');
  console.error('════════════════════════════════════════════════════════');
  console.error(` Bridge:  http://127.0.0.1:${port}/v1/* (HTTP long-poll, Firefox-safe)`);
  console.error(` Health:  http://127.0.0.1:${port}/health`);
  console.error(` Port:    ${port}`);
  console.error(` Token:   ${token}`);
  console.error('');
  console.error(' Extension setup:');
  console.error('  1) Open Veles Helper → Settings → MCP bridge');
  console.error('  2) Enable MCP, paste Port + Token, click Save/Connect');
  console.error('');
  console.error(' Example MCP client config (Cursor / Claude Desktop):');
  console.error(
    JSON.stringify(
      {
        mcpServers: {
          'veles-helper': {
            command: 'node',
            args: [commandPath, '--port', String(port), '--token', token]
          }
        }
      },
      null,
      2
    )
  );
  console.error('════════════════════════════════════════════════════════');
}

async function main(): Promise<void> {
  const { port, token } = parseArgs(process.argv.slice(2));
  const bridge = new BridgeServer({ port, token, host: '127.0.0.1' });
  await bridge.start();
  printStartupBanner(port, token);

  const server = new Server(
    {
      name: 'veles-helper',
      version: '1.0.0'
    },
    {
      capabilities: {
        tools: {}
      }
    }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: PHASE_A_TOOLS.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema
    }))
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const name = request.params.name;
    const args = (request.params.arguments ?? {}) as Record<string, unknown>;
    return callTool(bridge, name, args);
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);

  const shutdown = async () => {
    await bridge.stop();
    process.exit(0);
  };
  process.on('SIGINT', () => {
    void shutdown();
  });
  process.on('SIGTERM', () => {
    void shutdown();
  });
}

main().catch((error) => {
  console.error('Failed to start veles-helper-mcp:', error);
  process.exit(1);
});
