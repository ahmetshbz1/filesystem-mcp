// Utility tool - combines backup, compress, hash, merge operations
import fs from 'fs/promises';
import path from 'path';
import { createGzip, createBrotliCompress, createGunzip, createBrotliDecompress } from 'zlib';
import { createReadStream, createWriteStream } from 'fs';
import { createHash } from 'crypto';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { validatePath } from '../lib.js';
const UtilityArgsSchema = z.object({
    operation: z.enum([
        'backup-create', 'backup-restore', 'backup-list', 'backup-rotate',
        'compress', 'decompress',
        'hash', 'hash-verify', 'hash-batch', 'hash-directory',
        'merge-text', 'merge-json'
    ]),
    path: z.string().optional(),
    paths: z.array(z.string()).optional(),
    backupPath: z.string().optional(),
    targetPath: z.string().optional(),
    versioned: z.boolean().optional().default(false),
    keepLast: z.number().optional().default(5),
    format: z.enum(['gzip', 'brotli']).optional().default('gzip'),
    level: z.number().min(1).max(9).optional(),
    outputPath: z.string().optional(),
    algorithm: z.enum(['md5', 'sha1', 'sha256', 'sha512']).optional().default('sha256'),
    expectedHash: z.string().optional(),
    includeHidden: z.boolean().optional().default(false),
    separator: z.string().optional().default('\n'),
    removeDuplicateLines: z.boolean().optional().default(false),
    sort: z.boolean().optional().default(false),
    strategy: z.enum(['shallow', 'deep']).optional().default('deep')
});
export const tools = [{
        name: 'utility',
        description: 'Unified utility tool for backup, compress, hash, merge operations. Use operation parameter.',
        inputSchema: zodToJsonSchema(UtilityArgsSchema)
    }];
export const handlers = {
    async utility(args) {
        const parsed = UtilityArgsSchema.safeParse(args);
        if (!parsed.success)
            throw new Error("Invalid arguments: " + parsed.error);
        const op = parsed.data.operation;
        if (op.startsWith('backup-'))
            return handleBackup(parsed.data);
        if (op === 'compress' || op === 'decompress')
            return handleCompression(parsed.data);
        if (op.startsWith('hash'))
            return handleHash(parsed.data);
        if (op.startsWith('merge-'))
            return handleMerge(parsed.data);
        throw new Error('Invalid operation');
    }
};
async function handleBackup(data) {
    const op = data.operation.replace('backup-', '');
    if (op === 'create') {
        if (!data.path)
            throw new Error('path required');
        const validPath = await validatePath(data.path);
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupPath = data.backupPath || (data.versioned ? validPath + '.backup.' + timestamp : validPath + '.bak');
        await fs.copyFile(validPath, backupPath);
        return { content: [{ type: 'text', text: "Backup created: " + backupPath }] };
    }
    if (op === 'restore') {
        if (!data.backupPath)
            throw new Error('backupPath required');
        const validBackupPath = await validatePath(data.backupPath);
        const targetPath = data.targetPath || validBackupPath.replace(/\.backup.*$/, '').replace(/\.bak$/, '');
        await fs.copyFile(validBackupPath, targetPath);
        return { content: [{ type: 'text', text: "Restored to: " + targetPath }] };
    }
    if (op === 'list') {
        if (!data.path)
            throw new Error('path required');
        const dir = path.dirname(data.path);
        const base = path.basename(data.path);
        const entries = await fs.readdir(dir);
        const backups = entries.filter(e => e.startsWith(base + '.backup') || e === base + '.bak');
        return { content: [{ type: 'text', text: "Backups:\n" + backups.join('\n') }] };
    }
    if (op === 'rotate') {
        if (!data.path)
            throw new Error('path required');
        const dir = path.dirname(data.path);
        const base = path.basename(data.path);
        const entries = await fs.readdir(dir);
        const backups = entries.filter(e => e.startsWith(base + '.backup')).sort().reverse();
        if (backups.length > data.keepLast) {
            const toDelete = backups.slice(data.keepLast);
            for (const b of toDelete) {
                await fs.unlink(path.join(dir, b));
            }
            return { content: [{ type: 'text', text: "Rotated: deleted " + toDelete.length + " old backups" }] };
        }
        return { content: [{ type: 'text', text: "No rotation needed" }] };
    }
    throw new Error('Invalid backup operation');
}
async function handleCompression(data) {
    if (!data.path)
        throw new Error('path required');
    const validPath = await validatePath(data.path);
    if (data.operation === 'compress') {
        const outputPath = data.outputPath || validPath + (data.format === 'brotli' ? '.br' : '.gz');
        const input = createReadStream(validPath);
        const output = createWriteStream(outputPath);
        const compress = data.format === 'brotli' ? createBrotliCompress() : createGzip({ level: data.level });
        await new Promise((resolve, reject) => {
            input.pipe(compress).pipe(output);
            output.on('finish', () => resolve());
            output.on('error', reject);
        });
        return { content: [{ type: 'text', text: "Compressed to: " + outputPath }] };
    }
    if (data.operation === 'decompress') {
        const outputPath = data.outputPath || validPath.replace(/\.(gz|br)$/, '');
        const input = createReadStream(validPath);
        const output = createWriteStream(outputPath);
        const format = data.format || (validPath.endsWith('.br') ? 'brotli' : 'gzip');
        const decompress = format === 'brotli' ? createBrotliDecompress() : createGunzip();
        await new Promise((resolve, reject) => {
            input.pipe(decompress).pipe(output);
            output.on('finish', () => resolve());
            output.on('error', reject);
        });
        return { content: [{ type: 'text', text: "Decompressed to: " + outputPath }] };
    }
    throw new Error('Invalid compression operation');
}
async function handleHash(data) {
    const op = data.operation;
    if (op === 'hash') {
        if (!data.path)
            throw new Error('path required');
        const validPath = await validatePath(data.path);
        const content = await fs.readFile(validPath);
        const hash = createHash(data.algorithm).update(content).digest('hex');
        return { content: [{ type: 'text', text: data.algorithm + ": " + hash }] };
    }
    if (op === 'hash-verify') {
        if (!data.path || !data.expectedHash)
            throw new Error('path and expectedHash required');
        const validPath = await validatePath(data.path);
        const content = await fs.readFile(validPath);
        const hash = createHash(data.algorithm).update(content).digest('hex');
        const match = hash.toLowerCase() === data.expectedHash.toLowerCase();
        return { content: [{ type: 'text', text: match ? 'PASS: Hash matches' : 'FAIL: Hash mismatch' }] };
    }
    if (op === 'hash-batch') {
        if (!data.paths)
            throw new Error('paths required');
        const results = await Promise.all(data.paths.map(async (p) => {
            const validPath = await validatePath(p);
            const content = await fs.readFile(validPath);
            const hash = createHash(data.algorithm).update(content).digest('hex');
            return p + ": " + hash;
        }));
        return { content: [{ type: 'text', text: results.join('\n') }] };
    }
    if (op === 'hash-directory') {
        if (!data.path)
            throw new Error('path required');
        const validPath = await validatePath(data.path);
        const hashes = [];
        await hashDirectory(validPath, data.algorithm, hashes, data.includeHidden);
        return { content: [{ type: 'text', text: hashes.join('\n') }] };
    }
    throw new Error('Invalid hash operation');
}
async function hashDirectory(dirPath, algorithm, results, includeHidden) {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    for (const entry of entries) {
        if (!includeHidden && entry.name.startsWith('.'))
            continue;
        const fullPath = path.join(dirPath, entry.name);
        if (entry.isFile()) {
            const content = await fs.readFile(fullPath);
            const hash = createHash(algorithm).update(content).digest('hex');
            results.push(hash + "  " + fullPath);
        }
        else if (entry.isDirectory()) {
            await hashDirectory(fullPath, algorithm, results, includeHidden);
        }
    }
}
async function handleMerge(data) {
    const op = data.operation;
    if (op === 'merge-text') {
        if (!data.paths || !data.outputPath)
            throw new Error('paths and outputPath required');
        const contents = await Promise.all(data.paths.map(async (p) => {
            const validPath = await validatePath(p);
            return await fs.readFile(validPath, 'utf8');
        }));
        let lines = contents.flatMap(c => c.split('\n'));
        if (data.removeDuplicateLines)
            lines = [...new Set(lines)];
        if (data.sort)
            lines.sort();
        const outputPath = await validatePath(data.outputPath);
        await fs.writeFile(outputPath, lines.join(data.separator), 'utf8');
        return { content: [{ type: 'text', text: "Merged " + data.paths.length + " files to: " + data.outputPath }] };
    }
    if (op === 'merge-json') {
        if (!data.paths || !data.outputPath)
            throw new Error('paths and outputPath required');
        const objects = await Promise.all(data.paths.map(async (p) => {
            const validPath = await validatePath(p);
            const content = await fs.readFile(validPath, 'utf8');
            return JSON.parse(content);
        }));
        let merged = {};
        if (data.strategy === 'shallow') {
            for (const obj of objects)
                merged = { ...merged, ...obj };
        }
        else {
            merged = deepMerge(...objects);
        }
        const outputPath = await validatePath(data.outputPath);
        await fs.writeFile(outputPath, JSON.stringify(merged, null, 2), 'utf8');
        return { content: [{ type: 'text', text: "Merged " + data.paths.length + " JSON files to: " + data.outputPath }] };
    }
    throw new Error('Invalid merge operation');
}
function deepMerge(...objects) {
    const result = {};
    for (const obj of objects) {
        for (const key in obj) {
            if (obj[key] && typeof obj[key] === 'object' && !Array.isArray(obj[key])) {
                result[key] = deepMerge(result[key] || {}, obj[key]);
            }
            else {
                result[key] = obj[key];
            }
        }
    }
    return result;
}
