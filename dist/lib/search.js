import fs from 'fs/promises';
import path from 'path';
import { minimatch } from 'minimatch';
import { validatePath } from './validation.js';
export async function searchFilesWithValidation(rootPath, pattern, allowedDirectories, options = {}) {
    const { excludePatterns = [], caseSensitive = false, maxDepth, fileTypes } = options;
    const results = [];
    async function search(currentPath, depth = 0) {
        if (maxDepth !== undefined && depth > maxDepth)
            return;
        const entries = await fs.readdir(currentPath, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(currentPath, entry.name);
            try {
                await validatePath(fullPath);
                const relativePath = path.relative(rootPath, fullPath);
                const shouldExclude = excludePatterns.some(excludePattern => minimatch(relativePath, excludePattern, { dot: true }));
                if (shouldExclude)
                    continue;
                const matchOptions = { dot: true, nocase: !caseSensitive };
                if (minimatch(relativePath, pattern, matchOptions)) {
                    if (!fileTypes || fileTypes.some(type => entry.name.endsWith(type))) {
                        results.push(fullPath);
                    }
                }
                if (entry.isDirectory()) {
                    await search(fullPath, depth + 1);
                }
            }
            catch {
                continue;
            }
        }
    }
    await search(rootPath);
    return results;
}
