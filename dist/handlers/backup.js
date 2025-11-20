import fs from 'fs/promises';
import path from 'path';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { logger } from '../logger.js';
import { validatePath, formatSize } from '../lib.js';
const FileBackupArgsSchema = z.object({
    path: z.string(),
    backupPath: z.string().optional(),
    versioned: z.boolean().optional().default(false).describe('Create timestamped backup')
});
const RestoreBackupArgsSchema = z.object({
    backupPath: z.string(),
    targetPath: z.string().optional().describe('Restore to different location')
});
const ListBackupsArgsSchema = z.object({
    path: z.string().describe('Original file path to find backups for')
});
const RotateBackupsArgsSchema = z.object({
    path: z.string(),
    keepLast: z.number().min(1).default(5).describe('Number of backups to keep')
});
async function findBackups(filePath) {
    const dir = path.dirname(filePath);
    const basename = path.basename(filePath);
    try {
        const entries = await fs.readdir(dir);
        const backups = [];
        for (const entry of entries) {
            if (entry.startsWith(basename) && (entry.endsWith('.bak') || entry.includes('.backup.'))) {
                const fullPath = path.join(dir, entry);
                try {
                    const stats = await fs.stat(fullPath);
                    backups.push({
                        path: fullPath,
                        created: stats.mtime,
                        size: stats.size
                    });
                }
                catch { }
            }
        }
        return backups.sort((a, b) => b.created.getTime() - a.created.getTime());
    }
    catch {
        return [];
    }
}
export const tools = [
    {
        name: 'file_backup',
        description: 'Create versioned or simple backup of a file',
        inputSchema: zodToJsonSchema(FileBackupArgsSchema)
    },
    {
        name: 'restore_backup',
        description: 'Restore file from backup',
        inputSchema: zodToJsonSchema(RestoreBackupArgsSchema)
    },
    {
        name: 'list_backups',
        description: 'List all backups for a file',
        inputSchema: zodToJsonSchema(ListBackupsArgsSchema)
    },
    {
        name: 'rotate_backups',
        description: 'Rotate backups, keeping only the N most recent',
        inputSchema: zodToJsonSchema(RotateBackupsArgsSchema)
    }
];
export const handlers = {
    file_backup: async (args) => {
        const { path: filePath, backupPath, versioned } = args;
        const validPath = await validatePath(filePath);
        let backup;
        if (backupPath) {
            backup = backupPath;
            await validatePath(path.dirname(backup));
        }
        else if (versioned) {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
            backup = `${validPath}.backup.${timestamp}`;
        }
        else {
            backup = `${validPath}.bak`;
        }
        await fs.copyFile(validPath, backup);
        const stats = await fs.stat(backup);
        logger.info(`Backed up ${filePath} to ${backup}`);
        return {
            content: [{
                    type: 'text',
                    text: `Backup created: ${backup}\nSize: ${formatSize(stats.size)}`
                }]
        };
    },
    restore_backup: async (args) => {
        const { backupPath, targetPath } = args;
        const validBackupPath = await validatePath(backupPath);
        let target;
        if (targetPath) {
            target = targetPath;
            await validatePath(path.dirname(target));
        }
        else {
            target = validBackupPath.replace(/\.(bak|backup\.[^.]+)$/, '');
        }
        await fs.copyFile(validBackupPath, target);
        logger.info(`Restored ${backupPath} to ${target}`);
        return {
            content: [{
                    type: 'text',
                    text: `Backup restored to: ${target}`
                }]
        };
    },
    list_backups: async (args) => {
        const { path: filePath } = args;
        const validPath = await validatePath(filePath);
        const backups = await findBackups(validPath);
        if (backups.length === 0) {
            return { content: [{ type: 'text', text: 'No backups found' }] };
        }
        const lines = [
            `Backups for: ${filePath}`,
            '='.repeat(60),
            ''
        ];
        backups.forEach((backup, index) => {
            lines.push(`${index + 1}. ${path.basename(backup.path)}`);
            lines.push(`   Created: ${backup.created.toISOString()}`);
            lines.push(`   Size: ${formatSize(backup.size)}`);
            lines.push('');
        });
        return { content: [{ type: 'text', text: lines.join('\n') }] };
    },
    rotate_backups: async (args) => {
        const { path: filePath, keepLast } = args;
        const validPath = await validatePath(filePath);
        const backups = await findBackups(validPath);
        if (backups.length <= keepLast) {
            return {
                content: [{
                        type: 'text',
                        text: `No rotation needed. Found ${backups.length} backups, keeping ${keepLast}`
                    }]
            };
        }
        const toDelete = backups.slice(keepLast);
        let deleted = 0;
        for (const backup of toDelete) {
            try {
                await fs.unlink(backup.path);
                deleted++;
            }
            catch (error) {
                logger.warn(`Failed to delete ${backup.path}: ${error}`);
            }
        }
        logger.info(`Rotated backups for ${filePath}: kept ${keepLast}, deleted ${deleted}`);
        return {
            content: [{
                    type: 'text',
                    text: `Backup rotation complete:\n  Kept: ${keepLast}\n  Deleted: ${deleted}`
                }]
        };
    }
};
