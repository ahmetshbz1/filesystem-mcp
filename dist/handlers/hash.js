import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { logger } from '../logger.js';
import { validatePath } from '../lib.js';
const FileHashArgsSchema = z.object({
    path: z.string(),
    algorithm: z.enum(['md5', 'sha1', 'sha256', 'sha512']).optional().default('sha256')
});
const BatchHashArgsSchema = z.object({
    paths: z.array(z.string()).min(1),
    algorithm: z.enum(['md5', 'sha1', 'sha256', 'sha512']).optional().default('sha256')
});
const VerifyHashArgsSchema = z.object({
    path: z.string(),
    expectedHash: z.string(),
    algorithm: z.enum(['md5', 'sha1', 'sha256', 'sha512']).optional().default('sha256')
});
const DirectoryHashArgsSchema = z.object({
    path: z.string(),
    algorithm: z.enum(['md5', 'sha256', 'sha512']).optional().default('sha256'),
    includeHidden: z.boolean().optional().default(false)
});
async function calculateHash(filePath, algorithm) {
    const content = await fs.readFile(filePath);
    return crypto.createHash(algorithm).update(content).digest('hex');
}
async function hashDirectory(dirPath, algorithm, includeHidden) {
    const results = [];
    async function traverse(currentPath) {
        const entries = await fs.readdir(currentPath, { withFileTypes: true });
        for (const entry of entries) {
            if (!includeHidden && entry.name.startsWith('.'))
                continue;
            const fullPath = path.join(currentPath, entry.name);
            if (entry.isDirectory()) {
                await traverse(fullPath);
            }
            else if (entry.isFile()) {
                try {
                    const hash = await calculateHash(fullPath, algorithm);
                    const relativePath = path.relative(dirPath, fullPath);
                    results.push({ path: relativePath, hash });
                }
                catch { }
            }
        }
    }
    await traverse(dirPath);
    return results;
}
export const tools = [
    {
        name: 'file_hash',
        description: 'Calculate cryptographic hash of a file',
        inputSchema: zodToJsonSchema(FileHashArgsSchema)
    },
    {
        name: 'batch_hash',
        description: 'Calculate hashes for multiple files',
        inputSchema: zodToJsonSchema(BatchHashArgsSchema)
    },
    {
        name: 'verify_hash',
        description: 'Verify file integrity by comparing hash',
        inputSchema: zodToJsonSchema(VerifyHashArgsSchema)
    },
    {
        name: 'directory_hash',
        description: 'Calculate hashes for all files in directory recursively',
        inputSchema: zodToJsonSchema(DirectoryHashArgsSchema)
    }
];
export const handlers = {
    file_hash: async (args) => {
        const { path: filePath, algorithm = 'sha256' } = args;
        const validPath = await validatePath(filePath);
        const hash = await calculateHash(validPath, algorithm);
        logger.info(`Calculated ${algorithm} hash for ${filePath}`);
        return {
            content: [{
                    type: 'text',
                    text: `${algorithm.toUpperCase()}: ${hash}`
                }]
        };
    },
    batch_hash: async (args) => {
        const { paths, algorithm = 'sha256' } = args;
        const results = await Promise.all(paths.map(async (filePath) => {
            try {
                const validPath = await validatePath(filePath);
                const hash = await calculateHash(validPath, algorithm);
                return { path: filePath, hash, success: true };
            }
            catch (error) {
                return {
                    path: filePath,
                    error: error instanceof Error ? error.message : String(error),
                    success: false
                };
            }
        }));
        const lines = [`Batch Hash (${algorithm.toUpperCase()})`, '='.repeat(60), ''];
        results.forEach((result) => {
            if (result.success && 'hash' in result) {
                lines.push(`${result.hash}  ${result.path}`);
            }
            else if ('error' in result) {
                lines.push(`ERROR: ${result.path} - ${result.error}`);
            }
        });
        const successful = results.filter(r => r.success).length;
        lines.push('', `Processed: ${results.length} | Successful: ${successful}`);
        return { content: [{ type: 'text', text: lines.join('\n') }] };
    },
    verify_hash: async (args) => {
        const { path: filePath, expectedHash, algorithm = 'sha256' } = args;
        const validPath = await validatePath(filePath);
        const actualHash = await calculateHash(validPath, algorithm);
        const match = actualHash.toLowerCase() === expectedHash.toLowerCase();
        logger.info(`Hash verification for ${filePath}: ${match ? 'PASS' : 'FAIL'}`);
        return {
            content: [{
                    type: 'text',
                    text: [
                        `Hash Verification: ${match ? 'PASS' : 'FAIL'}`,
                        `Algorithm: ${algorithm.toUpperCase()}`,
                        `Expected:  ${expectedHash}`,
                        `Actual:    ${actualHash}`,
                        `Status:    ${match ? 'File integrity verified' : 'File has been modified'}`
                    ].join('\n')
                }]
        };
    },
    directory_hash: async (args) => {
        const { path: dirPath, algorithm = 'sha256', includeHidden } = args;
        const validPath = await validatePath(dirPath);
        const results = await hashDirectory(validPath, algorithm, includeHidden);
        if (results.length === 0) {
            return { content: [{ type: 'text', text: 'No files found in directory' }] };
        }
        const lines = [
            `Directory Hashes (${algorithm.toUpperCase()})`,
            `Path: ${dirPath}`,
            '='.repeat(60),
            ''
        ];
        results.forEach(({ path: filePath, hash }) => {
            lines.push(`${hash}  ${filePath}`);
        });
        lines.push('', `Total files: ${results.length}`);
        return { content: [{ type: 'text', text: lines.join('\n') }] };
    }
};
