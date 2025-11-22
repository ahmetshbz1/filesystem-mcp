import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs/promises';
import { handlers } from '../src/handlers/utility.js';
import { setAllowedDirectories } from '../src/lib.js';

// Mock fs
vi.mock('fs/promises');
vi.mock('../logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn() },
}));

const mockFs = fs as any;

describe('file_merge', () => {
  beforeEach(() => {
    setAllowedDirectories(['/tmp']);
    vi.clearAllMocks();
    mockFs.realpath.mockImplementation((p: string) => Promise.resolve(p));
  });

  it('should merge multiple files', async () => {
    mockFs.readFile.mockResolvedValueOnce('content1').mockResolvedValueOnce('content2');
    mockFs.writeFile.mockResolvedValue(undefined);

    const result = await handlers.utility({ operation: 'merge-text', paths: ['/tmp/file1.txt', '/tmp/file2.txt'], outputPath: '/tmp/merged.txt' });

    expect(mockFs.writeFile).toHaveBeenCalledWith('/tmp/merged.txt', 'content1\ncontent2', 'utf8');
    expect(result.content[0].text).toBe('Merged 2 files to: /tmp/merged.txt');
  });

  it('should use custom separator', async () => {
    mockFs.readFile.mockResolvedValue('content');
    mockFs.writeFile.mockResolvedValue(undefined);

    await handlers.utility({ operation: 'merge-text', paths: ['/tmp/file1.txt', '/tmp/file2.txt'], outputPath: '/tmp/merged.txt', separator: '---' });

    expect(mockFs.writeFile).toHaveBeenCalledWith('/tmp/merged.txt', 'content---content', 'utf8');
  });
});