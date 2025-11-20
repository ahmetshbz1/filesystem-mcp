import fs from 'fs/promises';
import path from 'path';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { validatePath, formatSize } from '../lib.js';

const InfoArgsSchema = z.object({
  path: z.string(),
  type: z.enum(['metadata', 'mime', 'disk-usage', 'symlink']).default('metadata'),
  includeExtended: z.boolean().optional().default(false),
  maxDepth: z.number().optional(),
  sortBy: z.enum(['size', 'name']).optional().default('size'),
  limit: z.number().optional().default(20),
  recursive: z.boolean().optional().default(true)
});

type ToolInput = any;

const MIME_TYPES: Record<string, string> = {
  '.txt': 'text/plain', '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript',
  '.json': 'application/json', '.xml': 'application/xml', '.pdf': 'application/pdf',
  '.zip': 'application/zip', '.png': 'image/png', '.jpg': 'image/jpeg', '.gif': 'image/gif',
  '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.mp4': 'video/mp4',
  '.md': 'text/markdown', '.ts': 'text/typescript', '.py': 'text/x-python'
};

export const tools = [{
  name: 'info',
  description: 'Unified info tool. Use type: metadata|mime|disk-usage|symlink',
  inputSchema: zodToJsonSchema(InfoArgsSchema) as ToolInput
}];

export const handlers: Record<string, (args: any) => Promise<any>> = {
  async info(args) {
    const parsed = InfoArgsSchema.safeParse(args);
    if (!parsed.success) throw new Error(`Invalid arguments: ${parsed.error}`);
    const validPath = await validatePath(parsed.data.path);

    switch(parsed.data.type) {
      case 'metadata': return handleMetadata(validPath, parsed.data);
      case 'mime': return handleMime(validPath);
      case 'disk-usage': return handleDiskUsage(validPath, parsed.data);
      case 'symlink': return handleSymlink(validPath, parsed.data);
      default: throw new Error('Invalid info type');
    }
  }
};

async function handleMetadata(validPath: string, data: any): Promise<any> {
  const stats = await fs.stat(validPath);
  const info: any = {
    path: data.path,
    type: stats.isDirectory() ? 'directory' : stats.isFile() ? 'file' : 'other',
    size: formatSize(stats.size),
    sizeBytes: stats.size,
    created: stats.birthtime.toISOString(),
    modified: stats.mtime.toISOString(),
    accessed: stats.atime.toISOString(),
    permissions: stats.mode.toString(8).slice(-3)
  };

  if (data.includeExtended) {
    info.inode = stats.ino;
    info.links = stats.nlink;
    info.uid = stats.uid;
    info.gid = stats.gid;
  }

  return { content: [{ type: 'text', text: JSON.stringify(info, null, 2) }] };
}

async function handleMime(validPath: string): Promise<any> {
  const ext = path.extname(validPath).toLowerCase();
  const mimeType = MIME_TYPES[ext] || 'application/octet-stream';
  return { content: [{ type: 'text', text: `MIME type: ${mimeType}` }] };
}

async function handleDiskUsage(validPath: string, data: any): Promise<any> {
  const usage = await calculateDiskUsage(validPath, data.maxDepth);
  const sorted = usage.sort((a, b) => b.size - a.size).slice(0, data.limit);
  const formatted = sorted.map(item =>
    `${formatSize(item.size).padStart(12)} ${item.path}`
  ).join('\n');

  return { content: [{ type: 'text', text: `Disk Usage:\n${formatted}` }] };
}

async function calculateDiskUsage(dirPath: string, maxDepth?: number, depth = 0): Promise<Array<{ path: string; size: number }>> {
  const results: Array<{ path: string; size: number }> = [];
  if (maxDepth !== undefined && depth >= maxDepth) return results;

  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  let dirSize = 0;

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    try {
      if (entry.isFile()) {
        const stats = await fs.stat(fullPath);
        dirSize += stats.size;
        results.push({ path: fullPath, size: stats.size });
      } else if (entry.isDirectory()) {
        const subResults = await calculateDiskUsage(fullPath, maxDepth, depth + 1);
        const subSize = subResults.reduce((sum, r) => sum + r.size, 0);
        dirSize += subSize;
        results.push(...subResults, { path: fullPath, size: subSize });
      }
    } catch {}
  }

  return results;
}

async function handleSymlink(validPath: string, data: any): Promise<any> {
  try {
    const lstat = await fs.lstat(validPath);
    if (!lstat.isSymbolicLink()) {
      return { content: [{ type: 'text', text: 'Not a symlink' }] };
    }

    let target = await fs.readlink(validPath);
    if (data.recursive) {
      try {
        target = await fs.realpath(validPath);
      } catch {}
    }

    return { content: [{ type: 'text', text: `Symlink target: ${target}` }] };
  } catch (error) {
    return { content: [{ type: 'text', text: `Error: ${(error as Error).message}` }] };
  }
}
