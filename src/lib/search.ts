import fs from 'fs/promises';
import path from 'path';
import { minimatch } from 'minimatch';
import { validatePath } from './validation.js';

export interface SearchOptions {
  excludePatterns?: string[];
  caseSensitive?: boolean;
  maxDepth?: number;
  fileTypes?: string[];
}

export async function searchFilesWithValidation(
  rootPath: string,
  pattern: string,
  allowedDirectories: string[],
  options: SearchOptions = {}
): Promise<string[]> {
  const { excludePatterns = [], caseSensitive = false, maxDepth, fileTypes } = options;
  const results: string[] = [];

  async function search(currentPath: string, depth = 0) {
    if (maxDepth !== undefined && depth > maxDepth) return;

    const entries = await fs.readdir(currentPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentPath, entry.name);

      try {
        await validatePath(fullPath);

        const relativePath = path.relative(rootPath, fullPath);
        const shouldExclude = excludePatterns.some(excludePattern =>
          minimatch(relativePath, excludePattern, { dot: true })
        );

        if (shouldExclude) continue;

        const matchOptions = { dot: true, nocase: !caseSensitive };
        if (minimatch(relativePath, pattern, matchOptions)) {
          if (!fileTypes || fileTypes.some(type => entry.name.endsWith(type))) {
            results.push(fullPath);
          }
        }

        if (entry.isDirectory()) {
          await search(fullPath, depth + 1);
        }
      } catch {
        continue;
      }
    }
  }

  await search(rootPath);
  return results;
}
