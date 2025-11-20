#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import fs from "fs/promises";
import path from "path";
import { expandHome } from './utils/path-utils.js';
import { logger } from './logger.js';
import { setAllowedDirectories } from './lib.js';
import { installHandlers } from './handlers/index.js';
// Command line argument parsing
const args = process.argv.slice(2);
if (args.length === 0) {
    logger.error("Usage: mcp-server-filesystem [allowed-directory] [additional-directories...]");
    logger.error("Note: Allowed directories can be provided via:");
    logger.error("  1. Command-line arguments (shown above)");
    logger.error("  2. MCP roots protocol (if client supports it)");
    logger.error("At least one directory must be provided by EITHER method for the server to operate.");
}
// Store allowed directories in normalized and resolved form
import { normalizePath } from './utils/path-utils.js';
let allowedDirectories = await Promise.all(args.map(async (dir) => {
    const expanded = expandHome(dir);
    const absolute = path.resolve(expanded);
    try {
        const resolved = await fs.realpath(absolute);
        return normalizePath(resolved);
    }
    catch (error) {
        return normalizePath(absolute);
    }
}));
// Validate that all directories exist and are accessible
await Promise.all(allowedDirectories.map(async (dir) => {
    try {
        const stats = await fs.stat(dir);
        if (!stats.isDirectory()) {
            logger.error(`Error: ${dir} is not a directory`);
            process.exit(1);
        }
    }
    catch (error) {
        logger.error(`Error accessing directory ${dir}: ${error instanceof Error ? error.message : String(error)}`);
        process.exit(1);
    }
}));
// Initialize the global allowedDirectories in lib.ts
setAllowedDirectories(allowedDirectories);
// Server setup
const server = new Server({
    name: "secure-filesystem-server",
    version: "0.2.0",
}, {
    capabilities: {
        tools: {},
    },
});
async function runServer() {
    const transport = new StdioServerTransport();
    installHandlers(server, allowedDirectories);
    await server.connect(transport);
    logger.info("Secure MCP Filesystem Server running on stdio");
    if (allowedDirectories.length === 0) {
        logger.warn("Started without allowed directories - waiting for client to provide roots via MCP protocol");
    }
}
runServer().catch((error) => {
    logger.error(`Fatal error running server: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
});
