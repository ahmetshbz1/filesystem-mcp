import { z } from 'zod';
declare const FileHashArgsSchema: z.ZodObject<{
    path: z.ZodString;
    algorithm: z.ZodDefault<z.ZodOptional<z.ZodEnum<["md5", "sha1", "sha256", "sha512"]>>>;
}, "strip", z.ZodTypeAny, {
    path: string;
    algorithm: "md5" | "sha1" | "sha256" | "sha512";
}, {
    path: string;
    algorithm?: "md5" | "sha1" | "sha256" | "sha512" | undefined;
}>;
declare const BatchHashArgsSchema: z.ZodObject<{
    paths: z.ZodArray<z.ZodString, "many">;
    algorithm: z.ZodDefault<z.ZodOptional<z.ZodEnum<["md5", "sha1", "sha256", "sha512"]>>>;
}, "strip", z.ZodTypeAny, {
    paths: string[];
    algorithm: "md5" | "sha1" | "sha256" | "sha512";
}, {
    paths: string[];
    algorithm?: "md5" | "sha1" | "sha256" | "sha512" | undefined;
}>;
declare const VerifyHashArgsSchema: z.ZodObject<{
    path: z.ZodString;
    expectedHash: z.ZodString;
    algorithm: z.ZodDefault<z.ZodOptional<z.ZodEnum<["md5", "sha1", "sha256", "sha512"]>>>;
}, "strip", z.ZodTypeAny, {
    path: string;
    algorithm: "md5" | "sha1" | "sha256" | "sha512";
    expectedHash: string;
}, {
    path: string;
    expectedHash: string;
    algorithm?: "md5" | "sha1" | "sha256" | "sha512" | undefined;
}>;
declare const DirectoryHashArgsSchema: z.ZodObject<{
    path: z.ZodString;
    algorithm: z.ZodDefault<z.ZodOptional<z.ZodEnum<["md5", "sha256", "sha512"]>>>;
    includeHidden: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
}, "strip", z.ZodTypeAny, {
    path: string;
    includeHidden: boolean;
    algorithm: "md5" | "sha256" | "sha512";
}, {
    path: string;
    includeHidden?: boolean | undefined;
    algorithm?: "md5" | "sha256" | "sha512" | undefined;
}>;
type ToolInput = any;
export declare const tools: {
    name: string;
    description: string;
    inputSchema: ToolInput;
}[];
export declare const handlers: {
    file_hash: (args: z.infer<typeof FileHashArgsSchema>) => Promise<{
        content: {
            type: string;
            text: string;
        }[];
    }>;
    batch_hash: (args: z.infer<typeof BatchHashArgsSchema>) => Promise<{
        content: {
            type: string;
            text: string;
        }[];
    }>;
    verify_hash: (args: z.infer<typeof VerifyHashArgsSchema>) => Promise<{
        content: {
            type: string;
            text: string;
        }[];
    }>;
    directory_hash: (args: z.infer<typeof DirectoryHashArgsSchema>) => Promise<{
        content: {
            type: string;
            text: string;
        }[];
    }>;
};
export {};
