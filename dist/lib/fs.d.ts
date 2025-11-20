import { FileInfo } from './validation.js';
export declare function getFileStats(filePath: string): Promise<FileInfo>;
export declare function readFileContent(filePath: string, encoding?: string): Promise<string>;
export declare function writeFileContent(filePath: string, content: string): Promise<void>;
