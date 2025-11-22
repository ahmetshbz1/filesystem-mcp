export type ToolInput = Record<string, unknown>;

export interface MCPResponse {
  content: Array<{
    type: 'text' | 'image' | 'resource';
    text?: string;
    data?: string;
    mimeType?: string;
  }>;
  isError?: boolean;
}

export type HandlerFunction = (args: Record<string, unknown>) => Promise<MCPResponse>;

export interface FileEntry {
  name: string;
  isDirectory: () => boolean;
  isFile: () => boolean;
  isSymbolicLink: () => boolean;
}

export interface FileEntryWithStats {
  entry: FileEntry;
  stats: {
    size: number;
    mtime: Date;
    atime: Date;
    mode: number;
    [key: string]: number | Date | boolean | bigint;
  };
}
