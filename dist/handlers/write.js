import fs from 'fs/promises';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { validatePath, applyFileEdits } from '../lib.js';
const WriteFileArgsSchema = z.object({
    path: z.string(),
    content: z.string(),
    append: z.boolean().optional().default(false),
    encoding: z.enum(['utf8', 'utf16le', 'ascii', 'latin1']).optional().default('utf8'),
    atomic: z.boolean().optional().default(false).describe('Use atomic write (temp file + rename)'),
    backup: z.boolean().optional().default(false).describe('Create backup before write'),
    mode: z.number().optional().describe('File permissions (e.g., 0o644)')
});
const BatchWriteArgsSchema = z.object({
    operations: z.array(z.object({
        path: z.string(),
        content: z.string(),
        encoding: z.enum(['utf8', 'utf16le', 'ascii', 'latin1']).optional().default('utf8')
    })).min(1),
    atomic: z.boolean().optional().default(false)
});
const TemplateWriteArgsSchema = z.object({
    path: z.string(),
    template: z.string(),
    variables: z.record(z.string(), z.string()).describe('Key-value pairs for template substitution'),
    encoding: z.enum(['utf8', 'utf16le', 'ascii', 'latin1']).optional().default('utf8')
});
const EditOperation = z.object({
    oldText: z.string(),
    newText: z.string(),
    useRegex: z.boolean().optional(),
    flags: z.string().optional()
});
const EditFileArgsSchema = z.object({
    path: z.string(),
    edits: z.array(EditOperation),
    dryRun: z.boolean().default(false),
    backup: z.boolean().optional().default(false)
});
const CreateDirectoryArgsSchema = z.object({
    path: z.string(),
    recursive: z.boolean().optional().default(true),
    mode: z.number().optional().describe('Directory permissions')
});
const MoveFileArgsSchema = z.object({
    source: z.string(),
    destination: z.string(),
    overwrite: z.boolean().optional().default(false)
});
const DeleteFileArgsSchema = z.object({
    path: z.string(),
    recursive: z.boolean().optional().default(false).describe('For directories, delete recursively')
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
    { name: 'write_file', description: 'Write file with atomic writes, backup, and encoding support', inputSchema: zodToJsonSchema(WriteFileArgsSchema) },
    { name: 'batch_write', description: 'Write multiple files in one operation', inputSchema: zodToJsonSchema(BatchWriteArgsSchema) },
    { name: 'template_write', description: 'Write file from template with variable substitution', inputSchema: zodToJsonSchema(TemplateWriteArgsSchema) },
    { name: 'edit_file', description: 'Edit file with pattern replacement and backup', inputSchema: zodToJsonSchema(EditFileArgsSchema) },
    { name: 'create_directory', description: 'Create directory with permission control', inputSchema: zodToJsonSchema(CreateDirectoryArgsSchema) },
    { name: 'move_file', description: 'Move or rename file with overwrite control', inputSchema: zodToJsonSchema(MoveFileArgsSchema) },
    { name: 'delete_file', description: 'Delete file or directory', inputSchema: zodToJsonSchema(DeleteFileArgsSchema) },
];
export const handlers = {
    async write_file(args) {
        const parsed = WriteFileArgsSchema.safeParse(args);
        if (!parsed.success)
            throw new Error(`Invalid arguments for write_file: ${parsed.error}`);
        const validPath = await validatePath(parsed.data.path);
        let backupPath = '';
        if (parsed.data.backup) {
            backupPath = await createBackup(validPath);
        }
        if (parsed.data.append) {
            await fs.appendFile(validPath, parsed.data.content, { encoding: parsed.data.encoding });
        }
        else if (parsed.data.atomic) {
            await atomicWrite(validPath, parsed.data.content, parsed.data.encoding);
        }
        else {
            await fs.writeFile(validPath, parsed.data.content, { encoding: parsed.data.encoding });
        }
        if (parsed.data.mode !== undefined) {
            await fs.chmod(validPath, parsed.data.mode);
        }
        const message = `Successfully ${parsed.data.append ? 'appended to' : 'wrote to'} ${parsed.data.path}${backupPath ? ` (backup: ${backupPath})` : ''}`;
        return { content: [{ type: 'text', text: message }] };
    },
    async batch_write(args) {
        const parsed = BatchWriteArgsSchema.safeParse(args);
        if (!parsed.success)
            throw new Error(`Invalid arguments for batch_write: ${parsed.error}`);
        const results = await Promise.allSettled(parsed.data.operations.map(async (op) => {
            const validPath = await validatePath(op.path);
            if (parsed.data.atomic) {
                await atomicWrite(validPath, op.content, op.encoding);
            }
            else {
                await fs.writeFile(validPath, op.content, { encoding: op.encoding });
            }
            return op.path;
        }));
        const successful = results.filter((r) => r.status === 'fulfilled').length;
        const failed = results.filter((r) => r.status === 'rejected');
        let message = `Batch write complete: ${successful}/${parsed.data.operations.length} successful`;
        if (failed.length > 0) {
            const errors = failed.map((f) => f.reason.message).join(', ');
            message += `\nErrors: ${errors}`;
        }
        return { content: [{ type: 'text', text: message }] };
    },
    async template_write(args) {
        const parsed = TemplateWriteArgsSchema.safeParse(args);
        if (!parsed.success)
            throw new Error(`Invalid arguments for template_write: ${parsed.error}`);
        const validPath = await validatePath(parsed.data.path);
        let content = parsed.data.template;
        for (const [key, value] of Object.entries(parsed.data.variables)) {
            const regex = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'g');
            content = content.replace(regex, value);
        }
        await fs.writeFile(validPath, content, { encoding: parsed.data.encoding });
        return { content: [{ type: 'text', text: `Successfully wrote template to ${parsed.data.path}` }] };
    },
    async edit_file(args) {
        const parsed = EditFileArgsSchema.safeParse(args);
        if (!parsed.success)
            throw new Error(`Invalid arguments for edit_file: ${parsed.error}`);
        const validPath = await validatePath(parsed.data.path);
        let backupPath = '';
        if (parsed.data.backup && !parsed.data.dryRun) {
            backupPath = await createBackup(validPath);
        }
        const edits = parsed.data.edits;
        const result = await applyFileEdits(validPath, edits, parsed.data.dryRun);
        const message = backupPath ? `${result}\nBackup created: ${backupPath}` : result;
        return { content: [{ type: 'text', text: message }] };
    },
    async create_directory(args) {
        const parsed = CreateDirectoryArgsSchema.safeParse(args);
        if (!parsed.success)
            throw new Error(`Invalid arguments for create_directory: ${parsed.error}`);
        const validPath = await validatePath(parsed.data.path);
        await fs.mkdir(validPath, {
            recursive: parsed.data.recursive,
            mode: parsed.data.mode
        });
        return { content: [{ type: 'text', text: `Successfully created directory ${parsed.data.path}` }] };
    },
    async move_file(args) {
        const parsed = MoveFileArgsSchema.safeParse(args);
        if (!parsed.success)
            throw new Error(`Invalid arguments for move_file: ${parsed.error}`);
        const validSourcePath = await validatePath(parsed.data.source);
        const validDestPath = await validatePath(parsed.data.destination);
        if (!parsed.data.overwrite) {
            try {
                await fs.access(validDestPath);
                throw new Error(`Destination ${parsed.data.destination} already exists. Use overwrite:true to replace.`);
            }
            catch (error) {
                if (error.code !== 'ENOENT')
                    throw error;
            }
        }
        await fs.rename(validSourcePath, validDestPath);
        return { content: [{ type: 'text', text: `Successfully moved ${parsed.data.source} to ${parsed.data.destination}` }] };
    },
    async delete_file(args) {
        const parsed = DeleteFileArgsSchema.safeParse(args);
        if (!parsed.success)
            throw new Error(`Invalid arguments for delete_file: ${parsed.error}`);
        const validPath = await validatePath(parsed.data.path);
        const stats = await fs.stat(validPath);
        if (stats.isDirectory()) {
            if (parsed.data.recursive) {
                await fs.rm(validPath, { recursive: true, force: true });
            }
            else {
                await fs.rmdir(validPath);
            }
        }
        else {
            await fs.unlink(validPath);
        }
        return { content: [{ type: 'text', text: `Successfully deleted ${parsed.data.path}` }] };
    }
};
