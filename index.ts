#!/usr/bin/env node

import { logger } from './logger.js';

// The full original runtime has been archived to `legacy/index.full.ts`.
// Use `server.ts` as the runtime entrypoint; it composes handlers and starts the MCP server.

logger.info('The original large `index.ts` has been archived to `legacy/index.full.ts`.');
logger.info('To run the server:');
logger.info('  1) Build: `bun run build`');
logger.info('  2) Run:   `node dist/server.js`');

export {};
