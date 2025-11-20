import fs from 'fs/promises';
import path from 'path';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { validatePath, formatSize } from '../lib.js';
import { minimatch } from 'minimatch';
const ListDirectoryArgsSchema = z.object({
    path: z.string(),
    page: z.number().min(1).optional().default(1).describe('Page number for pagination'),
    pageSize: z.number().min(1).max(1000).optional().default(100).describe('Items per page'),
    includeHidden: z.boolean().optional().default(false).describe('Include hidden files (starting with .)'),
    pattern: z.string().optional().describe('Filter by glob pattern')
});
const ListDirectoryWithSizesArgsSchema = z.object({
    path: z.string(),
    sortBy: z.enum(['name', 'size', 'mtime', 'atime']).optional().default('name'),
    includePermissions: z.boolean().optional().default(false).describe('Include file permissions'),
    includeHidden: z.boolean().optional().default(false),
    pattern: z.string().optional()
});
const DirectoryTreeArgsSchema = z.object({
    path: z.string(),
    excludePatterns: z.array(z.string()).optional().default([]),
    maxDepth: z.number().min(1).optional().describe('Maximum depth to traverse'),
    includeSize: z.boolean().optional().default(false).describe('Include file sizes in tree'),
    respectGitignore: z.boolean().optional().default(false).describe('Respect .gitignore patterns')
});
const RecursiveListArgsSchema = z.object({
    path: z.string(),
    pattern: z.string().optional().describe('Filter by glob pattern'),
    excludePatterns: z.array(z.string()).optional().default([]),
    maxDepth: z.number().optional(),
    includeStats: z.boolean().optional().default(false)
});
function formatPermissions(mode) {
    const perms = [
        (mode & 0o400) ? 'r' : '-',
        (mode & 0o200) ? 'w' : '-',
        (mode & 0o100) ? 'x' : '-',
        (mode & 0o040) ? 'r' : '-',
        (mode & 0o020) ? 'w' : '-',
        (mode & 0o010) ? 'x' : '-',
        (mode & 0o004) ? 'r' : '-',
        (mode & 0o002) ? 'w' : '-',
        (mode & 0o001) ? 'x' : '-',
    ];
    return perms.join('');
}
async function readGitignore(dirPath) {
    try {
        const gitignorePath = path.join(dirPath, '.gitignore');
        const content = await fs.readFile(gitignorePath, 'utf8');
        return content.split('\n')
            .map(line => line.trim())
            .filter(line => line && !line.startsWith('#'));
    }
    catch {
        return [];
    }
}
export const tools = [
    { name: 'list_directory', description: 'List directory with pagination, filtering, and hidden file control', inputSchema: zodToJsonSchema(ListDirectoryArgsSchema) },
    { name: 'list_directory_with_sizes', description: 'List directory with sizes, permissions, and sorting', inputSchema: zodToJsonSchema(ListDirectoryWithSizesArgsSchema) },
    { name: 'directory_tree', description: 'Directory tree with depth control, gitignore support, and size info', inputSchema: zodToJsonSchema(DirectoryTreeArgsSchema) },
    { name: 'recursive_list', description: 'Recursively list files with pattern matching and depth control', inputSchema: zodToJsonSchema(RecursiveListArgsSchema) },
];
export const handlers = {
    async list_directory(args) {
        const parsed = ListDirectoryArgsSchema.safeParse(args);
        if (!parsed.success)
            throw new Error(`Invalid arguments for list_directory: ${parsed.error}`);
        const validPath = await validatePath(parsed.data.path);
        let entries = await fs.readdir(validPath, { withFileTypes: true });
        if (!parsed.data.includeHidden) {
            entries = entries.filter((e) => !e.name.startsWith('.'));
        }
        if (parsed.data.pattern) {
            const pattern = parsed.data.pattern;
            entries = entries.filter((e) => minimatch(e.name, pattern));
        }
        const startIdx = (parsed.data.page - 1) * parsed.data.pageSize;
        const endIdx = startIdx + parsed.data.pageSize;
        const paginatedEntries = entries.slice(startIdx, endIdx);
        const formatted = paginatedEntries.map((entry) => `${entry.isDirectory() ? '[DIR] ' : '[FILE]'} ${entry.name}`).join('\n');
        const totalPages = Math.ceil(entries.length / parsed.data.pageSize);
        const summary = `\n\nPage ${parsed.data.page}/${totalPages} | Total entries: ${entries.length}`;
        return { content: [{ type: 'text', text: formatted + summary }] };
    },
    async list_directory_with_sizes(args) {
        const parsed = ListDirectoryWithSizesArgsSchema.safeParse(args);
        if (!parsed.success)
            throw new Error(`Invalid arguments for list_directory_with_sizes: ${parsed.error}`);
        const validPath = await validatePath(parsed.data.path);
        let entries = await fs.readdir(validPath, { withFileTypes: true });
        if (!parsed.data.includeHidden) {
            entries = entries.filter((e) => !e.name.startsWith('.'));
        }
        if (parsed.data.pattern) {
            const pattern = parsed.data.pattern;
            entries = entries.filter((e) => minimatch(e.name, pattern));
        }
        const detailedEntries = await Promise.all(entries.map(async (entry) => {
            const entryPath = path.join(validPath, entry.name);
            try {
                const stats = await fs.stat(entryPath);
                return {
                    name: entry.name,
                    isDirectory: entry.isDirectory(),
                    size: stats.size,
                    mtime: stats.mtime,
                    atime: stats.atime,
                    mode: stats.mode
                };
            }
            catch {
                return {
                    name: entry.name,
                    isDirectory: entry.isDirectory(),
                    size: 0,
                    mtime: new Date(0),
                    atime: new Date(0),
                    mode: 0
                };
            }
        }));
        const sortedEntries = [...detailedEntries].sort((a, b) => {
            if (parsed.data.sortBy === 'size')
                return b.size - a.size;
            if (parsed.data.sortBy === 'mtime')
                return b.mtime.getTime() - a.mtime.getTime();
            if (parsed.data.sortBy === 'atime')
                return b.atime.getTime() - a.atime.getTime();
            return a.name.localeCompare(b.name);
        });
        const formattedEntries = sortedEntries.map(e => {
            let line = `${e.isDirectory ? '[DIR] ' : '[FILE]'}`;
            if (parsed.data.includePermissions) {
                line += `${formatPermissions(e.mode)} `;
            }
            line += `${e.name.padEnd(30)} ${e.isDirectory ? '' : formatSize(e.size).padStart(10)}`;
            return line;
        });
        const totalFiles = detailedEntries.filter(e => !e.isDirectory).length;
        const totalDirs = detailedEntries.filter(e => e.isDirectory).length;
        const totalSize = detailedEntries.reduce((s, e) => s + (e.isDirectory ? 0 : e.size), 0);
        const summary = ['', `Total: ${totalFiles} files, ${totalDirs} directories`, `Combined size: ${formatSize(totalSize)}`];
        return { content: [{ type: 'text', text: [...formattedEntries, ...summary].join('\n') }] };
    },
    async directory_tree(args) {
        const parsed = DirectoryTreeArgsSchema.safeParse(args);
        if (!parsed.success)
            throw new Error(`Invalid arguments for directory_tree: ${parsed.error}`);
        const { path: rootPath, excludePatterns, maxDepth, includeSize, respectGitignore } = parsed.data;
        let gitignorePatterns = [];
        if (respectGitignore) {
            gitignorePatterns = await readGitignore(rootPath);
        }
        async function buildTree(currentPath, depth = 0) {
            const validPath = await validatePath(currentPath);
            if (maxDepth && depth >= maxDepth) {
                return [];
            }
            const entries = await fs.readdir(validPath, { withFileTypes: true });
            const result = [];
            for (const entry of entries) {
                const relativePath = path.relative(rootPath, path.join(currentPath, entry.name));
                const shouldExclude = [...excludePatterns, ...gitignorePatterns].some(pattern => {
                    if (pattern.includes('*'))
                        return minimatch(relativePath, pattern, { dot: true });
                    return minimatch(relativePath, pattern, { dot: true }) ||
                        minimatch(relativePath, `**/${pattern}`, { dot: true }) ||
                        minimatch(relativePath, `**/${pattern}/**`, { dot: true });
                });
                if (shouldExclude)
                    continue;
                const entryData = {
                    name: entry.name,
                    type: entry.isDirectory() ? 'directory' : 'file'
                };
                if (includeSize && !entry.isDirectory()) {
                    try {
                        const stats = await fs.stat(path.join(currentPath, entry.name));
                        entryData.size = stats.size;
                    }
                    catch { }
                }
                if (entry.isDirectory()) {
                    entryData.children = await buildTree(path.join(currentPath, entry.name), depth + 1);
                }
                result.push(entryData);
            }
            return result;
        }
        const treeData = await buildTree(rootPath);
        return { content: [{ type: 'text', text: JSON.stringify(treeData, null, 2) }] };
    },
    async recursive_list(args) {
        const parsed = RecursiveListArgsSchema.safeParse(args);
        if (!parsed.success)
            throw new Error(`Invalid arguments for recursive_list: ${parsed.error}`);
        const { path: rootPath, pattern, excludePatterns, maxDepth, includeStats } = parsed.data;
        const validPath = await validatePath(rootPath);
        const results = [];
        async function traverse(currentPath, depth = 0) {
            if (maxDepth && depth >= maxDepth)
                return;
            const entries = await fs.readdir(currentPath, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = path.join(currentPath, entry.name);
                const relativePath = path.relative(validPath, fullPath);
                const shouldExclude = excludePatterns.some(patternStr => minimatch(relativePath, patternStr, { dot: true }));
                if (shouldExclude)
                    continue;
                if (pattern && !minimatch(entry.name, pattern)) {
                    if (entry.isDirectory()) {
                        await traverse(fullPath, depth + 1);
                    }
                    continue;
                }
                if (includeStats) {
                    try {
                        const stats = await fs.stat(fullPath);
                        results.push({
                            path: relativePath,
                            type: entry.isDirectory() ? 'directory' : 'file',
                            size: stats.size,
                            modified: stats.mtime
                        });
                    }
                    catch { }
                }
                else {
                    results.push(relativePath);
                }
                if (entry.isDirectory()) {
                    await traverse(fullPath, depth + 1);
                }
            }
        }
        await traverse(validPath);
        if (includeStats) {
            return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
        }
        return { content: [{ type: 'text', text: results.join('\n') }] };
    }
};
