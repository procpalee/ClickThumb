#!/usr/bin/env node
// ClickThumb MCP server entry point (stdio transport).
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './server.js';
import { shutdown } from './browser.js';

async function main() {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);

  const cleanup = async () => { await shutdown(); process.exit(0); };
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
}

main().catch((err) => {
  console.error('ClickThumb MCP server failed to start:', err);
  process.exit(1);
});
