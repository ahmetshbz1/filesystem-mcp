import { normalizeLineEndings, createUnifiedDiff } from './utils.js';
import fs from 'fs/promises';
import { randomBytes } from 'crypto';
export async function applyFileEdits(filePath, edits, dryRun = false) {
    const content = normalizeLineEndings(await fs.readFile(filePath, 'utf-8'));
    let modifiedContent = content;
    for (const edit of edits) {
        if (edit.useRegex) {
            const regex = new RegExp(edit.oldText, edit.flags || 'g');
            modifiedContent = modifiedContent.replace(regex, edit.newText);
            continue;
        }
        const normalizedOld = normalizeLineEndings(edit.oldText);
        const normalizedNew = normalizeLineEndings(edit.newText);
        if (modifiedContent.includes(normalizedOld)) {
            modifiedContent = modifiedContent.replace(normalizedOld, normalizedNew);
            continue;
        }
        const oldLines = normalizedOld.split('\n');
        const contentLines = modifiedContent.split('\n');
        let matchFound = false;
        for (let i = 0; i <= contentLines.length - oldLines.length; i++) {
            const potentialMatch = contentLines.slice(i, i + oldLines.length);
            const isMatch = oldLines.every((oldLine, j) => oldLine.trim() === potentialMatch[j].trim());
            if (isMatch) {
                const originalIndent = contentLines[i].match(/^\s*/)?.[0] || '';
                const newLines = normalizedNew.split('\n').map((line, j) => (j === 0 ? originalIndent + line.trimStart() : line));
                contentLines.splice(i, oldLines.length, ...newLines);
                modifiedContent = contentLines.join('\n');
                matchFound = true;
                break;
            }
        }
        if (!matchFound) {
            throw new Error(`Could not find exact match for edit:\n${edit.oldText}`);
        }
    }
    const diff = createUnifiedDiff(content, modifiedContent, filePath);
    let numBackticks = 3;
    while (diff.includes('`'.repeat(numBackticks)))
        numBackticks++;
    const formattedDiff = `${'`'.repeat(numBackticks)}diff\n${diff}${'`'.repeat(numBackticks)}\n\n`;
    if (!dryRun) {
        const tempPath = `${filePath}.${randomBytes(16).toString('hex')}.tmp`;
        try {
            await fs.writeFile(tempPath, modifiedContent, 'utf-8');
            await fs.rename(tempPath, filePath);
        }
        catch (error) {
            try {
                await fs.unlink(tempPath);
            }
            catch { }
            throw error;
        }
    }
    return formattedDiff;
}
