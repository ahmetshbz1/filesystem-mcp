# Filesystem MCP Server

[![English](https://img.shields.io/badge/lang-English-blue.svg)](README.md) [![Türkçe](https://img.shields.io/badge/lang-Türkçe-red.svg)](README.tr.md)

Enterprise-grade Node.js server implementing Model Context Protocol (MCP) for comprehensive filesystem operations with unified tool architecture.

## Features

- **Unified Tool Architecture**: 10 powerful tools instead of 48, optimized for LLM efficiency
- **100% Type Safety**: Strict TypeScript with Zod validation, zero `any` types
- **Comprehensive File Operations**: Read, write, edit, copy, move, delete with multiple modes
- **Advanced Search**: File search, content search, and fuzzy matching
- **Git Integration**: Status, log, diff, branch, show, and blame operations
- **Compression & Hashing**: Gzip/Brotli compression, multiple hash algorithms
- **Backup & Merge**: File versioning, backup rotation, text/JSON merging
- **Validation**: Syntax checking and linting for TypeScript, JavaScript, JSON
- **Dynamic Access Control**: Flexible directory permissions via CLI args or MCP Roots

## Architecture

### Unified Tools (10 Total)

All tools use a unified pattern with `type`, `mode`, or `operation` parameters to access multiple capabilities through a single interface, reducing token cost and improving LLM understanding.

## Directory Access Control

The server uses a flexible directory access control system. Directories can be specified via command-line arguments or dynamically via [Roots](https://modelcontextprotocol.io/docs/learn/client-concepts#roots).

### Method 1: Command-line Arguments
Specify allowed directories when starting the server:
```bash
mcp-server-filesystem /path/to/dir1 /path/to/dir2
```

### Method 2: MCP Roots (Recommended)
MCP clients that support [Roots](https://modelcontextprotocol.io/docs/learn/client-concepts#roots) can dynamically update allowed directories.

**Important**: If server starts without command-line arguments AND client doesn't support roots protocol, the server will throw an error during initialization.

### How It Works

1. **Server Startup**: Starts with directories from command-line arguments (if provided)
2. **Client Connection**: Client connects and sends `initialize` request
3. **Roots Protocol**:
   - Server requests roots from client via `roots/list`
   - Client responds with configured roots
   - Server replaces ALL allowed directories with client's roots
   - Runtime updates via `notifications/roots/list_changed`
4. **Access Control**: All operations restricted to allowed directories

## API Reference

### 1. read - Unified Read Operations

Read files with multiple modes in a single tool.

**Parameters:**
- `type`: `'text'` | `'binary'` | `'media'` | `'multiple'` (default: `'text'`)
- `path`: string (for single file)
- `paths`: string[] (for multiple files)
- `encoding`: `'utf8'` | `'utf16le'` | `'ascii'` | `'latin1'` | `'base64'` | `'hex'`
- `head`: number (first N lines)
- `tail`: number (last N lines)
- `lineRange`: { start: number, end: number }
- `stream`: boolean (stream large files)
- `includeMetadata`: boolean

**Examples:**
```typescript
// Text file
{ type: 'text', path: '/file.txt', head: 10 }

// Binary file
{ type: 'binary', path: '/image.png' }

// Multiple files
{ type: 'multiple', paths: ['/a.txt', '/b.txt'] }

// Media with base64
{ type: 'media', path: '/photo.jpg' }
```

### 2. write - Unified Write Operations

Write files with single, batch, or template modes.

**Parameters:**
- `mode`: `'single'` | `'batch'` | `'template'` (default: `'single'`)
- `path`: string (for single/template)
- `content`: string (for single)
- `operations`: Array<{ path, content, encoding }> (for batch)
- `template`: string (template content with {{variables}})
- `variables`: Record<string, string> (for template)
- `append`: boolean
- `atomic`: boolean (temp file + rename)
- `backup`: boolean
- `encoding`: string

**Examples:**
```typescript
// Single write
{ mode: 'single', path: '/file.txt', content: 'Hello' }

// Batch write (3 files at once)
{ mode: 'batch', operations: [
  { path: '/a.txt', content: 'A' },
  { path: '/b.txt', content: 'B' },
  { path: '/c.txt', content: 'C' }
]}

// Template write
{ mode: 'template', path: '/config.json',
  template: '{"name": "{{name}}", "version": "{{version}}"}',
  variables: { name: 'MyApp', version: '1.0' }
}
```

### 3. file - Unified File Operations

Perform various file operations through a single tool.

**Parameters:**
- `operation`: `'edit'` | `'mkdir'` | `'move'` | `'copy'` | `'delete'`
- `path`: string (target path)
- `source`: string (for move/copy)
- `destination`: string (for move/copy)
- `edits`: Array<{ oldText, newText, useRegex, flags }> (for edit)
- `recursive`: boolean
- `dryRun`: boolean (preview edits)
- `overwrite`: boolean

**Examples:**
```typescript
// Edit file
{ operation: 'edit', path: '/file.ts',
  edits: [{ oldText: 'const', newText: 'let' }],
  dryRun: true
}

// Create directory
{ operation: 'mkdir', path: '/new-dir', recursive: true }

// Copy file
{ operation: 'copy', source: '/a.txt', destination: '/b.txt' }

// Move file
{ operation: 'move', source: '/old.txt', destination: '/new.txt' }

// Delete recursively
{ operation: 'delete', path: '/dir', recursive: true }
```

### 4. list - Unified Directory Listing

List directory contents with multiple display modes.

**Parameters:**
- `mode`: `'simple'` | `'detailed'` | `'tree'` | `'recursive'` (default: `'simple'`)
- `path`: string
- `pattern`: string (glob pattern)
- `includeHidden`: boolean
- `includeSize`: boolean
- `includePermissions`: boolean
- `sortBy`: `'name'` | `'size'` | `'mtime'` | `'atime'`
- `maxDepth`: number
- `page`: number
- `pageSize`: number

**Examples:**
```typescript
// Simple list
{ mode: 'simple', path: '/dir', pattern: '*.ts' }

// Detailed with sizes
{ mode: 'detailed', path: '/dir', includeSize: true, sortBy: 'size' }

// Tree view
{ mode: 'tree', path: '/dir', maxDepth: 3 }

// Recursive with pagination
{ mode: 'recursive', path: '/dir', page: 1, pageSize: 100 }
```

### 5. search - Unified Search Operations

Search files, content, or use fuzzy matching.

**Parameters:**
- `type`: `'files'` | `'content'` | `'fuzzy'` (default: `'files'`)
- `path`: string (starting directory)
- `pattern`: string (for file search)
- `query`: string (for content/fuzzy search)
- `caseSensitive`: boolean
- `useRegex`: boolean
- `maxDepth`: number
- `maxResults`: number
- `fileTypes`: string[]
- `excludePatterns`: string[]
- `threshold`: number (0-1, for fuzzy)
- `contextLines`: number (for content search)

**Examples:**
```typescript
// File search
{ type: 'files', path: '/src', pattern: '*.ts', maxDepth: 5 }

// Content search
{ type: 'content', path: '/src', query: 'TODO', contextLines: 2 }

// Fuzzy search
{ type: 'fuzzy', path: '/src', query: 'usr', threshold: 0.7 }
```

### 6. info - Unified File Information

Get file/directory metadata, MIME types, disk usage, or symlink info.

**Parameters:**
- `type`: `'metadata'` | `'mime'` | `'disk-usage'` | `'symlink'` (default: `'metadata'`)
- `path`: string
- `includeExtended`: boolean (for metadata)
- `recursive`: boolean (for disk-usage)
- `maxDepth`: number
- `sortBy`: `'size'` | `'name'`
- `limit`: number

**Examples:**
```typescript
// Metadata
{ type: 'metadata', path: '/file.txt', includeExtended: true }

// MIME type
{ type: 'mime', path: '/image.png' }

// Disk usage
{ type: 'disk-usage', path: '/dir', recursive: true, limit: 20 }

// Symlink info
{ type: 'symlink', path: '/link' }
```

### 7. compare - Unified File Comparison

Compare files or directories with text, binary, or recursive modes.

**Parameters:**
- `type`: `'text'` | `'binary'` | `'directory'` (default: `'text'`)
- `path1`: string
- `path2`: string
- `ignoreWhitespace`: boolean
- `contextLines`: number (for text)
- `recursive`: boolean (for directory)
- `compareContent`: boolean (for directory)

**Examples:**
```typescript
// Text diff
{ type: 'text', path1: '/old.txt', path2: '/new.txt', contextLines: 3 }

// Binary comparison
{ type: 'binary', path1: '/a.bin', path2: '/b.bin' }

// Directory comparison
{ type: 'directory', path1: '/dir1', path2: '/dir2', recursive: true }
```

### 8. utility - Unified Utility Operations

Backup, compress, hash, and merge operations in one tool.

**Parameters:**
- `operation`:
  - Backup: `'backup-create'` | `'backup-restore'` | `'backup-list'` | `'backup-rotate'`
  - Compression: `'compress'` | `'decompress'`
  - Hashing: `'hash'` | `'hash-verify'` | `'hash-batch'` | `'hash-directory'`
  - Merging: `'merge-text'` | `'merge-json'`
- `path`: string
- `paths`: string[] (for batch/merge)
- `format`: `'gzip'` | `'brotli'` (for compression)
- `algorithm`: `'md5'` | `'sha1'` | `'sha256'` | `'sha512'` (for hash)
- `outputPath`: string
- `versioned`: boolean (for backup)
- `keepLast`: number (for backup rotation)
- `separator`: string (for merge-text)
- `strategy`: `'shallow'` | `'deep'` (for merge-json)

**Examples:**
```typescript
// Create versioned backup
{ operation: 'backup-create', path: '/file.txt', versioned: true }

// Compress with brotli
{ operation: 'compress', path: '/large.txt', format: 'brotli' }

// Hash file
{ operation: 'hash', path: '/file.txt', algorithm: 'sha256' }

// Batch hash
{ operation: 'hash-batch', paths: ['/a.txt', '/b.txt'], algorithm: 'md5' }

// Merge text files
{ operation: 'merge-text', paths: ['/a.txt', '/b.txt'],
  outputPath: '/merged.txt', separator: '\n---\n' }

// Merge JSON (deep)
{ operation: 'merge-json', paths: ['/a.json', '/b.json'],
  outputPath: '/merged.json', strategy: 'deep' }
```

### 9. git - Unified Git Operations

Execute git commands through MCP.

**Parameters:**
- `command`: `'status'` | `'log'` | `'diff'` | `'branch'` | `'show'` | `'blame'`
- `path`: string (repository path, default: '.')
- `short`: boolean (for status)
- `staged`: boolean (for diff)
- `file`: string (specific file)
- `unified`: number (context lines for diff)
- `limit`: number (for log)
- `oneline`: boolean (for log)
- `graph`: boolean (for log)
- `author`: string (for log)
- `since`: string (for log)
- `remote`: boolean (for branch)
- `all`: boolean (for branch)
- `commit`: string (for show, default: 'HEAD')
- `stat`: boolean (for show)
- `lineStart`: number (for blame)
- `lineEnd`: number (for blame)

**Examples:**
```typescript
// Status (short)
{ command: 'status', path: '/repo', short: true }

// Log (last 10, oneline)
{ command: 'log', limit: 10, oneline: true, graph: true }

// Diff (staged)
{ command: 'diff', staged: true }

// Blame (specific lines)
{ command: 'blame', file: 'src/index.ts', lineStart: 10, lineEnd: 20 }
```

### 10. validate - Unified Validation Operations

Syntax checking and linting for code files.

**Parameters:**
- `type`: `'syntax'` | `'lint'` (default: `'syntax'`)
- `path`: string
- `language`: `'typescript'` | `'javascript'` | `'json'` | `'auto'` (default: `'auto'`)
- `strict`: boolean
- `fix`: boolean (for lint)
- `configPath`: string (eslint config)

**Examples:**
```typescript
// Syntax check (auto-detect)
{ type: 'syntax', path: '/file.ts' }

// Lint with fixes
{ type: 'lint', path: '/code.js', fix: true, configPath: '.eslintrc.json' }

// Strict JSON validation
{ type: 'syntax', path: '/data.json', language: 'json', strict: true }
```

## Performance & Optimization

- **79% Fewer Tools**: 48 → 10 unified tools reduces token cost for LLM calls
- **Type Safety**: 100% strict typing with Zod runtime validation
- **Efficient Batching**: Batch operations for multiple files in single call
- **Streaming**: Large file support with streaming capabilities
- **Caching**: Smart caching for repeated operations

## Usage with Claude Desktop

Add to your `claude_desktop_config.json`:

### Docker

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "docker",
      "args": [
        "run",
        "-i",
        "--rm",
        "--mount", "type=bind,src=/Users/username/Desktop,dst=/projects/Desktop",
        "mcp/filesystem",
        "/projects"
      ]
    }
  }
}
```

### NPX

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-filesystem",
        "/Users/username/Desktop",
        "/path/to/other/allowed/dir"
      ]
    }
  }
}
```

## Usage with VS Code

For quick installation, click the installation buttons below:

[![Install with NPX in VS Code](https://img.shields.io/badge/VS_Code-NPM-0098FF?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=filesystem&config=%7B%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22%40modelcontextprotocol%2Fserver-filesystem%22%2C%22%24%7BworkspaceFolder%7D%22%5D%7D) [![Install with Docker in VS Code](https://img.shields.io/badge/VS_Code-Docker-0098FF?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=filesystem&config=%7B%22command%22%3A%22docker%22%2C%22args%22%3A%5B%22run%22%2C%22-i%22%2C%22--rm%22%2C%22--mount%22%2C%22type%3Dbind%2Csrc%3D%24%7BworkspaceFolder%7D%2Cdst%3D%2Fprojects%2Fworkspace%22%2C%22mcp%2Ffilesystem%22%2C%22%2Fprojects%22%5D%7D)

For manual installation, add to `.vscode/mcp.json` in your workspace:

### Docker

```json
{
  "servers": {
    "filesystem": {
      "command": "docker",
      "args": [
        "run",
        "-i",
        "--rm",
        "--mount", "type=bind,src=${workspaceFolder},dst=/projects/workspace",
        "mcp/filesystem",
        "/projects"
      ]
    }
  }
}
```

### NPX

```json
{
  "servers": {
    "filesystem": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-filesystem",
        "${workspaceFolder}"
      ]
    }
  }
}
```

## Build

```bash
# Install dependencies
bun install

# Build
bun run build

# Docker build
docker build -t mcp/filesystem -f src/filesystem/Dockerfile .
```

## Development

```bash
# Run tests
bun test

# Type check
bun run build

# Watch mode
bun run dev
```

## Technical Details

- **Language**: TypeScript with 100% type safety
- **Runtime**: Node.js
- **Validation**: Zod schemas with runtime checking
- **Protocol**: Model Context Protocol (MCP)
- **Architecture**: Unified tool pattern for efficiency

## License

MIT License - see LICENSE file for details.
