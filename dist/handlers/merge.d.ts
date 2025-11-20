import { z } from 'zod';
declare const FileMergeArgsSchema: z.ZodObject<{
    paths: z.ZodArray<z.ZodString, "many">;
    outputPath: z.ZodString;
    separator: z.ZodDefault<z.ZodOptional<z.ZodString>>;
    removeDuplicateLines: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
    sort: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
}, "strip", z.ZodTypeAny, {
    sort: boolean;
    paths: string[];
    outputPath: string;
    separator: string;
    removeDuplicateLines: boolean;
}, {
    paths: string[];
    outputPath: string;
    sort?: boolean | undefined;
    separator?: string | undefined;
    removeDuplicateLines?: boolean | undefined;
}>;
declare const JsonMergeArgsSchema: z.ZodObject<{
    paths: z.ZodArray<z.ZodString, "many">;
    outputPath: z.ZodString;
    strategy: z.ZodDefault<z.ZodOptional<z.ZodEnum<["shallow", "deep"]>>>;
}, "strip", z.ZodTypeAny, {
    paths: string[];
    outputPath: string;
    strategy: "shallow" | "deep";
}, {
    paths: string[];
    outputPath: string;
    strategy?: "shallow" | "deep" | undefined;
}>;
type ToolInput = any;
export declare const tools: {
    name: string;
    description: string;
    inputSchema: ToolInput;
}[];
export declare const handlers: {
    file_merge: (args: z.infer<typeof FileMergeArgsSchema>) => Promise<{
        content: {
            type: string;
            text: string;
        }[];
    }>;
    json_merge: (args: z.infer<typeof JsonMergeArgsSchema>) => Promise<{
        content: {
            type: string;
            text: string;
        }[];
    }>;
};
export {};
