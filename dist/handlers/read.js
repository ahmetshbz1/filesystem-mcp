import { createReadStream } from 'fs';
import fs from 'fs/promises';
import path from 'path';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { validatePath, tailFile, headFile } from '../lib.js';
const ReadArgsSchema = z.object({
    path: z.string().optional().describe('File path (required for single file, ignored for multiple)'),
    paths: z.array(z.string()).optional().describe('Array of file paths (for multiple files)'),
    type: z.enum(['text', 'binary', 'media', 'multiple']).default('text').describe('Read type: text, binary, media, or multiple'),
    encoding: z.enum(['utf8', 'utf16le', 'ascii', 'latin1', 'base64', 'hex']).optional().default('utf8').describe('File encoding'),
    tail: z.number().optional().describe('Return only last N lines'),
    head: z.number().optional().describe('Return only first N lines'),
    stream: z.boolean().optional().default(false).describe('Stream large files'),
    includeMetadata: z.boolean().optional().default(false).describe('Include file metadata'),
    lineRange: z.object({
        start: z.number().min(1).describe('Start line (1-indexed)'),
        end: z.number().min(1).describe('End line (1-indexed)')
    }).optional().describe('Read specific line range'),
    maxSize: z.number().optional().default(10 * 1024 * 1024).describe('Max file size for binary (default 10MB)'),
    continueOnError: z.boolean().optional().default(true).describe('Continue on error for multiple files')
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
    {
        name: 'read',
        description: 'Unified read tool for text, binary, media, and multiple files. Use type parameter to specify read mode.',
        inputSchema: zodToJsonSchema(ReadArgsSchema)
    }
];
export const handlers = {
    async read(args) {
        const parsed = ReadArgsSchema.safeParse(args);
        if (!parsed.success)
            throw new Error(`Invalid arguments for read: ${parsed.error}`);
        const readType = parsed.data.type;
        switch (readType) {
            case 'text':
                return await handleTextRead(parsed.data);
            case 'binary':
                return await handleBinaryRead(parsed.data);
            case 'media':
                return await handleMediaRead(parsed.data);
            case 'multiple':
                return await handleMultipleRead(parsed.data);
            default:
                throw new Error(`Unknown read type: ${readType}`);
        }
    }
};
async function handleTextRead(data) {
    if (!data.path)
        throw new Error('path is required for text read');
    const validPath = await validatePath(data.path);
    if (data.head && data.tail)
        throw new Error('Cannot specify both head and tail');
    if (data.lineRange && (data.head || data.tail)) {
        throw new Error('Cannot specify lineRange with head or tail');
    }
    const stats = await fs.stat(validPath);
    let content;
    if (data.tail) {
        content = await tailFile(validPath, data.tail);
    }
    else if (data.head) {
        content = await headFile(validPath, data.head);
    }
    else if (data.lineRange) {
        const fileContent = await fs.readFile(validPath, { encoding: data.encoding });
        const lines = fileContent.split('\n');
        const { start, end } = data.lineRange;
        if (start > lines.length)
            throw new Error(`Start line ${start} exceeds file length ${lines.length}`);
        content = lines.slice(start - 1, end).join('\n');
    }
    else if (data.stream && stats.size > 1024 * 1024) {
        const stream = createReadStream(validPath, {
            encoding: data.encoding,
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
        content = await fs.readFile(validPath, { encoding: data.encoding });
    }
    if (data.includeMetadata) {
        const metadata = {
            path: data.path,
            size: stats.size,
            created: stats.birthtime,
            modified: stats.mtime,
            accessed: stats.atime,
            permissions: stats.mode.toString(8).slice(-3)
        };
        return {
            content: [{
                    type: 'text',
                    text: `File: ${data.path}\nMetadata: ${JSON.stringify(metadata, null, 2)}\n\nContent:\n${content}`
                }]
        };
    }
    return { content: [{ type: 'text', text: content }] };
}
async function handleBinaryRead(data) {
    if (!data.path)
        throw new Error('path is required for binary read');
    const validPath = await validatePath(data.path);
    const stats = await fs.stat(validPath);
    if (stats.size > data.maxSize) {
        throw new Error(`File size ${stats.size} exceeds maximum ${data.maxSize}`);
    }
    const base64Content = await readFileAsBase64Stream(validPath);
    return {
        content: [{
                type: 'text',
                text: `Binary file read as base64 (${stats.size} bytes):\n${base64Content}`
            }]
    };
}
async function handleMediaRead(data) {
    if (!data.path)
        throw new Error('path is required for media read');
    const validPath = await validatePath(data.path);
    const stats = await fs.stat(validPath);
    const ext = path.extname(validPath).toLowerCase();
    const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg'];
    const audioExtensions = ['.mp3', '.wav', '.ogg', '.m4a', '.flac'];
    if (imageExtensions.includes(ext)) {
        const imageData = await fs.readFile(validPath);
        const base64 = imageData.toString('base64');
        const mimeType = ext === '.svg' ? 'image/svg+xml' : `image/${ext.slice(1)}`;
        return {
            content: [{
                    type: 'image',
                    data: base64,
                    mimeType: mimeType
                }]
        };
    }
    else if (audioExtensions.includes(ext)) {
        const audioData = await fs.readFile(validPath);
        const base64 = audioData.toString('base64');
        return {
            content: [{
                    type: 'text',
                    text: `Audio file: ${data.path}\nSize: ${stats.size} bytes\nFormat: ${ext}\nBase64: ${base64.substring(0, 100)}... (truncated)`
                }]
        };
    }
    else {
        throw new Error(`Unsupported media type: ${ext}`);
    }
}
async function handleMultipleRead(data) {
    if (!data.paths || data.paths.length === 0) {
        throw new Error('paths array is required for multiple read');
    }
    const results = await Promise.allSettled(data.paths.map(async (filePath) => {
        const validPath = await validatePath(filePath);
        const content = await fs.readFile(validPath, { encoding: data.encoding });
        return { path: filePath, content };
    }));
    const successful = [];
    const failed = [];
    results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
            successful.push(result.value);
        }
        else {
            failed.push({ path: data.paths[index], error: result.reason.message });
        }
    });
    let text = `Read ${successful.length}/${data.paths.length} files successfully\n\n`;
    successful.forEach(({ path, content }) => {
        text += `=== ${path} ===\n${content}\n\n`;
    });
    if (failed.length > 0) {
        text += `\nFailed files:\n`;
        failed.forEach(({ path, error }) => {
            text += `- ${path}: ${error}\n`;
        });
    }
    return { content: [{ type: 'text', text }] };
}
