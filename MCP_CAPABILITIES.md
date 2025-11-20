# Filesystem MCP Server - Complete Capabilities

This document describes all capabilities of the Filesystem MCP (Model Context Protocol) Server. This is a comprehensive file system management server with advanced features for reading, writing, searching, versioning, and analyzing files and directories.

## Overview

The Filesystem MCP Server provides secure, feature-rich file system operations through the Model Context Protocol. It includes extensive validation, rate limiting, audit logging, and supports multiple file operations across different categories.

## Security Features

- **Path Validation**: All file paths are validated against allowed directories
- **Rate Limiting**: 100 requests per minute per tool
- **Audit Logging**: All tool calls are logged with arguments
- **Root Directory Control**: Access restricted to explicitly allowed directories
- **MCP Roots Support**: Dynamic directory permission updates via MCP protocol

## Tool Categories

### 1. File Reading (handlers/read.ts)

#### read_file (deprecated)
- Read file as text with basic options
- **Use read_text_file instead for new code**

#### read_text_file
Read text files with advanced encoding and line range support
- **Encodings**: utf8, utf16le, ascii, latin1, base64, hex
- **Line Ranges**: Read specific line ranges (start, end)
- **Metadata**: Optional file metadata (size, mtime, permissions)
- **Streaming**: Support for large files via streaming
- **Head/Tail**: Read first N or last N lines

#### read_binary_file
Read binary files as base64
- **Size Limit**: 10MB default max size
- **Use Case**: Images, executables, compressed files

#### read_media_file
Read media files (images/audio)
- **Formats**: PNG, JPG, GIF, MP3, WAV, etc.
- **Returns**: Media content in appropriate format

#### read_multiple_files
Read multiple files in a single operation
- **Batch Processing**: Parallel file reads
- **Error Handling**: Continue on error (configurable)
- **Encoding**: Same encoding for all files

### 2. File Writing (handlers/write.ts)

#### write_file
Write file with atomic writes, backup, and encoding support
- **Atomic Write**: Temp file + rename for safety
- **Auto Backup**: Create timestamped backup before write
- **Append Mode**: Append to existing file
- **Encoding**: utf8, utf16le, ascii, latin1
- **Permissions**: Set file mode (e.g., 0o644)

#### batch_write
Write multiple files in one operation
- **Parallel Writes**: Write multiple files simultaneously
- **Atomic Option**: Atomic writes for all files
- **Error Reporting**: Detailed success/failure for each file

#### template_write
Write file from template with variable substitution
- **Template Syntax**: `{{variable}}` placeholders
- **Variables**: Key-value pairs for substitution
- **Use Case**: Config files, code generation

#### edit_file
Edit file with pattern replacement and backup
- **Regex Support**: Use regular expressions for patterns
- **Multiple Edits**: Apply multiple edits in one operation
- **Dry Run**: Preview changes without applying
- **Auto Backup**: Optional backup before editing

#### create_directory
Create directory with permission control
- **Recursive**: Create parent directories if needed
- **Permissions**: Set directory mode

#### move_file
Move or rename file with overwrite control
- **Overwrite Protection**: Prevent accidental overwrites
- **Works for**: Files and directories

#### copy_file
Copy file or directory with timestamp preservation
- **Recursive**: Copy directories recursively
- **Preserve Timestamps**: Maintain original mtime/atime
- **Overwrite Control**: Prevent accidental overwrites

#### delete_file
Delete file or directory
- **Recursive**: Delete directories with contents
- **Safety**: Requires explicit recursive flag for directories

### 3. Directory Listing (handlers/list.ts)

#### list_directory
List directory with pagination, filtering, and hidden file control
- **Pagination**: Page and pageSize parameters
- **Hidden Files**: Include/exclude files starting with .
- **Glob Filtering**: Filter by glob patterns (e.g., *.ts)
- **Use Case**: Large directories, filtered listings

#### list_directory_with_sizes
List directory with sizes, permissions, and sorting
- **File Sizes**: Display file sizes in human-readable format
- **Permissions**: Show Unix permissions (rwxr-xr-x)
- **Sorting**: Sort by name, size, mtime, atime

#### directory_tree
Directory tree with depth control, gitignore support, and size info
- **Max Depth**: Limit traversal depth
- **Gitignore Respect**: Honor .gitignore patterns
- **Size Display**: Show file sizes in tree
- **Exclude Patterns**: Custom exclude patterns

#### recursive_list
Recursively list files with pattern matching and depth control
- **Glob Patterns**: Filter files by patterns
- **Max Depth**: Control recursion depth
- **Statistics**: Optional file stats (size, mtime, etc.)
- **Exclude Patterns**: Exclude specific patterns

### 4. File Search (handlers/search.ts)

#### search_files
Search files by glob pattern with advanced filtering
- **Glob Patterns**: *.ts, **/*.js, etc.
- **File Types**: Filter by file extensions
- **Case Sensitivity**: Case-sensitive or insensitive
- **Max Depth**: Control search depth
- **Exclude Patterns**: Exclude specific patterns

#### content_search
Search within file contents with regex and context support (grep-like)
- **Regex Support**: Full regex pattern matching
- **Context Lines**: Show N lines before/after match
- **Case Sensitivity**: Case-sensitive or insensitive
- **File Filtering**: Glob pattern for file filtering
- **Max Results**: Limit number of results
- **Use Case**: Code search, log analysis

#### fuzzy_search
Fuzzy search for files by name similarity
- **Levenshtein Distance**: Edit distance algorithm
- **Similarity Threshold**: Configurable threshold (0-1)
- **Max Results**: Limit number of results
- **Use Case**: Find files with typos, similar names

### 5. File Information (handlers/info.ts)

#### get_file_info
Get comprehensive file metadata including MIME type and extended attributes
- **File Stats**: Size, mtime, atime, ctime, permissions
- **MIME Type**: Detected file type
- **Extended Info**: Detailed file information
- **Supports**: 40+ file types

#### get_mime_type
Get MIME type of a file
- **Detection**: Based on file extension
- **Fallback**: application/octet-stream for unknown types

#### disk_usage
Analyze disk usage of directory with size breakdown
- **Recursive**: Analyze all subdirectories
- **Sorting**: Sort by size or name
- **Top N**: Show top N largest items
- **Human Readable**: Formatted file sizes

#### resolve_symlink
Resolve symlink to its target path
- **Recursive**: Follow symlink chains
- **Real Path**: Get absolute target path

### 6. File Comparison (handlers/compare.ts)

#### file_compare
Compare two text files and show unified diff
- **Unified Diff**: Standard diff format
- **Context Lines**: Configurable context (default 3)
- **Whitespace Ignore**: Optional whitespace ignoring

#### binary_compare
Compare two binary files byte-by-byte
- **Exact Comparison**: Byte-level comparison
- **Size Check**: Fast size comparison first
- **Use Case**: Executables, images, archives

#### directory_compare
Compare two directories and show differences
- **Recursive**: Compare subdirectories
- **Content Compare**: Optional file content comparison
- **Report**: Files only in first, only in second, different, identical

### 7. Backup Management (handlers/backup.ts)

#### file_backup
Create versioned or simple backup of a file
- **Versioned**: Timestamped backups (YYYY-MM-DDTHH-MM-SS)
- **Simple**: .bak extension
- **Custom Path**: Specify backup location

#### restore_backup
Restore file from backup
- **Auto Detect**: Restore to original location
- **Custom Target**: Restore to different location

#### list_backups
List all backups for a file
- **Sorted**: By creation time (newest first)
- **Details**: Size, creation date for each backup

#### rotate_backups
Rotate backups, keeping only the N most recent
- **Keep Last**: Number of backups to keep (default 5)
- **Auto Delete**: Removes oldest backups
- **Use Case**: Prevent backup accumulation

### 8. Compression (handlers/compress.ts)

#### compress_file
Compress file using gzip or brotli with configurable compression level
- **Formats**: gzip (.gz), brotli (.br)
- **Levels**: 1-9 (1=fast, 9=best compression)
- **Stats**: Show original size, compressed size, ratio
- **Custom Output**: Specify output path

#### decompress_file
Decompress gzip or brotli compressed file
- **Auto Detect**: Detect format from extension
- **Format Override**: Specify format explicitly
- **Custom Output**: Specify output path

### 9. Cryptographic Hashing (handlers/hash.ts)

#### file_hash
Calculate cryptographic hash of a file
- **Algorithms**: MD5, SHA1, SHA256, SHA512
- **Use Case**: File integrity, checksums

#### batch_hash
Calculate hashes for multiple files
- **Parallel Processing**: Hash multiple files simultaneously
- **Algorithm**: Same algorithm for all files
- **Error Handling**: Continue on error

#### verify_hash
Verify file integrity by comparing hash
- **Hash Comparison**: Case-insensitive comparison
- **Result**: PASS/FAIL with detailed output
- **Use Case**: File integrity verification

#### directory_hash
Calculate hashes for all files in directory recursively
- **Recursive**: Hash all files in subdirectories
- **Hidden Files**: Include/exclude hidden files
- **Output**: Hash + relative path for each file

### 10. File Merging (handlers/merge.ts)

#### file_merge
Merge multiple text files with deduplication and sorting options
- **Separator**: Custom separator (default: newline)
- **Deduplication**: Remove duplicate lines
- **Sorting**: Sort lines alphabetically
- **Use Case**: Log files, data files

#### json_merge
Intelligently merge multiple JSON files
- **Strategy**: Deep merge or shallow merge
- **Array Handling**: Flatten arrays from multiple files
- **Object Merging**: Recursive key merging
- **Formatting**: Pretty-printed JSON output

### 11. Git Integration (handlers/git.ts)

#### git_status
Get git repository status
- **Short Format**: Compact status display
- **Branch Info**: Current branch information

#### git_diff
Show git diff for changes
- **Staged/Unstaged**: Show staged or unstaged changes
- **Specific File**: Diff for single file
- **Context Lines**: Configurable context (default 3)

#### git_log
Show git commit history
- **Limit**: Number of commits to show
- **Oneline**: Compact one-line format
- **Graph**: ASCII branch graph
- **Author Filter**: Filter by author
- **Date Filter**: Filter by date (since)

#### git_branch_list
List git branches
- **Local**: Local branches
- **Remote**: Remote branches
- **All**: All branches
- **Verbose**: Show last commit info

#### git_show
Show git commit details
- **Commit**: Specify commit hash or reference
- **Diffstat**: Show diffstat only

#### git_blame
Show git blame for a file
- **Line Range**: Specific line range
- **Author Info**: Who changed each line
- **Commit Info**: When each line was changed

### 12. Validation & Linting (handlers/validation.ts)

#### syntax_check
Check syntax for TypeScript, JavaScript, or JSON files
- **Auto Detect**: Detect language from extension
- **TypeScript**: Use tsc compiler
- **JavaScript**: Use Node.js --check
- **JSON**: Parse validation
- **Strict Mode**: TypeScript strict mode
- **Config Support**: Custom tsconfig.json path
- **Error Details**: Line, column, message for each error

#### lint_file
Run ESLint on a file with optional auto-fix
- **Auto Fix**: Automatically fix issues
- **Custom Config**: Specify eslint config path
- **Formatting**: Stylish format output

## Usage Examples

### Reading Files
```javascript
// Read text file with specific encoding
{
  "name": "read_text_file",
  "arguments": {
    "path": "/path/to/file.txt",
    "encoding": "utf8",
    "includeMetadata": true
  }
}

// Read specific line range
{
  "name": "read_text_file",
  "arguments": {
    "path": "/path/to/large-file.log",
    "lineRange": { "start": 100, "end": 200 }
  }
}
```

### Writing Files
```javascript
// Write with atomic operation and backup
{
  "name": "write_file",
  "arguments": {
    "path": "/path/to/config.json",
    "content": "{\"key\": \"value\"}",
    "atomic": true,
    "backup": true
  }
}

// Copy directory recursively
{
  "name": "copy_file",
  "arguments": {
    "source": "/path/to/source-dir",
    "destination": "/path/to/dest-dir",
    "recursive": true,
    "preserveTimestamps": true
  }
}
```

### Searching
```javascript
// Content search with regex
{
  "name": "content_search",
  "arguments": {
    "path": "/path/to/project",
    "query": "function\\s+\\w+",
    "useRegex": true,
    "contextLines": 2,
    "filePattern": "*.ts"
  }
}

// Fuzzy file search
{
  "name": "fuzzy_search",
  "arguments": {
    "path": "/path/to/project",
    "query": "cntroller",
    "threshold": 0.7
  }
}
```

### Git Operations
```javascript
// Get git status
{
  "name": "git_status",
  "arguments": {
    "path": "/path/to/repo",
    "short": true
  }
}

// Show recent commits
{
  "name": "git_log",
  "arguments": {
    "path": "/path/to/repo",
    "limit": 20,
    "graph": true,
    "oneline": true
  }
}
```

### Validation
```javascript
// Check TypeScript syntax
{
  "name": "syntax_check",
  "arguments": {
    "path": "/path/to/file.ts",
    "language": "typescript",
    "strict": true
  }
}

// Lint with auto-fix
{
  "name": "lint_file",
  "arguments": {
    "path": "/path/to/file.js",
    "fix": true
  }
}
```

## Performance Considerations

- **Rate Limiting**: 100 requests per minute per tool
- **Buffer Size**: 10MB max buffer for command execution
- **File Size Limits**: 10MB for binary file reading
- **Streaming**: Large file support via streaming
- **Parallel Operations**: Batch operations use parallel processing

## Error Handling

All tools return structured error responses:
- **Validation Errors**: Invalid arguments
- **File System Errors**: Permission denied, file not found, etc.
- **Rate Limit Errors**: Too many requests
- **Path Validation Errors**: Path outside allowed directories

## Logging

All operations are logged with:
- **Audit Trail**: Tool name and arguments
- **Info Level**: Successful operations
- **Warn Level**: Rate limits, validation warnings
- **Error Level**: Failed operations

## Best Practices

1. **Use Atomic Writes**: For critical files, use atomic:true
2. **Enable Backups**: Use backup:true for important edits
3. **Validate Paths**: Always use absolute paths
4. **Batch Operations**: Use batch tools for multiple operations
5. **Rate Limiting**: Implement delays for bulk operations
6. **Error Handling**: Check error responses from all operations

## Tool Count Summary

- **Read**: 5 tools
- **Write**: 8 tools
- **List**: 4 tools
- **Search**: 3 tools
- **Info**: 4 tools
- **Compare**: 3 tools
- **Backup**: 4 tools
- **Compress**: 2 tools
- **Hash**: 4 tools
- **Merge**: 2 tools
- **Git**: 6 tools
- **Validation**: 2 tools

**Total: 47 tools**

## Version

Current version: 0.2.0

## License

This MCP server is part of the filesystem-mcp project.
