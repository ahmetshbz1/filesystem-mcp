export interface FileEdit {
    oldText: string;
    newText: string;
    useRegex?: boolean;
    flags?: string;
}
export declare function applyFileEdits(filePath: string, edits: FileEdit[], dryRun?: boolean): Promise<string>;
