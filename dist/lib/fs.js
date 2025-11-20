import fs from 'fs/promises';
export async function getFileStats(filePath) {
    const stats = await fs.stat(filePath);
    return {
        size: stats.size,
        created: stats.birthtime,
        modified: stats.mtime,
        accessed: stats.atime,
        isDirectory: stats.isDirectory(),
        isFile: stats.isFile(),
        permissions: stats.mode.toString(8).slice(-3),
    };
}
export async function readFileContent(filePath, encoding = 'utf-8') {
    return await fs.readFile(filePath, encoding);
}
export async function writeFileContent(filePath, content) {
    try {
        await fs.writeFile(filePath, content, { encoding: 'utf-8', flag: 'wx' });
    }
    catch (error) {
        if (error.code === 'EEXIST') {
            const tempPath = `${filePath}.${Math.random().toString(36).slice(2)}.tmp`;
            try {
                await fs.writeFile(tempPath, content, 'utf-8');
                await fs.rename(tempPath, filePath);
            }
            catch (renameError) {
                try {
                    await fs.unlink(tempPath);
                }
                catch { }
                throw renameError;
            }
        }
        else {
            throw error;
        }
    }
}
