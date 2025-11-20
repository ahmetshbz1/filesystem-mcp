import fs from 'fs/promises';
import path from 'path';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { validatePath, formatSize } from '../lib.js';
import { minimatch } from 'minimatch';
const ListArgsSchema = z.object({
    path: z.string(),
    mode: z.enum(['simple', 'detailed', 'tree', 'recursive']).default('simple'),
    page: z.number().min(1).optional().default(1),
    pageSize: z.number().min(1).max(1000).optional().default(100),
    includeHidden: z.boolean().optional().default(false),
    pattern: z.string().optional(),
    sortBy: z.enum(['name', 'size', 'mtime', 'atime']).optional().default('name'),
    includePermissions: z.boolean().optional().default(false),
    excludePatterns: z.array(z.string()).optional().default([]),
    maxDepth: z.number().optional(),
    includeSize: z.boolean().optional().default(false),
    respectGitignore: z.boolean().optional().default(false),
    includeStats: z.boolean().optional().default(false)
});
function formatPermissions(mode) {
    const perms = [
        (mode & 0o400) ? 'r' : '-', (mode & 0o200) ? 'w' : '-', (mode & 0o100) ? 'x' : '-',
        (mode & 0o040) ? 'r' : '-', (mode & 0o020) ? 'w' : '-', (mode & 0o010) ? 'x' : '-',
        (mode & 0o004) ? 'r' : '-', (mode & 0o002) ? 'w' : '-', (mode & 0o001) ? 'x' : '-',
    ];
    return perms.join('');
}
export const tools = [{
        name: 'list',
        description: 'Unified directory listing. Use mode: simple|detailed|tree|recursive',
        inputSchema: zodToJsonSchema(ListArgsSchema)
    }];
export const handlers = {
    async list(args) {
        const parsed = ListArgsSchema.safeParse(args);
        if (!parsed.success)
            throw new Error(`Invalid arguments: ${parsed.error}`);
        const validPath = await validatePath(parsed.data.path);
        switch (parsed.data.mode) {
            case 'simple': return handleSimpleList(validPath, parsed.data);
            case 'detailed': return handleDetailedList(validPath, parsed.data);
            case 'tree': return handleTreeList(validPath, parsed.data);
            case 'recursive': return handleRecursiveList(validPath, parsed.data);
            default: throw new Error('Invalid mode');
        }
    }
};
async function handleSimpleList(validPath, data) {
    let entries = await fs.readdir(validPath, { withFileTypes: true });
    if (!data.includeHidden)
        entries = entries.filter((e) => !e.name.startsWith('.'));
    if (data.pattern)
        entries = entries.filter((e) => minimatch(e.name, data.pattern));
    const startIdx = (data.page - 1) * data.pageSize;
    const paginatedEntries = entries.slice(startIdx, startIdx + data.pageSize);
    const formatted = paginatedEntries.map((e) => `${e.isDirectory() ? '[DIR] ' : '[FILE]'} ${e.name}`).join('\n');
    return { content: [{ type: 'text', text: `${formatted}\n\nPage ${data.page}/${Math.ceil(entries.length / data.pageSize)} | Total entries: ${entries.length}` }] };
}
async function handleDetailedList(validPath, data) {
    let entries = await fs.readdir(validPath, { withFileTypes: true });
    if (!data.includeHidden)
        entries = entries.filter((e) => !e.name.startsWith('.'));
    if (data.pattern)
        entries = entries.filter((e) => minimatch(e.name, data.pattern));
    const entriesWithStats = await Promise.all(entries.map(async (e) => {
        const stats = await fs.stat(path.join(validPath, e.name));
        return { entry: e, stats };
    }));
    entriesWithStats.sort((a, b) => {
        const key = data.sortBy || 'name';
        if (key === 'name')
            return a.entry.name.localeCompare(b.entry.name);
        if (key === 'size')
            return b.stats.size - a.stats.size;
        if (key === 'mtime')
            return b.stats.mtime.getTime() - a.stats.mtime.getTime();
        return 0;
    });
    const formatted = entriesWithStats.map(({ entry, stats }) => {
        let line = data.includePermissions ? `${formatPermissions(stats.mode)} ` : '';
        line += `${entry.isDirectory() ? '[DIR] ' : '[FILE]'} `;
        line += `${formatSize(stats.size).padStart(10)} ${entry.name}`;
        return line;
    }).join('\n');
    return { content: [{ type: 'text', text: formatted }] };
}
async function handleTreeList(validPath, data, depth = 0) {
    const indent = '  '.repeat(depth);
    let result = '';
    if (data.maxDepth !== undefined && depth >= data.maxDepth) {
        return { content: [{ type: 'text', text: result }] };
    }
    const entries = await fs.readdir(validPath, { withFileTypes: true });
    for (const entry of entries) {
        if (!data.includeHidden && entry.name.startsWith('.'))
            continue;
        const fullPath = path.join(validPath, entry.name);
        const stats = data.includeSize ? await fs.stat(fullPath) : null;
        const sizeStr = stats ? ` (${formatSize(stats.size)})` : '';
        result += `${indent}${entry.isDirectory() ? '[DIR]' : '[FILE]'} ${entry.name}${sizeStr}\n`;
        if (entry.isDirectory() && (!data.maxDepth || depth < data.maxDepth - 1)) {
            const subResult = await handleTreeList(fullPath, data, depth + 1);
            result += subResult.content[0].text;
        }
    }
    return { content: [{ type: 'text', text: result }] };
}
async function handleRecursiveList(validPath, data, results = [], depth = 0) {
    if (data.maxDepth && depth >= data.maxDepth) {
        return { content: [{ type: 'text', text: results.join('\n') }] };
    }
    const entries = await fs.readdir(validPath, { withFileTypes: true });
    for (const entry of entries) {
        if (!data.includeHidden && entry.name.startsWith('.'))
            continue;
        const fullPath = path.join(validPath, entry.name);
        const relativePath = path.relative(data.path, fullPath);
        if (data.pattern && !minimatch(entry.name, data.pattern) && entry.isFile())
            continue;
        if (entry.isFile())
            results.push(relativePath);
        else if (entry.isDirectory()) {
            await handleRecursiveList(fullPath, data, results, depth + 1);
        }
    }
    if (depth === 0)
        return { content: [{ type: 'text', text: results.join('\n') }] };
    return { content: [{ type: 'text', text: '' }] };
}
