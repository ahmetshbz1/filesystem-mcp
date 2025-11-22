import fs from 'fs/promises';
import path from 'path';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { validatePath } from '../lib.js';
import { minimatch } from 'minimatch';
import type { ToolInput, MCPResponse, HandlerFunction } from './types.js';

const SearchArgsSchema = z.object({
  path: z.string(),
  type: z.enum(['files', 'content', 'fuzzy']).default('files'),
  pattern: z.string().optional(),
  query: z.string().optional(),
  excludePatterns: z.array(z.string()).optional().default([]),
  caseSensitive: z.boolean().optional().default(false),
  maxDepth: z.number().optional(),
  fileTypes: z.array(z.string()).optional(),
  useRegex: z.boolean().optional().default(false),
  filePattern: z.string().optional(),
  contextLines: z.number().min(0).max(10).optional().default(0),
  maxResults: z.number().optional().default(100),
  threshold: z.number().min(0).max(1).optional().default(0.6)
});

type SearchArgs = z.infer<typeof SearchArgsSchema>;

function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(matrix[i - 1][j - 1] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j] + 1);
      }
    }
  }
  return matrix[b.length][a.length];
}

function similarityScore(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1.0;
  return 1 - levenshteinDistance(a.toLowerCase(), b.toLowerCase()) / maxLen;
}

export const tools = [{
  name: 'search',
  description: 'Unified search tool. Use type: files|content|fuzzy',
  inputSchema: zodToJsonSchema(SearchArgsSchema) as ToolInput
}];

export const handlers: Record<string, HandlerFunction> = {
  async search(args: Record<string, unknown>): Promise<MCPResponse> {
    const parsed = SearchArgsSchema.safeParse(args);
    if (!parsed.success) throw new Error("Invalid arguments: " + parsed.error);
    const validPath = await validatePath(parsed.data.path);

    switch(parsed.data.type) {
      case 'files': return handleFileSearch(validPath, parsed.data);
      case 'content': return handleContentSearch(validPath, parsed.data);
      case 'fuzzy': return handleFuzzySearch(validPath, parsed.data);
      default: throw new Error('Invalid search type');
    }
  }
};

async function handleFileSearch(validPath: string, data: SearchArgs, results: string[] = [], depth = 0): Promise<MCPResponse> {
  if (data.maxDepth && depth >= data.maxDepth) return { content: [{ type: 'text', text: results.join('\n') }] };

  const entries = await fs.readdir(validPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(validPath, entry.name);
    const relativePath = path.relative(data.path, fullPath);

    if (entry.isFile()) {
      if (data.pattern && !minimatch(entry.name, data.pattern)) continue;
      if (data.fileTypes && !data.fileTypes.some((t: string) => entry.name.endsWith('.' + t))) continue;
      results.push(relativePath);
    } else if (entry.isDirectory()) {
      await handleFileSearch(fullPath, data, results, depth + 1);
    }
  }

  if (depth === 0) return { content: [{ type: 'text', text: "Found " + results.length + " files:\n" + results.join('\n') }] };
  return { content: [{ type: 'text', text: '' }] };
}

async function handleContentSearch(validPath: string, data: SearchArgs): Promise<MCPResponse> {
  if (!data.query) throw new Error('query is required for content search');
  const results: string[] = [];
  await searchContent(validPath, data, results);
  return { content: [{ type: 'text', text: "Found " + results.length + " matches:\n\n" + results.slice(0, data.maxResults).join('\n\n') }] };
}

async function searchContent(dirPath: string, data: SearchArgs, results: string[], depth = 0): Promise<void> {
  if (data.maxDepth && depth >= data.maxDepth) return;
  if (results.length >= data.maxResults) return;

  const entries = await fs.readdir(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    if (results.length >= data.maxResults) break;

    const fullPath = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      await searchContent(fullPath, data, results, depth + 1);
    } else if (entry.isFile()) {
      if (data.filePattern && !minimatch(entry.name, data.filePattern)) continue;

      try {
        const content = await fs.readFile(fullPath, 'utf8');
        const lines = content.split('\n');
        const queryStr = data.query || '';
        const searchPattern = data.useRegex
          ? new RegExp(queryStr, data.caseSensitive ? 'g' : 'gi')
          : data.caseSensitive ? queryStr : queryStr.toLowerCase();

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          const testLine = data.caseSensitive ? line : line.toLowerCase();
          const isMatch = data.useRegex
            ? (searchPattern as RegExp).test(line)
            : testLine.includes(searchPattern as string);

          if (isMatch) {
            const start = Math.max(0, i - data.contextLines);
            const end = Math.min(lines.length, i + data.contextLines + 1);
            const contextLines = lines.slice(start, end).map((l, idx) => (start + idx + 1) + ": " + l).join('\n');
            results.push(path.relative(data.path, fullPath) + ":" + (i + 1) + "\n" + contextLines);
            if (results.length >= data.maxResults) return;
          }
        }
      } catch {}
    }
  }
}

async function handleFuzzySearch(validPath: string, data: SearchArgs): Promise<MCPResponse> {
  if (!data.query) throw new Error('query is required for fuzzy search');

  const allFiles: Array<{ path: string; score: number }> = [];
  await collectFiles(validPath, data.path || '', allFiles);

  const matches = allFiles
    .map(({ path: p }) => ({ path: p, score: similarityScore(data.query || '', path.basename(p)) }))
    .filter(m => m.score >= data.threshold)
    .sort((a, b) => b.score - a.score)
    .slice(0, data.maxResults);

  const formatted = matches.map(m => (m.score * 100).toFixed(1) + "% - " + m.path).join('\n');
  return { content: [{ type: 'text', text: "Found " + matches.length + " fuzzy matches:\n" + formatted }] };
}

async function collectFiles(dirPath: string, basePath: string, results: Array<{ path: string; score: number }>): Promise<void> {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isFile()) {
      results.push({ path: path.relative(basePath, fullPath), score: 0 });
    } else if (entry.isDirectory()) {
      await collectFiles(fullPath, basePath, results);
    }
  }
}
