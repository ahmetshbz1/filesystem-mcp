import { z } from 'zod';
declare const CompressFileArgsSchema: z.ZodObject<{
    path: z.ZodString;
    outputPath: z.ZodOptional<z.ZodString>;
    format: z.ZodDefault<z.ZodOptional<z.ZodEnum<["gzip", "brotli"]>>>;
    level: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    path: string;
    format: "gzip" | "brotli";
    level?: number | undefined;
    outputPath?: string | undefined;
}, {
    path: string;
    level?: number | undefined;
    outputPath?: string | undefined;
    format?: "gzip" | "brotli" | undefined;
}>;
declare const DecompressFileArgsSchema: z.ZodObject<{
    path: z.ZodString;
    outputPath: z.ZodOptional<z.ZodString>;
    format: z.ZodOptional<z.ZodEnum<["gzip", "brotli"]>>;
}, "strip", z.ZodTypeAny, {
    path: string;
    outputPath?: string | undefined;
    format?: "gzip" | "brotli" | undefined;
}, {
    path: string;
    outputPath?: string | undefined;
    format?: "gzip" | "brotli" | undefined;
}>;
type ToolInput = any;
export declare const tools: {
    name: string;
    description: string;
    inputSchema: ToolInput;
}[];
export declare const handlers: {
    compress_file: (args: z.infer<typeof CompressFileArgsSchema>) => Promise<{
        content: {
            type: string;
            text: string;
        }[];
    }>;
    decompress_file: (args: z.infer<typeof DecompressFileArgsSchema>) => Promise<{
        content: {
            type: string;
            text: string;
        }[];
    }>;
};
export {};
