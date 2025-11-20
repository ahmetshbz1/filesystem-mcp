import fs from 'fs/promises';
import path from 'path';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { validatePath, applyFileEdits } from '../lib.js';
const FileArgsSchema = z.object({
    operation: z.enum(['edit', 'mkdir', 'move', 'copy', 'delete']).describe('File operation type'),
    path: z.string().optional().describe('File/directory path'),
    source: z.string().optional().describe('Source path (for move/copy)'),
    destination: z.string().optional().describe('Destination path (for move/copy)'),
    edits: z.array(z.object({
        oldText: z.string(),
        newText: z.string(),
        useRegex: z.boolean().optional(),
        flags: z.string().optional()
    })).optional().describe('Edit operations'),
    dryRun: z.boolean().optional().default(false).describe('Preview edits without applying'),
    backup: z.boolean().optional().default(false).describe('Create backup before edit'),
    recursive: z.boolean().optional().default(true).describe('Recursive operation for directories'),
    overwrite: z.boolean().optional().default(false).describe('Overwrite existing files'),
    preserveTimestamps: z.boolean().optional().default(true).describe('Preserve timestamps (for copy)'),
    permissions: z.number().optional().describe('Directory permissions')
});
async function copyRecursive(source, destination, preserveTimestamps) {
    const stats = await fs.stat(source);
    if (stats.isDirectory()) {
        await fs.mkdir(destination, { recursive: true });
        const entries = await fs.readdir(source, { withFileTypes: true });
        await Promise.all(entries.map(async (entry) => {
            const srcPath = path.join(source, entry.name);
            const destPath = path.join(destination, entry.name);
            await copyRecursive(srcPath, destPath, preserveTimestamps);
        }));
        if (preserveTimestamps) {
            await fs.utimes(destination, stats.atime, stats.mtime);
        }
    }
    else {
        await fs.copyFile(source, destination);
        if (preserveTimestamps) {
            await fs.utimes(destination, stats.atime, stats.mtime);
        }
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
        name: 'file',
        description: 'Unified file operations tool for edit, mkdir, move, copy, and delete. Use operation parameter to specify the action.',
        inputSchema: zodToJsonSchema(FileArgsSchema)
    }
];
export const handlers = {
    async file(args) {
        const parsed = FileArgsSchema.safeParse(args);
        if (!parsed.success)
            throw new Error(`Invalid arguments for file: ${parsed.error}`);
        const operation = parsed.data.operation;
        switch (operation) {
            case 'edit':
                return await handleEdit(parsed.data);
            case 'mkdir':
                return await handleMkdir(parsed.data);
            case 'move':
                return await handleMove(parsed.data);
            case 'copy':
                return await handleCopy(parsed.data);
            case 'delete':
                return await handleDelete(parsed.data);
            default:
                throw new Error(`Unknown file operation: ${operation}`);
        }
    }
};
async function handleEdit(data) {
    if (!data.path)
        throw new Error('path is required for edit operation');
    if (!data.edits || data.edits.length === 0)
        throw new Error('edits array is required for edit operation');
    const validPath = await validatePath(data.path);
    let backupPath = '';
    if (data.backup && !data.dryRun) {
        backupPath = await createBackup(validPath);
    }
    const edits = data.edits;
    const result = await applyFileEdits(validPath, edits, data.dryRun);
    const message = backupPath ? `${result}\nBackup created: ${backupPath}` : result;
    return { content: [{ type: 'text', text: message }] };
}
async function handleMkdir(data) {
    if (!data.path)
        throw new Error('path is required for mkdir operation');
    const validPath = await validatePath(data.path);
    await fs.mkdir(validPath, {
        recursive: data.recursive,
        mode: data.permissions
    });
    return { content: [{ type: 'text', text: `Successfully created directory ${data.path}` }] };
}
async function handleMove(data) {
    if (!data.source)
        throw new Error('source is required for move operation');
    if (!data.destination)
        throw new Error('destination is required for move operation');
    const validSourcePath = await validatePath(data.source);
    const validDestPath = await validatePath(data.destination);
    if (!data.overwrite) {
        try {
            await fs.access(validDestPath);
            throw new Error(`Destination ${data.destination} already exists. Use overwrite:true to replace.`);
        }
        catch (error) {
            if (error.code !== 'ENOENT')
                throw error;
        }
    }
    await fs.rename(validSourcePath, validDestPath);
    return { content: [{ type: 'text', text: `Successfully moved ${data.source} to ${data.destination}` }] };
}
async function handleCopy(data) {
    if (!data.source)
        throw new Error('source is required for copy operation');
    if (!data.destination)
        throw new Error('destination is required for copy operation');
    const validSourcePath = await validatePath(data.source);
    const validDestPath = await validatePath(data.destination);
    if (!data.overwrite) {
        try {
            await fs.access(validDestPath);
            throw new Error(`Destination ${data.destination} already exists. Use overwrite:true to replace.`);
        }
        catch (error) {
            if (error.code !== 'ENOENT')
                throw error;
        }
    }
    const stats = await fs.stat(validSourcePath);
    if (stats.isDirectory() && data.recursive) {
        await copyRecursive(validSourcePath, validDestPath, data.preserveTimestamps);
    }
    else if (stats.isDirectory()) {
        throw new Error(`Source is a directory. Use recursive:true to copy directories.`);
    }
    else {
        await fs.copyFile(validSourcePath, validDestPath);
        if (data.preserveTimestamps) {
            await fs.utimes(validDestPath, stats.atime, stats.mtime);
        }
    }
    return { content: [{ type: 'text', text: `Successfully copied ${data.source} to ${data.destination}` }] };
}
async function handleDelete(data) {
    if (!data.path)
        throw new Error('path is required for delete operation');
    const validPath = await validatePath(data.path);
    const stats = await fs.stat(validPath);
    if (stats.isDirectory()) {
        if (data.recursive) {
            await fs.rm(validPath, { recursive: true, force: true });
        }
        else {
            await fs.rmdir(validPath);
        }
    }
    else {
        await fs.unlink(validPath);
    }
    return { content: [{ type: 'text', text: `Successfully deleted ${data.path}` }] };
}
