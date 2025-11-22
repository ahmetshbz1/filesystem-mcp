import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import { handlers } from '../src/handlers/utility.js';
import { setAllowedDirectories } from '../src/lib.js';

// Mock fs
vi.mock('fs/promises');
vi.mock('../src/logger.js', () => ({
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

    const result = await handlers.utility({ operation: 'backup-create', path: '/tmp/file.txt' });

    // Note: utility handler uses timestamp in backup path if not specified, so exact match is hard
    // But we can check if copyFile was called
    expect(mockFs.copyFile).toHaveBeenCalled();
    expect(result.content[0].text).toContain('Backup created:');
  });

  it('should create backup with custom path', async () => {
    mockFs.copyFile.mockResolvedValue(undefined);

    const result = await handlers.utility({ operation: 'backup-create', path: '/tmp/file.txt', backupPath: '/tmp/backup.txt' });

    expect(mockFs.copyFile).toHaveBeenCalledWith('/tmp/file.txt', '/tmp/backup.txt');
    expect(result.content[0].text).toBe('Backup created: /tmp/backup.txt');
  });
});