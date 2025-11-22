import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs/promises';
import { handlers } from '../src/handlers/compare.js';
import { setAllowedDirectories } from '../src/lib.js';

// Mock fs and logger
vi.mock('fs/promises');
vi.mock('../src/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

const mockFs = fs as any;

describe('file_compare', () => {
  beforeEach(() => {
    setAllowedDirectories(['/tmp']);
    mockFs.realpath.mockImplementation((p: string) => Promise.resolve(p));
  });

  it('should compare two identical files', async () => {
    const mockContent = 'line1\nline2\nline3';
    (fs.readFile as any).mockResolvedValue(mockContent);

    const result = await handlers.compare({ type: 'text', path1: '/tmp/file1.txt', path2: '/tmp/file2.txt' });

    expect(result.content[0].text).toContain('Index: /tmp/file1.txt');
    expect(result.content[0].text).toContain('original');
    expect(result.content[0].text).toContain('modified');
  });

  it('should compare two different files', async () => {
    const content1 = 'line1\nline2\nline3';
    const content2 = 'line1\nchanged\nline3';
    (fs.readFile as any).mockImplementation((path: string) => {
      if (path === '/tmp/file1.txt') return Promise.resolve(content1);
      if (path === '/tmp/file2.txt') return Promise.resolve(content2);
      throw new Error('File not found');
    });

    const result = await handlers.compare({ type: 'text', path1: '/tmp/file1.txt', path2: '/tmp/file2.txt' });

    expect(result.content[0].text).toContain('+changed');
    expect(result.content[0].text).toContain('-line2');
  });

  it('should throw error for invalid path', async () => {
    await expect(handlers.compare({
      type: 'text',
      path1: '/invalid/path',
      path2: '/tmp/file2.txt'
    })).rejects.toThrow('Access denied');
  });
});