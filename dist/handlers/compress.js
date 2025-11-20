import fs from 'fs/promises';
import { createGzip, createGunzip, createBrotliCompress, createBrotliDecompress } from 'zlib';
import { pipeline } from 'stream/promises';
import { createReadStream, createWriteStream } from 'fs';
import path from 'path';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { logger } from '../logger.js';
import { validatePath, formatSize } from '../lib.js';
const CompressFileArgsSchema = z.object({
    path: z.string(),
    outputPath: z.string().optional(),
    format: z.enum(['gzip', 'brotli']).optional().default('gzip').describe('Compression format'),
    level: z.number().min(1).max(9).optional().describe('Compression level (1-9)')
});
const DecompressFileArgsSchema = z.object({
    path: z.string(),
    outputPath: z.string().optional(),
    format: z.enum(['gzip', 'brotli']).optional().describe('Format (auto-detected if not specified)')
});
function detectCompressionFormat(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.gz' || ext === '.gzip')
        return 'gzip';
    if (ext === '.br')
        return 'brotli';
    return null;
}
export const tools = [
    {
        name: 'compress_file',
        description: 'Compress file using gzip or brotli with configurable compression level',
        inputSchema: zodToJsonSchema(CompressFileArgsSchema)
    },
    {
        name: 'decompress_file',
        description: 'Decompress gzip or brotli compressed file',
        inputSchema: zodToJsonSchema(DecompressFileArgsSchema)
    }
];
export const handlers = {
    compress_file: async (args) => {
        const { path: filePath, outputPath, format, level } = args;
        const validPath = await validatePath(filePath);
        const ext = format === 'brotli' ? '.br' : '.gz';
        const output = outputPath || `${validPath}${ext}`;
        await validatePath(path.dirname(output));
        const originalStats = await fs.stat(validPath);
        const source = createReadStream(validPath);
        const destination = createWriteStream(output);
        const compressor = format === 'brotli'
            ? createBrotliCompress({ params: { [zlib.constants.BROTLI_PARAM_QUALITY]: level || 6 } })
            : createGzip({ level: level || 6 });
        await pipeline(source, compressor, destination);
        const compressedStats = await fs.stat(output);
        const ratio = ((1 - compressedStats.size / originalStats.size) * 100).toFixed(1);
        logger.info(`Compressed ${filePath} to ${output} using ${format}`);
        return {
            content: [{
                    type: 'text',
                    text: [
                        `File compressed: ${output}`,
                        `Format: ${format}`,
                        `Original: ${formatSize(originalStats.size)}`,
                        `Compressed: ${formatSize(compressedStats.size)}`,
                        `Ratio: ${ratio}% smaller`
                    ].join('\n')
                }]
        };
    },
    decompress_file: async (args) => {
        const { path: filePath, outputPath, format } = args;
        const validPath = await validatePath(filePath);
        const detectedFormat = format || detectCompressionFormat(validPath);
        if (!detectedFormat) {
            throw new Error('Cannot detect compression format. Please specify format explicitly.');
        }
        let output;
        if (outputPath) {
            output = outputPath;
        }
        else {
            output = validPath.replace(/\.(gz|gzip|br)$/, '');
            if (output === validPath) {
                output = `${validPath}.decompressed`;
            }
        }
        await validatePath(path.dirname(output));
        const source = createReadStream(validPath);
        const destination = createWriteStream(output);
        const decompressor = detectedFormat === 'brotli'
            ? createBrotliDecompress()
            : createGunzip();
        await pipeline(source, decompressor, destination);
        const stats = await fs.stat(output);
        logger.info(`Decompressed ${filePath} to ${output}`);
        return {
            content: [{
                    type: 'text',
                    text: `File decompressed: ${output}\nSize: ${formatSize(stats.size)}`
                }]
        };
    }
};
const zlib = { constants: {
        BROTLI_PARAM_QUALITY: 4
    } };
