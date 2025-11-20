import type { ToolInput, HandlerFunction } from './types.js';
export declare const tools: {
    name: string;
    description: string;
    inputSchema: ToolInput;
}[];
export declare const handlers: Record<string, HandlerFunction>;
