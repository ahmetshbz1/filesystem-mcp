import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs/promises';
import { handlers } from '../handlers/hash.js';
import { setAllowedDirectories } from '../lib.js';

// Mock fs
vi.mock('fs/promises');
vi.mock('../logger.js', () => ({
  logger: { info: vi.fn() },
}));

const mockFs = fs as any;

describe('file_hash', () => {
  beforeEach(() => {
    setAllowedDirectories(['/tmp']);
    vi.clearAllMocks();
    mockFs.realpath.mockImplementation((p: string) => Promise.resolve(p));
  });

  it('should calculate SHA256 hash by default', async () => {
    mockFs.readFile.mockResolvedValue('test content');

    const result = await handlers.file_hash({ path: '/tmp/file.txt' });

    expect(result.content[0].text).toMatch(/^SHA256: [a-f0-9]{64}$/);
  });

  it('should calculate MD5 hash', async () => {
    mockFs.readFile.mockResolvedValue('test content');

    const result = await handlers.file_hash({ path: '/tmp/file.txt', algorithm: 'md5' });

    expect(result.content[0].text).toMatch(/^MD5: [a-f0-9]{32}$/);
  });
});