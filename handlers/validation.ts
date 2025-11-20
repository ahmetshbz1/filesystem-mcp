import fs from 'fs/promises';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { logger } from '../logger.js';
import { validatePath } from '../lib.js';

const execAsync = promisify(exec);

const SyntaxCheckArgsSchema = z.object({
  path: z.string(),
  language: z.enum(['typescript', 'javascript', 'json', 'auto']).optional().default('auto').describe('Language to validate'),
  strict: z.boolean().optional().default(false).describe('Use strict mode for TypeScript'),
  configPath: z.string().optional().describe('Path to tsconfig.json or other config file')
});

const LintArgsSchema = z.object({
  path: z.string(),
  fix: z.boolean().optional().default(false).describe('Auto-fix issues if possible'),
  configPath: z.string().optional().describe('Path to eslint config')
});

type ToolInput = any;

interface ValidationError {
  line?: number;
  column?: number;
  message: string;
  severity: 'error' | 'warning';
}

function detectLanguage(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const languageMap: Record<string, string> = {
    '.ts': 'typescript',
    '.tsx': 'typescript',
    '.js': 'javascript',
    '.jsx': 'javascript',
    '.mjs': 'javascript',
    '.cjs': 'javascript',
    '.json': 'json'
  };
  return languageMap[ext] || 'unknown';
}

async function validateJSON(content: string): Promise<ValidationError[]> {
  try {
    JSON.parse(content);
    return [];
  } catch (error) {
    const err = error as SyntaxError;
    const match = err.message.match(/position (\d+)/);
    const position = match ? parseInt(match[1], 10) : 0;

    const lines = content.substring(0, position).split('\n');
    const line = lines.length;
    const column = lines[lines.length - 1].length + 1;

    return [{
      line,
      column,
      message: err.message,
      severity: 'error'
    }];
  }
}

async function validateTypeScript(
  filePath: string,
  strict: boolean,
  configPath?: string
): Promise<ValidationError[]> {
  try {
    const configFlag = configPath ? `--project ${configPath}` : '';
    const strictFlag = strict ? '--strict' : '';

    const { stdout, stderr } = await execAsync(
      `npx tsc --noEmit ${strictFlag} ${configFlag} ${filePath}`,
      { maxBuffer: 10 * 1024 * 1024 }
    );

    if (!stderr && !stdout) return [];

    const output = stderr || stdout;
    const errors: ValidationError[] = [];
    const lines = output.split('\n');

    for (const line of lines) {
      const match = line.match(/(.+)\((\d+),(\d+)\):\s+(error|warning)\s+TS\d+:\s+(.+)/);
      if (match) {
        errors.push({
          line: parseInt(match[2], 10),
          column: parseInt(match[3], 10),
          message: match[5],
          severity: match[4] as 'error' | 'warning'
        });
      }
    }

    return errors;
  } catch (error) {
    const execError = error as { stdout?: string; stderr?: string };
    const output = execError.stderr || execError.stdout || '';
    const errors: ValidationError[] = [];
    const lines = output.split('\n');

    for (const line of lines) {
      const match = line.match(/(.+)\((\d+),(\d+)\):\s+(error|warning)\s+TS\d+:\s+(.+)/);
      if (match) {
        errors.push({
          line: parseInt(match[2], 10),
          column: parseInt(match[3], 10),
          message: match[5],
          severity: match[4] as 'error' | 'warning'
        });
      }
    }

    return errors;
  }
}

async function validateJavaScript(filePath: string): Promise<ValidationError[]> {
  try {
    const content = await fs.readFile(filePath, 'utf8');

    const { stdout, stderr } = await execAsync(
      `node --check ${filePath}`,
      { maxBuffer: 10 * 1024 * 1024 }
    );

    if (!stderr) return [];

    const errors: ValidationError[] = [];
    const lines = stderr.split('\n');

    for (const line of lines) {
      if (line.includes('SyntaxError')) {
        errors.push({
          message: line,
          severity: 'error'
        });
      }
    }

    return errors;
  } catch (error) {
    const execError = error as { stderr?: string };
    return [{
      message: execError.stderr || 'JavaScript syntax error',
      severity: 'error'
    }];
  }
}

async function runESLint(filePath: string, fix: boolean, configPath?: string): Promise<string> {
  try {
    const fixFlag = fix ? '--fix' : '';
    const configFlag = configPath ? `--config ${configPath}` : '';

    const { stdout } = await execAsync(
      `npx eslint ${fixFlag} ${configFlag} --format stylish ${filePath}`,
      { maxBuffer: 10 * 1024 * 1024 }
    );

    return stdout || 'No linting issues found';
  } catch (error) {
    const execError = error as { stdout?: string; stderr?: string };
    return execError.stdout || execError.stderr || 'Linting failed';
  }
}

export const tools = [
  {
    name: 'syntax_check',
    description: 'Check syntax for TypeScript, JavaScript, or JSON files',
    inputSchema: zodToJsonSchema(SyntaxCheckArgsSchema) as ToolInput
  },
  {
    name: 'lint_file',
    description: 'Run ESLint on a file with optional auto-fix',
    inputSchema: zodToJsonSchema(LintArgsSchema) as ToolInput
  }
];

export const handlers: Record<string, (args: any) => Promise<any>> = {
  async syntax_check(args) {
    const parsed = SyntaxCheckArgsSchema.safeParse(args);
    if (!parsed.success) throw new Error(`Invalid arguments for syntax_check: ${parsed.error}`);
    const { path: filePath, language, strict, configPath } = parsed.data;
    const validPath = await validatePath(filePath);

    const detectedLang = language === 'auto' ? detectLanguage(validPath) : language;
    const content = await fs.readFile(validPath, 'utf8');

    let errors: ValidationError[] = [];

    switch (detectedLang) {
      case 'json':
        errors = await validateJSON(content);
        break;
      case 'typescript':
        errors = await validateTypeScript(validPath, strict, configPath);
        break;
      case 'javascript':
        errors = await validateJavaScript(validPath);
        break;
      default:
        throw new Error(`Unsupported language: ${detectedLang}`);
    }

    logger.info(`Syntax check completed for ${filePath}: ${errors.length} issues found`);

    if (errors.length === 0) {
      return {
        content: [{
          type: 'text',
          text: `Syntax check passed for ${filePath}\nLanguage: ${detectedLang}\nNo issues found`
        }]
      };
    }

    const errorMessages = errors.map(err => {
      const location = err.line && err.column ? `[${err.line}:${err.column}]` : '';
      return `${err.severity.toUpperCase()} ${location}: ${err.message}`;
    });

    const summary = [
      `Syntax check completed for ${filePath}`,
      `Language: ${detectedLang}`,
      `Issues found: ${errors.length}`,
      '',
      ...errorMessages
    ].join('\n');

    return {
      content: [{
        type: 'text',
        text: summary
      }]
    };
  },

  async lint_file(args) {
    const parsed = LintArgsSchema.safeParse(args);
    if (!parsed.success) throw new Error(`Invalid arguments for lint_file: ${parsed.error}`);
    const { path: filePath, fix, configPath } = parsed.data;
    const validPath = await validatePath(filePath);

    const output = await runESLint(validPath, fix, configPath);

    logger.info(`ESLint ${fix ? 'fix' : 'check'} completed for ${filePath}`);

    return {
      content: [{
        type: 'text',
        text: output
      }]
    };
  }
};
