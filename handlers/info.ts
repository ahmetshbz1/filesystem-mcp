import fs from 'fs/promises';
import path from 'path';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { getFileStats, formatSize } from '../lib.js';
import { validatePath } from '../lib.js';

const GetFileInfoArgsSchema = z.object({
  path: z.string(),
  includeExtended: z.boolean().optional().default(false).describe('Include extended attributes and detailed info')
});

const GetMimeTypeArgsSchema = z.object({
  path: z.string()
});

const DiskUsageArgsSchema = z.object({
  path: z.string(),
  maxDepth: z.number().optional(),
  sortBy: z.enum(['size', 'name']).optional().default('size'),
  limit: z.number().optional().default(20).describe('Number of top items to show')
});

const ResolveSymlinkArgsSchema = z.object({
  path: z.string(),
  recursive: z.boolean().optional().default(true).describe('Recursively resolve symlink chains')
});

type ToolInput = any;

const MIME_TYPES: Record<string, string> = {
  '.txt': 'text/plain',
  '.html': 'text/html',
  '.htm': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.json': 'application/json',
  '.xml': 'application/xml',
  '.pdf': 'application/pdf',
  '.zip': 'application/zip',
  '.tar': 'application/x-tar',
  '.gz': 'application/gzip',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.md': 'text/markdown',
  '.ts': 'text/typescript',
  '.tsx': 'text/typescript',
  '.py': 'text/x-python',
  '.rb': 'text/x-ruby',
  '.go': 'text/x-go',
  '.rs': 'text/x-rust',
  '.java': 'text/x-java',
  '.c': 'text/x-c',
  '.cpp': 'text/x-c++',
  '.h': 'text/x-c',
  '.hpp': 'text/x-c++'
};

async function getMimeType(filePath: string): Promise<string> {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_TYPES[ext] || 'application/octet-stream';
}

async function calculateDirectorySize(dirPath: string, maxDepth?: number, currentDepth: number = 0): Promise<{
  size: number;
  files: number;
  directories: number;
}> {
  let totalSize = 0;
  let fileCount = 0;
  let dirCount = 0;

  if (maxDepth !== undefined && currentDepth >= maxDepth) {
    return { size: totalSize, files: fileCount, directories: dirCount };
  }

  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);

      try {
        if (entry.isDirectory()) {
          dirCount++;
          const subResult = await calculateDirectorySize(fullPath, maxDepth, currentDepth + 1);
          totalSize += subResult.size;
          fileCount += subResult.files;
          dirCount += subResult.directories;
        } else if (entry.isFile()) {
          fileCount++;
          const stats = await fs.stat(fullPath);
          totalSize += stats.size;
        }
      } catch {}
    }
  } catch {}

  return { size: totalSize, files: fileCount, directories: dirCount };
}

async function analyzeDiskUsage(dirPath: string, maxDepth?: number, sortBy: 'size' | 'name' = 'size', limit: number = 20): Promise<{
  items: { path: string; size: number; type: string }[];
  total: { size: number; files: number; directories: number };
}> {
  const items: { path: string; size: number; type: string }[] = [];
  const entries = await fs.readdir(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);

    try {
      if (entry.isDirectory()) {
        const result = await calculateDirectorySize(fullPath, maxDepth);
        items.push({
          path: entry.name,
          size: result.size,
          type: 'directory'
        });
      } else if (entry.isFile()) {
        const stats = await fs.stat(fullPath);
        items.push({
          path: entry.name,
          size: stats.size,
          type: 'file'
        });
      }
    } catch {}
  }

  if (sortBy === 'size') {
    items.sort((a, b) => b.size - a.size);
  } else {
    items.sort((a, b) => a.path.localeCompare(b.path));
  }

  const topItems = items.slice(0, limit);
  const totalResult = await calculateDirectorySize(dirPath, maxDepth);

  return { items: topItems, total: totalResult };
}

export const tools = [
  {
    name: 'get_file_info',
    description: 'Get comprehensive file metadata including MIME type and extended attributes',
    inputSchema: zodToJsonSchema(GetFileInfoArgsSchema) as ToolInput
  },
  {
    name: 'get_mime_type',
    description: 'Get MIME type of a file',
    inputSchema: zodToJsonSchema(GetMimeTypeArgsSchema) as ToolInput
  },
  {
    name: 'disk_usage',
    description: 'Analyze disk usage of directory with size breakdown',
    inputSchema: zodToJsonSchema(DiskUsageArgsSchema) as ToolInput
  },
  {
    name: 'resolve_symlink',
    description: 'Resolve symlink to its target path',
    inputSchema: zodToJsonSchema(ResolveSymlinkArgsSchema) as ToolInput
  },
  {
    name: 'list_allowed_directories',
    description: 'List allowed directories',
    inputSchema: { type: 'object', properties: {}, required: [] }
  }
];

export const handlers: Record<string, (args: any, allowedDirectories?: string[]) => Promise<any>> = {
  async get_file_info(args) {
    const parsed = GetFileInfoArgsSchema.safeParse(args);
    if (!parsed.success) throw new Error(`Invalid arguments for get_file_info: ${parsed.error}`);
    const { path: filePath, includeExtended } = parsed.data;
    const validPath = await validatePath(filePath);

    const stats = await fs.stat(validPath);
    const mimeType = await getMimeType(validPath);

    const info: Record<string, any> = {
      path: filePath,
      name: path.basename(validPath),
      size: formatSize(stats.size),
      sizeBytes: stats.size,
      type: stats.isDirectory() ? 'directory' : stats.isFile() ? 'file' : stats.isSymbolicLink() ? 'symlink' : 'other',
      mimeType: stats.isFile() ? mimeType : 'N/A',
      created: stats.birthtime.toISOString(),
      modified: stats.mtime.toISOString(),
      accessed: stats.atime.toISOString(),
      permissions: `0${(stats.mode & 0o777).toString(8)}`,
      isReadable: !!(stats.mode & 0o400),
      isWritable: !!(stats.mode & 0o200),
      isExecutable: !!(stats.mode & 0o100)
    };

    if (includeExtended) {
      info.inode = stats.ino;
      info.device = stats.dev;
      info.hardLinks = stats.nlink;
      info.uid = stats.uid;
      info.gid = stats.gid;
      info.blockSize = stats.blksize;
      info.blocks = stats.blocks;

      if (stats.isSymbolicLink()) {
        try {
          info.symlinkTarget = await fs.readlink(validPath);
        } catch {}
      }

      if (stats.isDirectory()) {
        try {
          const entries = await fs.readdir(validPath);
          info.entryCount = entries.length;
        } catch {}
      }
    }

    return {
      content: [{
        type: 'text',
        text: Object.entries(info).map(([k, v]) => `${k}: ${v}`).join('\n')
      }]
    };
  },

  async get_mime_type(args) {
    const parsed = GetMimeTypeArgsSchema.safeParse(args);
    if (!parsed.success) throw new Error(`Invalid arguments for get_mime_type: ${parsed.error}`);
    const validPath = await validatePath(parsed.data.path);

    const mimeType = await getMimeType(validPath);
    return { content: [{ type: 'text', text: `MIME Type: ${mimeType}` }] };
  },

  async disk_usage(args) {
    const parsed = DiskUsageArgsSchema.safeParse(args);
    if (!parsed.success) throw new Error(`Invalid arguments for disk_usage: ${parsed.error}`);
    const { path: dirPath, maxDepth, sortBy, limit } = parsed.data;
    const validPath = await validatePath(dirPath);

    const result = await analyzeDiskUsage(validPath, maxDepth, sortBy, limit);

    const lines = [`Disk Usage for: ${dirPath}`, '='.repeat(50), ''];

    result.items.forEach(item => {
      const typeIcon = item.type === 'directory' ? '[DIR]' : '[FILE]';
      lines.push(`${typeIcon} ${item.path.padEnd(40)} ${formatSize(item.size).padStart(10)}`);
    });

    lines.push('');
    lines.push('='.repeat(50));
    lines.push(`Total Size: ${formatSize(result.total.size)}`);
    lines.push(`Files: ${result.total.files}`);
    lines.push(`Directories: ${result.total.directories}`);

    return { content: [{ type: 'text', text: lines.join('\n') }] };
  },

  async resolve_symlink(args) {
    const parsed = ResolveSymlinkArgsSchema.safeParse(args);
    if (!parsed.success) throw new Error(`Invalid arguments for resolve_symlink: ${parsed.error}`);
    const { path: symlinkPath, recursive } = parsed.data;
    const validPath = await validatePath(symlinkPath);

    const stats = await fs.lstat(validPath);
    if (!stats.isSymbolicLink()) {
      return { content: [{ type: 'text', text: `${symlinkPath} is not a symlink` }] };
    }

    let currentPath = validPath;
    const chain: string[] = [symlinkPath];
    let iterations = 0;
    const maxIterations = 20;

    try {
      while (iterations < maxIterations) {
        const target = await fs.readlink(currentPath);
        const resolvedTarget = path.isAbsolute(target) ? target : path.join(path.dirname(currentPath), target);
        chain.push(resolvedTarget);

        if (!recursive) break;

        const targetStats = await fs.lstat(resolvedTarget);
        if (!targetStats.isSymbolicLink()) break;

        currentPath = resolvedTarget;
        iterations++;
      }

      const finalTarget = chain[chain.length - 1];
      const finalStats = await fs.stat(finalTarget);

      const output = [
        `Symlink Chain:`,
        ...chain.map((p, i) => `  ${i}: ${p}`),
        '',
        `Final Target: ${finalTarget}`,
        `Type: ${finalStats.isDirectory() ? 'directory' : 'file'}`,
        `Size: ${formatSize(finalStats.size)}`
      ];

      return { content: [{ type: 'text', text: output.join('\n') }] };
    } catch (error) {
      throw new Error(`Failed to resolve symlink: ${error instanceof Error ? error.message : String(error)}`);
    }
  },

  async list_allowed_directories(_args, allowedDirectories = []) {
    return { content: [{ type: 'text', text: `Allowed directories:\n${allowedDirectories.join('\n')}` }] };
  }
};
