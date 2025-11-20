export declare function setAllowedDirectories(directories: string[]): void;
export declare function getAllowedDirectories(): string[];
export declare function validatePath(requestedPath: string): Promise<string>;
export type FileInfo = {
    size: number;
    created: Date;
    modified: Date;
    accessed: Date;
    isDirectory: boolean;
    isFile: boolean;
    permissions: string;
};
