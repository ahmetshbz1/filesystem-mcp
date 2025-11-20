import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import { handlers } from '../handlers/backup.js';
import { setAllowedDirectories } from '../lib.js';

// Mock fs
vi.mock('fs/promises');
vi.mock('../logger.js', () => ({
  logger: { info: vi.fn() },
}));

const mockFs = fs as any;

describe('file_backup', () => {
  const mockFs = fs as any;
  beforeEach(() => {
    setAllowedDirectories(['/tmp']);
    vi.clearAllMocks();
    mockFs.realpath.mockImplementation((p: string) => Promise.resolve(p));
  });

  it('should create backup with default path', async () => {
    mockFs.copyFile.mockResolvedValue(undefined);

    const result = await handlers.file_backup({ path: '/tmp/file.txt' });

    expect(mockFs.copyFile).toHaveBeenCalledWith('/tmp/file.txt', '/tmp/file.txt.bak');
    expect(result.content[0].text).toBe('Backup created: /tmp/file.txt.bak');
  });

  it('should create backup with custom path', async () => {
    mockFs.copyFile.mockResolvedValue(undefined);

    const result = await handlers.file_backup({ path: '/tmp/file.txt', backupPath: '/tmp/backup.txt' });

    expect(mockFs.copyFile).toHaveBeenCalledWith('/tmp/file.txt', '/tmp/backup.txt');
    expect(result.content[0].text).toBe('Backup created: /tmp/backup.txt');
  });
});