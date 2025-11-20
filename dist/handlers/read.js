import { createReadStream } from 'fs';
import fs from 'fs/promises';
import path from 'path';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { validatePath, tailFile, headFile } from '../lib.js';
const ReadTextFileArgsSchema = z.object({
    path: z.string(),
    tail: z.number().optional().describe('If provided, returns only the last N lines of the file'),
    head: z.number().optional().describe('If provided, returns only the first N lines of the file'),
    stream: z.boolean().optional().default(false).describe('If true, streams the file content in chunks for large files'),
    encoding: z.enum(['utf8', 'utf16le', 'ascii', 'latin1', 'base64', 'hex']).optional().default('utf8').describe('File encoding'),
    includeMetadata: z.boolean().optional().default(false).describe('Include file metadata (size, mtime, etc.) with content'),
    lineRange: z.object({
        start: z.number().min(1).describe('Start line (1-indexed)'),
        end: z.number().min(1).describe('End line (1-indexed)')
    }).optional().describe('Read specific line range')
});
const ReadBinaryFileArgsSchema = z.object({
    path: z.string(),
    maxSize: z.number().optional().default(10 * 1024 * 1024).describe('Maximum file size in bytes (default 10MB)')
});
const ReadMediaFileArgsSchema = z.object({ path: z.string() });
const ReadMultipleFilesArgsSchema = z.object({
    paths: z.array(z.string()).min(1, 'At least one file path must be provided'),
    encoding: z.enum(['utf8', 'utf16le', 'ascii', 'latin1']).optional().default('utf8').describe('File encoding for all files'),
    continueOnError: z.boolean().optional().default(true).describe('Continue reading other files if one fails')
});
async function readFileAsBase64Stream(filePath) {
    return new Promise((resolve, reject) => {
        const stream = createReadStream(filePath);
        const chunks = [];
        stream.on('data', (chunk) => chunks.push(chunk));
        stream.on('end', () => resolve(Buffer.concat(chunks).toString('base64')));
        stream.on('error', (err) => reject(err));
    });
}
export const tools = [
    { name: 'read_file', description: 'Read file as text (deprecated).', inputSchema: zodToJsonSchema(ReadTextFileArgsSchema) },
    { name: 'read_text_file', description: 'Read file as text with encoding, line range, and metadata options.', inputSchema: zodToJsonSchema(ReadTextFileArgsSchema) },
    { name: 'read_binary_file', description: 'Read binary file as base64.', inputSchema: zodToJsonSchema(ReadBinaryFileArgsSchema) },
    { name: 'read_media_file', description: 'Read media file (image/audio).', inputSchema: zodToJsonSchema(ReadMediaFileArgsSchema) },
    { name: 'read_multiple_files', description: 'Read multiple files with encoding support and error handling.', inputSchema: zodToJsonSchema(ReadMultipleFilesArgsSchema) },
];
export const handlers = {
    async read_file(args) {
        return handlers.read_text_file(args);
    },
    async read_text_file(args) {
        const parsed = ReadTextFileArgsSchema.safeParse(args);
        if (!parsed.success)
            throw new Error(`Invalid arguments for read_text_file: ${parsed.error}`);
        const validPath = await validatePath(parsed.data.path);
        if (parsed.data.head && parsed.data.tail)
            throw new Error('Cannot specify both head and tail');
        if (parsed.data.lineRange && (parsed.data.head || parsed.data.tail)) {
            throw new Error('Cannot specify lineRange with head or tail');
        }
        const stats = await fs.stat(validPath);
        let content;
        if (parsed.data.tail) {
            content = await tailFile(validPath, parsed.data.tail);
        }
        else if (parsed.data.head) {
            content = await headFile(validPath, parsed.data.head);
        }
        else if (parsed.data.lineRange) {
            const fileContent = await fs.readFile(validPath, { encoding: parsed.data.encoding });
            const lines = fileContent.split('\n');
            const { start, end } = parsed.data.lineRange;
            if (start > lines.length)
                throw new Error(`Start line ${start} exceeds file length ${lines.length}`);
            content = lines.slice(start - 1, end).join('\n');
        }
        else if (parsed.data.stream && stats.size > 1024 * 1024) {
            const stream = createReadStream(validPath, {
                encoding: parsed.data.encoding,
                highWaterMark: 64 * 1024
            });
            const chunks = [];
            for await (const chunk of stream) {
                chunks.push(chunk);
                if (chunks.length > 10)
                    break;
            }
            content = `Streaming file (${stats.size} bytes). First chunks:\n${chunks.join('')}\n... (truncated)`;
        }
        else {
            content = await fs.readFile(validPath, { encoding: parsed.data.encoding });
        }
        if (parsed.data.includeMetadata) {
            const metadata = {
                path: parsed.data.path,
                size: stats.size,
                created: stats.birthtime,
                modified: stats.mtime,
                accessed: stats.atime,
                encoding: parsed.data.encoding
            };
            return {
                content: [{
                        type: 'text',
                        text: `=== File Metadata ===\n${JSON.stringify(metadata, null, 2)}\n\n=== Content ===\n${content}`
                    }]
            };
        }
        return { content: [{ type: 'text', text: content }] };
    },
    async read_binary_file(args) {
        const parsed = ReadBinaryFileArgsSchema.safeParse(args);
        if (!parsed.success)
            throw new Error(`Invalid arguments for read_binary_file: ${parsed.error}`);
        const validPath = await validatePath(parsed.data.path);
        const stats = await fs.stat(validPath);
        if (stats.size > parsed.data.maxSize) {
            throw new Error(`File size ${stats.size} exceeds maximum ${parsed.data.maxSize} bytes`);
        }
        const data = await readFileAsBase64Stream(validPath);
        return {
            content: [{
                    type: 'text',
                    text: `Binary file (${stats.size} bytes):\nBase64: ${data}`
                }]
        };
    },
    async read_media_file(args) {
        const parsed = ReadMediaFileArgsSchema.safeParse(args);
        if (!parsed.success)
            throw new Error(`Invalid arguments for read_media_file: ${parsed.error}`);
        const validPath = await validatePath(parsed.data.path);
        const extension = path.extname(validPath).toLowerCase();
        const mimeTypes = {
            '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.bmp': 'image/bmp', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.flac': 'audio/flac'
        };
        const mimeType = mimeTypes[extension] || 'application/octet-stream';
        const data = await readFileAsBase64Stream(validPath);
        const type = mimeType.startsWith('image/') ? 'image' : mimeType.startsWith('audio/') ? 'audio' : 'blob';
        return { content: [{ type, data, mimeType }] };
    },
    async read_multiple_files(args) {
        const parsed = ReadMultipleFilesArgsSchema.safeParse(args);
        if (!parsed.success)
            throw new Error(`Invalid arguments for read_multiple_files: ${parsed.error}`);
        const results = await Promise.all(parsed.data.paths.map(async (filePath) => {
            try {
                const validPath = await validatePath(filePath);
                const content = await fs.readFile(validPath, { encoding: parsed.data.encoding });
                const stats = await fs.stat(validPath);
                return {
                    success: true,
                    path: filePath,
                    size: stats.size,
                    content
                };
            }
            catch (error) {
                if (parsed.data.continueOnError) {
                    return {
                        success: false,
                        path: filePath,
                        error: error instanceof Error ? error.message : String(error)
                    };
                }
                throw error;
            }
        }));
        const successCount = results.filter((r) => r.success).length;
        const failCount = results.filter((r) => !r.success).length;
        const output = results.map((r) => {
            if (r.success) {
                return `=== ${r.path} (${r.size} bytes) ===\n${r.content}\n`;
            }
            return `=== ${r.path} [ERROR] ===\n${r.error}\n`;
        });
        const summary = `\n=== Summary ===\nSuccessful: ${successCount}, Failed: ${failCount}\n`;
        return { content: [{ type: 'text', text: output.join('\n---\n') + summary }] };
    }
};
