import path from 'path';
import os from 'os';
export function convertToWindowsPath(p) {
    if (p.startsWith('/mnt/'))
        return p;
    if (p.match(/^\/[a-zA-Z]\//) && process.platform === 'win32') {
        const driveLetter = p.charAt(1).toUpperCase();
        const pathPart = p.slice(2).replace(/\//g, '\\');
        return `${driveLetter}:${pathPart}`;
    }
    if (p.match(/^[a-zA-Z]:/))
        return p.replace(/\//g, '\\');
    return p;
}
export function normalizePath(p) {
    p = p.trim().replace(/^['"]|['"]$/g, '');
    const isUnixPath = p.startsWith('/') && (p.match(/^\/mnt\/[a-z]\//i) || (process.platform !== 'win32') || (process.platform === 'win32' && !p.match(/^\/[a-zA-Z]\//)));
    if (isUnixPath) {
        const normalized = p.replace(/\/+/g, '/').replace(/\/+$/, '');
        return normalized === '' ? '/' : normalized;
    }
    p = convertToWindowsPath(p);
    if (p.startsWith('\\')) {
        let uncPath = p.replace(/^\\{2,}/, '\\\\');
        const restOfPath = uncPath.substring(2).replace(/\\\\/g, '\\');
        p = '\\\\' + restOfPath;
    }
    else {
        p = p.replace(/\\\\/g, '\\');
    }
    let normalized = path.normalize(p);
    if (p.startsWith('\\') && !normalized.startsWith('\\'))
        normalized = '\\' + normalized;
    if (normalized.match(/^[a-zA-Z]:/)) {
        let result = normalized.replace(/\//g, '\\');
        if (/^[a-z]:/.test(result))
            result = result.charAt(0).toUpperCase() + result.slice(1);
        return result;
    }
    if (process.platform === 'win32')
        return normalized.replace(/\//g, '\\');
    return normalized;
}
export function expandHome(filepath) {
    if (filepath.startsWith('~/') || filepath === '~')
        return path.join(os.homedir(), filepath.slice(1));
    return filepath;
}
