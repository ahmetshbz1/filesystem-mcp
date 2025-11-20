import fs from 'fs/promises';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { validatePath } from '../lib.js';
const WriteArgsSchema = z.object({
    path: z.string().optional().describe('File path (for single write)'),
    content: z.string().optional().describe('File content (for single write)'),
    mode: z.enum(['single', 'batch', 'template']).default('single').describe('Write mode: single, batch, or template'),
    operations: z.array(z.object({
        path: z.string(),
        content: z.string(),
        encoding: z.enum(['utf8', 'utf16le', 'ascii', 'latin1']).optional().default('utf8')
    })).optional().describe('Batch operations array'),
    template: z.string().optional().describe('Template content with {{variables}}'),
    variables: z.record(z.string(), z.string()).optional().describe('Variables for template substitution'),
    append: z.boolean().optional().default(false).describe('Append to file instead of overwrite'),
    encoding: z.enum(['utf8', 'utf16le', 'ascii', 'latin1']).optional().default('utf8').describe('File encoding'),
    atomic: z.boolean().optional().default(false).describe('Use atomic write (temp file + rename)'),
    backup: z.boolean().optional().default(false).describe('Create backup before write'),
    permissions: z.number().optional().describe('File permissions (e.g., 0o644)')
});
async function atomicWrite(filePath, content, encoding) {
    const tempPath = `${filePath}.tmp.${Date.now()}`;
    try {
        await fs.writeFile(tempPath, content, { encoding });
        await fs.rename(tempPath, filePath);
    }
    catch (error) {
        try {
            await fs.unlink(tempPath);
        }
        catch { }
        throw error;
    }
}
async function createBackup(filePath) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = `${filePath}.backup.${timestamp}`;
    try {
        await fs.copyFile(filePath, backupPath);
        return backupPath;
    }
    catch (error) {
        if (error.code !== 'ENOENT')
            throw error;
        return '';
    }
}
export const tools = [
    {
        name: 'write',
        description: 'Unified write tool for single, batch, and template writes. Use mode parameter to specify write type.',
        inputSchema: zodToJsonSchema(WriteArgsSchema)
    }
];
export const handlers = {
    async write(args) {
        const parsed = WriteArgsSchema.safeParse(args);
        if (!parsed.success)
            throw new Error(`Invalid arguments for write: ${parsed.error}`);
        const writeMode = parsed.data.mode;
        switch (writeMode) {
            case 'single':
                return await handleSingleWrite(parsed.data);
            case 'batch':
                return await handleBatchWrite(parsed.data);
            case 'template':
                return await handleTemplateWrite(parsed.data);
            default:
                throw new Error(`Unknown write mode: ${writeMode}`);
        }
    }
};
async function handleSingleWrite(data) {
    if (!data.path)
        throw new Error('path is required for single write');
    if (data.content === undefined)
        throw new Error('content is required for single write');
    const validPath = await validatePath(data.path);
    let backupPath = '';
    if (data.backup) {
        backupPath = await createBackup(validPath);
    }
    if (data.append) {
        await fs.appendFile(validPath, data.content, { encoding: data.encoding });
    }
    else if (data.atomic) {
        await atomicWrite(validPath, data.content, data.encoding);
    }
    else {
        await fs.writeFile(validPath, data.content, { encoding: data.encoding });
    }
    if (data.permissions !== undefined) {
        await fs.chmod(validPath, data.permissions);
    }
    const message = `Successfully ${data.append ? 'appended to' : 'wrote to'} ${data.path}${backupPath ? ` (backup: ${backupPath})` : ''}`;
    return { content: [{ type: 'text', text: message }] };
}
async function handleBatchWrite(data) {
    if (!data.operations || data.operations.length === 0) {
        throw new Error('operations array is required for batch write');
    }
    const results = await Promise.allSettled(data.operations.map(async (op) => {
        const validPath = await validatePath(op.path);
        if (data.atomic) {
            await atomicWrite(validPath, op.content, op.encoding);
        }
        else {
            await fs.writeFile(validPath, op.content, { encoding: op.encoding });
        }
        return op.path;
    }));
    const successful = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.filter((r) => r.status === 'rejected');
    let message = `Batch write complete: ${successful}/${data.operations.length} successful`;
    if (failed.length > 0) {
        const errors = failed.map((f) => f.reason.message).join(', ');
        message += `\nErrors: ${errors}`;
    }
    return { content: [{ type: 'text', text: message }] };
}
async function handleTemplateWrite(data) {
    if (!data.path)
        throw new Error('path is required for template write');
    if (!data.template)
        throw new Error('template is required for template write');
    if (!data.variables)
        throw new Error('variables are required for template write');
    const validPath = await validatePath(data.path);
    let content = data.template;
    for (const [key, value] of Object.entries(data.variables)) {
        const regex = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'g');
        content = content.replace(regex, value);
    }
    await fs.writeFile(validPath, content, { encoding: data.encoding });
    return { content: [{ type: 'text', text: `Successfully wrote template to ${data.path}` }] };
}
