import { logger } from '../logger.js';
import { CallToolRequestSchema, ListToolsRequestSchema, RootsListChangedNotificationSchema } from '@modelcontextprotocol/sdk/types.js';
import { setAllowedDirectories } from '../lib.js';
import { getValidRootDirectories } from '../roots-utils.js';
import * as read from './read.js';
import * as write from './write.js';
import * as file from './file.js';
import * as list from './list.js';
import * as search from './search.js';
import * as info from './info.js';
import * as compare from './compare.js';
import * as utility from './utility.js';
import * as git from './git.js';
import * as validate from './validate.js';
const allTools = [...read.tools, ...write.tools, ...file.tools, ...list.tools, ...search.tools, ...info.tools, ...compare.tools, ...utility.tools, ...git.tools, ...validate.tools];
export function installHandlers(server, allowedDirectories) {
    setAllowedDirectories(allowedDirectories);
    server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: allTools }));
    const handlerMap = {
        ...read.handlers,
        ...write.handlers,
        ...file.handlers,
        ...list.handlers,
        ...search.handlers,
        ...info.handlers,
        ...compare.handlers,
        ...utility.handlers,
        ...git.handlers,
        ...validate.handlers,
    };
    const rateLimit = new Map();
    const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
    const RATE_LIMIT_MAX = 100; // requests per window
    server.setRequestHandler(CallToolRequestSchema, async (request) => {
        try {
            const params = request.params;
            const { name, arguments: args = {} } = params;
            const now = Date.now();
            // Rate limiting
            const key = `tool_${name}`;
            const current = rateLimit.get(key);
            if (current) {
                if (now > current.resetTime) {
                    current.count = 1;
                    current.resetTime = now + RATE_LIMIT_WINDOW;
                }
                else if (current.count >= RATE_LIMIT_MAX) {
                    logger.warn(`Rate limit exceeded for tool: ${name}`);
                    return { content: [{ type: 'text', text: 'Rate limit exceeded. Please try again later.' }], isError: true };
                }
                else {
                    current.count++;
                }
            }
            else {
                rateLimit.set(key, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
            }
            // Audit logging
            logger.info(`Audit: Tool ${name} called with args: ${JSON.stringify(args)}`);
            const fn = handlerMap[name];
            if (!fn)
                throw new Error(`Unknown tool: ${name}`);
            const result = await fn(args);
            return result;
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            return { content: [{ type: 'text', text: `Error: ${errorMessage}` }], isError: true };
        }
    });
    async function updateAllowedDirectoriesFromRoots(requestedRoots) {
        const validatedRootDirs = await getValidRootDirectories(requestedRoots);
        if (validatedRootDirs.length > 0) {
            allowedDirectories = [...validatedRootDirs];
            setAllowedDirectories(allowedDirectories);
            logger.info(`Updated allowed directories from MCP roots: ${validatedRootDirs.length} valid directories`);
        }
        else {
            logger.warn('No valid root directories provided by client');
        }
    }
    server.setNotificationHandler(RootsListChangedNotificationSchema, async () => {
        try {
            const response = await server.listRoots();
            if (response && 'roots' in response)
                await updateAllowedDirectoriesFromRoots(response.roots);
        }
        catch (error) {
            logger.error(`Failed to request roots from client: ${error instanceof Error ? error.message : String(error)}`);
        }
    });
    server.oninitialized = async () => {
        const clientCapabilities = server.getClientCapabilities();
        if (clientCapabilities?.roots) {
            try {
                const response = await server.listRoots();
                if (response && 'roots' in response)
                    await updateAllowedDirectoriesFromRoots(response.roots);
                else
                    logger.warn('Client returned no roots set, keeping current settings');
            }
            catch (error) {
                logger.error(`Failed to request initial roots from client: ${error instanceof Error ? error.message : String(error)}`);
            }
        }
        else {
            if (allowedDirectories.length > 0) {
                logger.info(`Client does not support MCP Roots, using allowed directories set from server args: ${allowedDirectories.join(', ')}`);
            }
            else {
                throw new Error('Server cannot operate: No allowed directories available.');
            }
        }
    };
}
