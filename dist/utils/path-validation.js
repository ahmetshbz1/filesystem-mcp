import path from 'path';
export function isPathWithinAllowedDirectories(absolutePath, allowedDirectories) {
    if (typeof absolutePath !== 'string' || !Array.isArray(allowedDirectories))
        return false;
    if (!absolutePath || allowedDirectories.length === 0)
        return false;
    if (absolutePath.includes('\x00'))
        return false;
    let normalizedPath;
    try {
        normalizedPath = path.resolve(path.normalize(absolutePath));
    }
    catch {
        return false;
    }
    if (!path.isAbsolute(normalizedPath))
        throw new Error('Path must be absolute after normalization');
    return allowedDirectories.some(dir => {
        if (typeof dir !== 'string' || !dir)
            return false;
        if (dir.includes('\x00'))
            return false;
        let normalizedDir;
        try {
            normalizedDir = path.resolve(path.normalize(dir));
        }
        catch {
            return false;
        }
        if (!path.isAbsolute(normalizedDir))
            throw new Error('Allowed directories must be absolute paths after normalization');
        if (normalizedPath === normalizedDir)
            return true;
        if (normalizedDir === path.sep)
            return normalizedPath.startsWith(path.sep);
        if (path.sep === '\\' && normalizedDir.match(/^[A-Za-z]:\\?$/)) {
            const dirDrive = normalizedDir.charAt(0).toLowerCase();
            const pathDrive = normalizedPath.charAt(0).toLowerCase();
            return pathDrive === dirDrive && normalizedPath.startsWith(normalizedDir.replace(/\\?$/, '\\'));
        }
        return normalizedPath.startsWith(normalizedDir + path.sep);
    });
}
