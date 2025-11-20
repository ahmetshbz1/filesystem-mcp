import fs from 'fs/promises';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { logger } from '../logger.js';
import { validatePath } from '../lib.js';
const FileMergeArgsSchema = z.object({
    paths: z.array(z.string()).min(2, 'At least two files must be provided'),
    outputPath: z.string(),
    separator: z.string().optional().default('\n'),
    removeDuplicateLines: z.boolean().optional().default(false),
    sort: z.boolean().optional().default(false).describe('Sort lines alphabetically')
});
const JsonMergeArgsSchema = z.object({
    paths: z.array(z.string()).min(2),
    outputPath: z.string(),
    strategy: z.enum(['shallow', 'deep']).optional().default('deep').describe('Merge strategy for nested objects')
});
function deepMerge(target, source) {
    const output = { ...target };
    for (const key in source) {
        if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
            if (target[key] && typeof target[key] === 'object' && !Array.isArray(target[key])) {
                output[key] = deepMerge(target[key], source[key]);
            }
            else {
                output[key] = source[key];
            }
        }
        else {
            output[key] = source[key];
        }
    }
    return output;
}
export const tools = [
    {
        name: 'file_merge',
        description: 'Merge multiple text files with deduplication and sorting options',
        inputSchema: zodToJsonSchema(FileMergeArgsSchema)
    },
    {
        name: 'json_merge',
        description: 'Intelligently merge multiple JSON files',
        inputSchema: zodToJsonSchema(JsonMergeArgsSchema)
    }
];
export const handlers = {
    file_merge: async (args) => {
        const { paths, outputPath, separator = '\n', removeDuplicateLines, sort } = args;
        for (const filePath of paths) {
            await validatePath(filePath);
        }
        await validatePath(outputPath);
        const contents = await Promise.all(paths.map(async (filePath) => {
            try {
                return await fs.readFile(filePath, 'utf8');
            }
            catch (error) {
                logger.warn(`Failed to read ${filePath}: ${error}`);
                return '';
            }
        }));
        let merged = contents.join(separator);
        if (removeDuplicateLines) {
            const lines = merged.split('\n');
            const uniqueLines = Array.from(new Set(lines));
            merged = uniqueLines.join('\n');
        }
        if (sort) {
            const lines = merged.split('\n');
            lines.sort();
            merged = lines.join('\n');
        }
        await fs.writeFile(outputPath, merged);
        const stats = await fs.stat(outputPath);
        logger.info(`Merged ${paths.length} files into ${outputPath}`);
        return {
            content: [{
                    type: 'text',
                    text: [
                        `Merged ${paths.length} files into ${outputPath}`,
                        `Output size: ${stats.size} bytes`,
                        removeDuplicateLines ? 'Duplicates removed: Yes' : '',
                        sort ? 'Sorted: Yes' : ''
                    ].filter(Boolean).join('\n')
                }]
        };
    },
    json_merge: async (args) => {
        const { paths, outputPath, strategy = 'deep' } = args;
        for (const filePath of paths) {
            await validatePath(filePath);
        }
        await validatePath(outputPath);
        const jsonObjects = await Promise.all(paths.map(async (filePath) => {
            try {
                const content = await fs.readFile(filePath, 'utf8');
                return JSON.parse(content);
            }
            catch (error) {
                logger.warn(`Failed to parse JSON from ${filePath}: ${error}`);
                return null;
            }
        }));
        const validObjects = jsonObjects.filter(obj => obj !== null);
        if (validObjects.length === 0) {
            throw new Error('No valid JSON files to merge');
        }
        let merged = Array.isArray(validObjects[0]) ? [] : {};
        if (Array.isArray(merged)) {
            merged = validObjects.flat();
        }
        else {
            for (const obj of validObjects) {
                if (strategy === 'deep') {
                    merged = deepMerge(merged, obj);
                }
                else {
                    merged = { ...merged, ...obj };
                }
            }
        }
        const output = JSON.stringify(merged, null, 2);
        await fs.writeFile(outputPath, output);
        logger.info(`Merged ${paths.length} JSON files into ${outputPath} using ${strategy} merge`);
        return {
            content: [{
                    type: 'text',
                    text: [
                        `Merged ${paths.length} JSON files into ${outputPath}`,
                        `Strategy: ${strategy}`,
                        `Type: ${Array.isArray(merged) ? 'Array' : 'Object'}`,
                        Array.isArray(merged) ? `Items: ${merged.length}` : `Keys: ${Object.keys(merged).length}`
                    ].join('\n')
                }]
        };
    }
};
