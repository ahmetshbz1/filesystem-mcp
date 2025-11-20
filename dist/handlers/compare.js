import fs from 'fs/promises';
import path from 'path';
import { createUnifiedDiff } from '../lib.js';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { logger } from '../logger.js';
import { validatePath } from '../lib.js';
const FileCompareArgsSchema = z.object({
    path1: z.string(),
    path2: z.string(),
    ignoreWhitespace: z.boolean().optional().default(false).describe('Ignore whitespace differences'),
    contextLines: z.number().optional().default(3).describe('Number of context lines in diff')
});
const BinaryCompareArgsSchema = z.object({
    path1: z.string(),
    path2: z.string()
});
const DirectoryCompareArgsSchema = z.object({
    path1: z.string(),
    path2: z.string(),
    recursive: z.boolean().optional().default(true),
    compareContent: z.boolean().optional().default(false).describe('Compare file contents, not just names')
});
async function compareBinaryFiles(path1, path2) {
    const [buffer1, buffer2] = await Promise.all([
        fs.readFile(path1),
        fs.readFile(path2)
    ]);
    if (buffer1.length !== buffer2.length)
        return false;
    return buffer1.equals(buffer2);
}
async function compareDirectories(dir1, dir2, recursive, compareContent) {
    const result = {
        onlyInFirst: [],
        onlyInSecond: [],
        different: [],
        identical: []
    };
    const [entries1, entries2] = await Promise.all([
        fs.readdir(dir1, { withFileTypes: true }),
        fs.readdir(dir2, { withFileTypes: true })
    ]);
    const names1 = new Set(entries1.map(e => e.name));
    const names2 = new Set(entries2.map(e => e.name));
    for (const entry of entries1) {
        if (!names2.has(entry.name)) {
            result.onlyInFirst.push(entry.name);
            continue;
        }
        const fullPath1 = path.join(dir1, entry.name);
        const fullPath2 = path.join(dir2, entry.name);
        const [stats1, stats2] = await Promise.all([
            fs.stat(fullPath1),
            fs.stat(fullPath2)
        ]);
        if (stats1.isDirectory() !== stats2.isDirectory()) {
            result.different.push(entry.name);
            continue;
        }
        if (stats1.isDirectory() && recursive) {
            const subResult = await compareDirectories(fullPath1, fullPath2, recursive, compareContent);
            result.onlyInFirst.push(...subResult.onlyInFirst.map(p => path.join(entry.name, p)));
            result.onlyInSecond.push(...subResult.onlyInSecond.map(p => path.join(entry.name, p)));
            result.different.push(...subResult.different.map(p => path.join(entry.name, p)));
            result.identical.push(...subResult.identical.map(p => path.join(entry.name, p)));
        }
        else if (stats1.isFile()) {
            if (compareContent) {
                const identical = await compareBinaryFiles(fullPath1, fullPath2);
                if (identical) {
                    result.identical.push(entry.name);
                }
                else {
                    result.different.push(entry.name);
                }
            }
            else {
                if (stats1.size === stats2.size && stats1.mtime.getTime() === stats2.mtime.getTime()) {
                    result.identical.push(entry.name);
                }
                else {
                    result.different.push(entry.name);
                }
            }
        }
    }
    for (const entry of entries2) {
        if (!names1.has(entry.name)) {
            result.onlyInSecond.push(entry.name);
        }
    }
    return result;
}
export const tools = [
    {
        name: 'file_compare',
        description: 'Compare two text files and show unified diff',
        inputSchema: zodToJsonSchema(FileCompareArgsSchema)
    },
    {
        name: 'binary_compare',
        description: 'Compare two binary files byte-by-byte',
        inputSchema: zodToJsonSchema(BinaryCompareArgsSchema)
    },
    {
        name: 'directory_compare',
        description: 'Compare two directories and show differences',
        inputSchema: zodToJsonSchema(DirectoryCompareArgsSchema)
    }
];
export const handlers = {
    file_compare: async (args) => {
        const { path1, path2, ignoreWhitespace, contextLines } = args;
        await validatePath(path1);
        await validatePath(path2);
        try {
            let [content1, content2] = await Promise.all([
                fs.readFile(path1, 'utf8'),
                fs.readFile(path2, 'utf8')
            ]);
            if (ignoreWhitespace) {
                content1 = content1.replace(/\s+/g, ' ').trim();
                content2 = content2.replace(/\s+/g, ' ').trim();
            }
            const diffText = createUnifiedDiff(content1, content2, path1);
            logger.info(`Compared files: ${path1} and ${path2}`);
            return { content: [{ type: 'text', text: diffText || 'Files are identical' }] };
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logger.error(`Error comparing files: ${errorMessage}`);
            throw new Error(`Failed to compare files: ${errorMessage}`);
        }
    },
    binary_compare: async (args) => {
        const { path1, path2 } = args;
        await validatePath(path1);
        await validatePath(path2);
        try {
            const [stats1, stats2] = await Promise.all([
                fs.stat(path1),
                fs.stat(path2)
            ]);
            if (stats1.size !== stats2.size) {
                return {
                    content: [{
                            type: 'text',
                            text: `Files are different:\n  ${path1}: ${stats1.size} bytes\n  ${path2}: ${stats2.size} bytes`
                        }]
                };
            }
            const identical = await compareBinaryFiles(path1, path2);
            return {
                content: [{
                        type: 'text',
                        text: identical
                            ? `Files are identical (${stats1.size} bytes)`
                            : `Files are different (${stats1.size} bytes each)`
                    }]
            };
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to compare binary files: ${errorMessage}`);
        }
    },
    directory_compare: async (args) => {
        const { path1, path2, recursive, compareContent } = args;
        const validPath1 = await validatePath(path1);
        const validPath2 = await validatePath(path2);
        try {
            const result = await compareDirectories(validPath1, validPath2, recursive, compareContent);
            const lines = [
                `Directory Comparison: ${path1} vs ${path2}`,
                '='.repeat(60),
                ''
            ];
            if (result.onlyInFirst.length > 0) {
                lines.push(`Only in ${path1}:`);
                result.onlyInFirst.forEach(p => lines.push(`  - ${p}`));
                lines.push('');
            }
            if (result.onlyInSecond.length > 0) {
                lines.push(`Only in ${path2}:`);
                result.onlyInSecond.forEach(p => lines.push(`  + ${p}`));
                lines.push('');
            }
            if (result.different.length > 0) {
                lines.push('Different:');
                result.different.forEach(p => lines.push(`  ~ ${p}`));
                lines.push('');
            }
            if (result.identical.length > 0 && compareContent) {
                lines.push(`Identical (${result.identical.length} files)`);
            }
            lines.push('');
            lines.push('Summary:');
            lines.push(`  Only in first: ${result.onlyInFirst.length}`);
            lines.push(`  Only in second: ${result.onlyInSecond.length}`);
            lines.push(`  Different: ${result.different.length}`);
            lines.push(`  Identical: ${result.identical.length}`);
            return { content: [{ type: 'text', text: lines.join('\n') }] };
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to compare directories: ${errorMessage}`);
        }
    }
};
