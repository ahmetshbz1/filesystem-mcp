type ToolInput = any;
export declare const tools: {
    name: string;
    description: string;
    inputSchema: ToolInput;
}[];
export declare const handlers: Record<string, (args: any, allowedDirectories?: string[]) => Promise<any>>;
export {};
