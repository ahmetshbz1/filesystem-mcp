import fs from 'fs/promises';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { logger } from '../logger.js';
import { validatePath } from '../lib.js';
const execAsync = promisify(exec);
const ValidateArgsSchema = z.object({
    path: z.string(),
    type: z.enum(['syntax', 'lint']).default('syntax'),
    language: z.enum(['typescript', 'javascript', 'json', 'auto']).optional().default('auto'),
    strict: z.boolean().optional().default(false),
    configPath: z.string().optional(),
    fix: z.boolean().optional().default(false)
});
function detectLanguage(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const map = {
        '.ts': 'typescript', '.tsx': 'typescript', '.js': 'javascript',
        '.jsx': 'javascript', '.mjs': 'javascript', '.cjs': 'javascript', '.json': 'json'
    };
    return map[ext] || 'unknown';
}
export const tools = [{
        name: 'validate',
        description: 'Unified validation tool. Use type: syntax|lint',
        inputSchema: zodToJsonSchema(ValidateArgsSchema)
    }];
export const handlers = {
    async validate(args) {
        const parsed = ValidateArgsSchema.safeParse(args);
        if (!parsed.success)
            throw new Error(`Invalid arguments: ${parsed.error}`);
        const validPath = await validatePath(parsed.data.path);
        switch (parsed.data.type) {
            case 'syntax': return handleSyntax(validPath, parsed.data);
            case 'lint': return handleLint(validPath, parsed.data);
            default: throw new Error('Invalid validation type');
        }
    }
};
async function handleSyntax(validPath, data) {
    const lang = data.language === 'auto' ? detectLanguage(validPath) : data.language;
    const content = await fs.readFile(validPath, 'utf8');
    let errors = [];
    if (lang === 'json') {
        errors = await validateJSON(content);
    }
    else if (lang === 'typescript') {
        errors = await validateTypeScript(validPath, data.strict, data.configPath);
    }
    else if (lang === 'javascript') {
        errors = await validateJavaScript(validPath);
    }
    else {
        throw new Error(`Unsupported language: ${lang}`);
    }
    logger.info(`Syntax check completed for ${data.path}: ${errors.length} issues`);
    if (errors.length === 0) {
        return { content: [{ type: 'text', text: `Syntax check passed\nLanguage: ${lang}\nNo issues found` }] };
    }
    const errorMessages = errors.map(err => {
        const location = err.line && err.column ? `[${err.line}:${err.column}]` : '';
        return `${err.severity.toUpperCase()} ${location}: ${err.message}`;
    });
    return { content: [{ type: 'text', text: `Syntax check completed\nLanguage: ${lang}\nIssues: ${errors.length}\n\n${errorMessages.join('\n')}` }] };
}
async function validateJSON(content) {
    try {
        JSON.parse(content);
        return [];
    }
    catch (error) {
        const err = error;
        const match = err.message.match(/position (\d+)/);
        const position = match ? parseInt(match[1], 10) : 0;
        const lines = content.substring(0, position).split('\n');
        return [{
                line: lines.length,
                column: lines[lines.length - 1].length + 1,
                message: err.message,
                severity: 'error'
            }];
    }
}
async function validateTypeScript(filePath, strict, configPath) {
    try {
        const configFlag = configPath ? `--project ${configPath}` : '';
        const strictFlag = strict ? '--strict' : '';
        const { stdout, stderr } = await execAsync(`npx tsc --noEmit ${strictFlag} ${configFlag} ${filePath}`, { maxBuffer: 10 * 1024 * 1024 });
        if (!stderr && !stdout)
            return [];
        const output = stderr || stdout;
        const errors = [];
        const lines = output.split('\n');
        for (const line of lines) {
            const match = line.match(/(.+)\((\d+),(\d+)\):\s+(error|warning)\s+TS\d+:\s+(.+)/);
            if (match) {
                errors.push({
                    line: parseInt(match[2], 10),
                    column: parseInt(match[3], 10),
                    message: match[5],
                    severity: match[4]
                });
            }
        }
        return errors;
    }
    catch (error) {
        const execError = error;
        const output = execError.stderr || execError.stdout || '';
        const errors = [];
        const lines = output.split('\n');
        for (const line of lines) {
            const match = line.match(/(.+)\((\d+),(\d+)\):\s+(error|warning)\s+TS\d+:\s+(.+)/);
            if (match) {
                errors.push({ line: parseInt(match[2], 10), column: parseInt(match[3], 10), message: match[5], severity: match[4] });
            }
        }
        return errors;
    }
}
async function validateJavaScript(filePath) {
    try {
        await execAsync(`node --check ${filePath}`, { maxBuffer: 10 * 1024 * 1024 });
        return [];
    }
    catch (error) {
        const execError = error;
        return [{ message: execError.stderr || 'JavaScript syntax error', severity: 'error' }];
    }
}
async function handleLint(validPath, data) {
    const fixFlag = data.fix ? '--fix' : '';
    const configFlag = data.configPath ? `--config ${data.configPath}` : '';
    try {
        const { stdout } = await execAsync(`npx eslint ${fixFlag} ${configFlag} --format stylish ${validPath}`, { maxBuffer: 10 * 1024 * 1024 });
        return { content: [{ type: 'text', text: stdout || 'No linting issues found' }] };
    }
    catch (error) {
        const execError = error;
        return { content: [{ type: 'text', text: execError.stdout || execError.stderr || 'Linting failed' }] };
    }
}
