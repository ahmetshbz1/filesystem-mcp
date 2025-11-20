import fs from 'fs/promises';
import path from 'path';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { validatePath, createUnifiedDiff } from '../lib.js';
import type { ToolInput, MCPResponse, HandlerFunction } from './types.js';

const CompareArgsSchema = z.object({
  type: z.enum(['text', 'binary', 'directory']).default('text'),
  path1: z.string(),
  path2: z.string(),
  ignoreWhitespace: z.boolean().optional().default(false),
  contextLines: z.number().optional().default(3),
  recursive: z.boolean().optional().default(true),
  compareContent: z.boolean().optional().default(false)
});

type CompareArgs = z.infer<typeof CompareArgsSchema>;

export const tools = [{
  name: 'compare',
  description: 'Unified compare tool. Use type: text|binary|directory',
  inputSchema: zodToJsonSchema(CompareArgsSchema) as ToolInput
}];

export const handlers: Record<string, HandlerFunction> = {
  async compare(args: Record<string, unknown>): Promise<MCPResponse> {
    const parsed = CompareArgsSchema.safeParse(args);
    if (!parsed.success) throw new Error("Invalid arguments: " + parsed.error);
    const validPath1 = await validatePath(parsed.data.path1);
    const validPath2 = await validatePath(parsed.data.path2);

    switch(parsed.data.type) {
      case 'text': return handleTextCompare(validPath1, validPath2, parsed.data);
      case 'binary': return handleBinaryCompare(validPath1, validPath2);
      case 'directory': return handleDirectoryCompare(validPath1, validPath2, parsed.data);
      default: throw new Error('Invalid compare type');
    }
  }
};

async function handleTextCompare(path1: string, path2: string, data: CompareArgs): Promise<MCPResponse> {
  const [content1, content2] = await Promise.all([
    fs.readFile(path1, 'utf8'),
    fs.readFile(path2, 'utf8')
  ]);

  const diff = createUnifiedDiff(content1, content2, data.path1);
  return { content: [{ type: 'text', text: diff || 'Files are identical' }] };
}

async function handleBinaryCompare(path1: string, path2: string): Promise<MCPResponse> {
  const [buffer1, buffer2] = await Promise.all([fs.readFile(path1), fs.readFile(path2)]);

  if (buffer1.length !== buffer2.length) {
    return { content: [{ type: 'text', text: "Files differ (size: " + buffer1.length + " vs " + buffer2.length + ")" }] };
  }

  const identical = buffer1.equals(buffer2);
  return { content: [{ type: 'text', text: identical ? 'Files are identical' : 'Files differ' }] };
}

async function handleDirectoryCompare(dir1: string, dir2: string, data: CompareArgs): Promise<MCPResponse> {
  const result = await compareDirectories(dir1, dir2, data.recursive, data.compareContent);

  let text = 'Directory Comparison:\n\n';
  if (result.onlyInFirst.length > 0) {
    text += "Only in " + data.path1 + ":\n" + result.onlyInFirst.map(p => "  - " + p).join('\n') + "\n\n";
  }
  if (result.onlyInSecond.length > 0) {
    text += "Only in " + data.path2 + ":\n" + result.onlyInSecond.map(p => "  - " + p).join('\n') + "\n\n";
  }
  if (result.different.length > 0) {
    text += "Different:\n" + result.different.map(p => "  - " + p).join('\n') + "\n\n";
  }
  if (result.identical.length > 0) {
    text += "Identical: " + result.identical.length + " files\n";
  }

  return { content: [{ type: 'text', text }] };
}

async function compareDirectories(
  dir1: string,
  dir2: string,
  recursive: boolean,
  compareContent: boolean
): Promise<{
  onlyInFirst: string[];
  onlyInSecond: string[];
  different: string[];
  identical: string[];
}> {
  const result = { onlyInFirst: [] as string[], onlyInSecond: [] as string[], different: [] as string[], identical: [] as string[] };

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
    const [stats1, stats2] = await Promise.all([fs.stat(fullPath1), fs.stat(fullPath2)]);

    if (stats1.isDirectory() !== stats2.isDirectory()) {
      result.different.push(entry.name);
    } else if (stats1.isDirectory() && recursive) {
      const subResult = await compareDirectories(fullPath1, fullPath2, recursive, compareContent);
      result.onlyInFirst.push(...subResult.onlyInFirst.map(p => path.join(entry.name, p)));
      result.onlyInSecond.push(...subResult.onlyInSecond.map(p => path.join(entry.name, p)));
      result.different.push(...subResult.different.map(p => path.join(entry.name, p)));
      result.identical.push(...subResult.identical.map(p => path.join(entry.name, p)));
    } else if (stats1.isFile()) {
      if (compareContent) {
        const [buf1, buf2] = await Promise.all([fs.readFile(fullPath1), fs.readFile(fullPath2)]);
        if (buf1.equals(buf2)) result.identical.push(entry.name);
        else result.different.push(entry.name);
      } else {
        if (stats1.size === stats2.size) result.identical.push(entry.name);
        else result.different.push(entry.name);
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
