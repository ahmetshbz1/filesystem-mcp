import { z } from 'zod';
declare const FileBackupArgsSchema: z.ZodObject<{
    path: z.ZodString;
    backupPath: z.ZodOptional<z.ZodString>;
    versioned: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
}, "strip", z.ZodTypeAny, {
    path: string;
    versioned: boolean;
    backupPath?: string | undefined;
}, {
    path: string;
    backupPath?: string | undefined;
    versioned?: boolean | undefined;
}>;
declare const RestoreBackupArgsSchema: z.ZodObject<{
    backupPath: z.ZodString;
    targetPath: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    backupPath: string;
    targetPath?: string | undefined;
}, {
    backupPath: string;
    targetPath?: string | undefined;
}>;
declare const ListBackupsArgsSchema: z.ZodObject<{
    path: z.ZodString;
}, "strip", z.ZodTypeAny, {
    path: string;
}, {
    path: string;
}>;
declare const RotateBackupsArgsSchema: z.ZodObject<{
    path: z.ZodString;
    keepLast: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    path: string;
    keepLast: number;
}, {
    path: string;
    keepLast?: number | undefined;
}>;
type ToolInput = any;
export declare const tools: {
    name: string;
    description: string;
    inputSchema: ToolInput;
}[];
export declare const handlers: {
    file_backup: (args: z.infer<typeof FileBackupArgsSchema>) => Promise<{
        content: {
            type: string;
            text: string;
        }[];
    }>;
    restore_backup: (args: z.infer<typeof RestoreBackupArgsSchema>) => Promise<{
        content: {
            type: string;
            text: string;
        }[];
    }>;
    list_backups: (args: z.infer<typeof ListBackupsArgsSchema>) => Promise<{
        content: {
            type: string;
            text: string;
        }[];
    }>;
    rotate_backups: (args: z.infer<typeof RotateBackupsArgsSchema>) => Promise<{
        content: {
            type: string;
            text: string;
        }[];
    }>;
};
export {};
