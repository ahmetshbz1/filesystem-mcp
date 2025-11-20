import { z } from 'zod';
declare const FileCompareArgsSchema: z.ZodObject<{
    path1: z.ZodString;
    path2: z.ZodString;
    ignoreWhitespace: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
    contextLines: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
}, "strip", z.ZodTypeAny, {
    contextLines: number;
    path1: string;
    path2: string;
    ignoreWhitespace: boolean;
}, {
    path1: string;
    path2: string;
    contextLines?: number | undefined;
    ignoreWhitespace?: boolean | undefined;
}>;
declare const BinaryCompareArgsSchema: z.ZodObject<{
    path1: z.ZodString;
    path2: z.ZodString;
}, "strip", z.ZodTypeAny, {
    path1: string;
    path2: string;
}, {
    path1: string;
    path2: string;
}>;
declare const DirectoryCompareArgsSchema: z.ZodObject<{
    path1: z.ZodString;
    path2: z.ZodString;
    recursive: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
    compareContent: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
}, "strip", z.ZodTypeAny, {
    recursive: boolean;
    path1: string;
    path2: string;
    compareContent: boolean;
}, {
    path1: string;
    path2: string;
    recursive?: boolean | undefined;
    compareContent?: boolean | undefined;
}>;
type ToolInput = any;
export declare const tools: {
    name: string;
    description: string;
    inputSchema: ToolInput;
}[];
export declare const handlers: {
    file_compare: (args: z.infer<typeof FileCompareArgsSchema>) => Promise<{
        content: {
            type: string;
            text: string;
        }[];
    }>;
    binary_compare: (args: z.infer<typeof BinaryCompareArgsSchema>) => Promise<{
        content: {
            type: string;
            text: string;
        }[];
    }>;
    directory_compare: (args: z.infer<typeof DirectoryCompareArgsSchema>) => Promise<{
        content: {
            type: string;
            text: string;
        }[];
    }>;
};
export {};
