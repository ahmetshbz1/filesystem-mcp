export interface SearchOptions {
    excludePatterns?: string[];
    caseSensitive?: boolean;
    maxDepth?: number;
    fileTypes?: string[];
}
export declare function searchFilesWithValidation(rootPath: string, pattern: string, allowedDirectories: string[], options?: SearchOptions): Promise<string[]>;
