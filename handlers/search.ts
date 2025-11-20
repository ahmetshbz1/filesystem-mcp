import fs from 'fs/promises';
import path from 'path';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { validatePath, searchFilesWithValidation } from '../lib.js';

const SearchFilesArgsSchema = z.object({
  path: z.string(),
  pattern: z.string(),
  excludePatterns: z.array(z.string()).optional().default([]),
  caseSensitive: z.boolean().optional().default(false),
  maxDepth: z.number().optional(),
  fileTypes: z.array(z.string()).optional()
});

const ContentSearchArgsSchema = z.object({
  path: z.string(),
  query: z.string().describe('Text to search for in file contents'),
  useRegex: z.boolean().optional().default(false).describe('Treat query as regex'),
  caseSensitive: z.boolean().optional().default(false),
  filePattern: z.string().optional().describe('Filter files by glob pattern'),
  excludePatterns: z.array(z.string()).optional().default([]),
  maxDepth: z.number().optional(),
  contextLines: z.number().min(0).max(10).optional().default(0).describe('Show N lines before/after match'),
  maxResults: z.number().optional().default(100).describe('Maximum number of results')
});

const FuzzySearchArgsSchema = z.object({
  path: z.string(),
  query: z.string().describe('Fuzzy search query'),
  threshold: z.number().min(0).max(1).optional().default(0.6).describe('Similarity threshold (0-1)'),
  maxResults: z.number().optional().default(50)
});

type ToolInput = any;

function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

function similarityScore(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1.0;
  const distance = levenshteinDistance(a.toLowerCase(), b.toLowerCase());
  return 1 - distance / maxLen;
}

async function searchInFile(
  filePath: string,
  query: string,
  useRegex: boolean,
  caseSensitive: boolean,
  contextLines: number
): Promise<{ matches: number; lines: string[] }> {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    const lines = content.split('\n');
    const matchedLines: string[] = [];
    let matches = 0;

    const searchPattern = useRegex
      ? new RegExp(query, caseSensitive ? 'g' : 'gi')
      : caseSensitive
      ? query
      : query.toLowerCase();

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const testLine = caseSensitive ? line : line.toLowerCase();

      const isMatch = useRegex
        ? (searchPattern as RegExp).test(line)
        : testLine.includes(searchPattern as string);

      if (isMatch) {
        matches++;
        const start = Math.max(0, i - contextLines);
        const end = Math.min(lines.length, i + contextLines + 1);

        for (let j = start; j < end; j++) {
          const prefix = j === i ? `${i + 1}:* ` : `${j + 1}:  `;
          matchedLines.push(`${prefix}${lines[j]}`);
        }
        if (contextLines > 0) matchedLines.push('---');
      }
    }

    return { matches, lines: matchedLines };
  } catch {
    return { matches: 0, lines: [] };
  }
}

export const tools = [
  {
    name: 'search_files',
    description: 'Search files by glob pattern with advanced filtering',
    inputSchema: zodToJsonSchema(SearchFilesArgsSchema) as ToolInput
  },
  {
    name: 'content_search',
    description: 'Search within file contents with regex and context support (grep-like)',
    inputSchema: zodToJsonSchema(ContentSearchArgsSchema) as ToolInput
  },
  {
    name: 'fuzzy_search',
    description: 'Fuzzy search for files by name similarity',
    inputSchema: zodToJsonSchema(FuzzySearchArgsSchema) as ToolInput
  },
];

export const handlers: Record<string, (args: any, allowedDirectories?: string[]) => Promise<any>> = {
  async search_files(args, allowedDirectories = []) {
    const parsed = SearchFilesArgsSchema.safeParse(args);
    if (!parsed.success) throw new Error(`Invalid arguments for search_files: ${parsed.error}`);
    const validPath = await validatePath(parsed.data.path);
    const results = await searchFilesWithValidation(validPath, parsed.data.pattern, allowedDirectories, {
      excludePatterns: parsed.data.excludePatterns,
      caseSensitive: parsed.data.caseSensitive,
      maxDepth: parsed.data.maxDepth,
      fileTypes: parsed.data.fileTypes
    });
    return { content: [{ type: 'text', text: results.length > 0 ? results.join('\n') : 'No matches found' }] };
  },

  async content_search(args) {
    const parsed = ContentSearchArgsSchema.safeParse(args);
    if (!parsed.success) throw new Error(`Invalid arguments for content_search: ${parsed.error}`);
    const { path: rootPath, query, useRegex, caseSensitive, filePattern, excludePatterns, maxDepth, contextLines, maxResults } = parsed.data;
    const validPath = await validatePath(rootPath);

    const fileResults: { file: string; matches: number; lines: string[] }[] = [];
    let totalMatches = 0;

    async function searchDir(dirPath: string, depth: number = 0): Promise<void> {
      if (maxDepth && depth >= maxDepth) return;
      if (totalMatches >= maxResults) return;

      const entries = await fs.readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        if (totalMatches >= maxResults) break;

        const fullPath = path.join(dirPath, entry.name);
        const relativePath = path.relative(validPath, fullPath);

        if (entry.isDirectory()) {
          await searchDir(fullPath, depth + 1);
          continue;
        }

        if (filePattern && !entry.name.match(filePattern)) {
          continue;
        }

        const shouldExclude = excludePatterns.some(pattern => relativePath.includes(pattern));
        if (shouldExclude) continue;

        const result = await searchInFile(fullPath, query, useRegex, caseSensitive, contextLines);

        if (result.matches > 0) {
          fileResults.push({
            file: relativePath,
            matches: result.matches,
            lines: result.lines
          });
          totalMatches += result.matches;
        }
      }
    }

    await searchDir(validPath);

    if (fileResults.length === 0) {
      return { content: [{ type: 'text', text: 'No matches found' }] };
    }

    const output = fileResults.map((r) => {
      const header = `\n=== ${r.file} (${r.matches} matches) ===`;
      return [header, ...r.lines].join('\n');
    });

    const summary = `\n\nTotal: ${totalMatches} matches in ${fileResults.length} files`;
    return { content: [{ type: 'text', text: output.join('\n') + summary }] };
  },

  async fuzzy_search(args) {
    const parsed = FuzzySearchArgsSchema.safeParse(args);
    if (!parsed.success) throw new Error(`Invalid arguments for fuzzy_search: ${parsed.error}`);
    const { path: rootPath, query, threshold, maxResults } = parsed.data;
    const validPath = await validatePath(rootPath);

    const results: { path: string; score: number }[] = [];

    async function traverse(dirPath: string): Promise<void> {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        const score = similarityScore(entry.name, query);

        if (score >= threshold) {
          const relativePath = path.relative(validPath, fullPath);
          results.push({ path: relativePath, score });
        }

        if (entry.isDirectory()) {
          await traverse(fullPath);
        }
      }
    }

    await traverse(validPath);

    results.sort((a, b) => b.score - a.score);
    const topResults = results.slice(0, maxResults);

    if (topResults.length === 0) {
      return { content: [{ type: 'text', text: 'No fuzzy matches found' }] };
    }

    const output = topResults.map((r) =>
      `${(r.score * 100).toFixed(1)}% - ${r.path}`
    ).join('\n');

    return { content: [{ type: 'text', text: output }] };
  }
};
