import { exec } from 'child_process';
import { promisify } from 'util';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { logger } from '../logger.js';
import { validatePath } from '../lib.js';
import type { ToolInput, MCPResponse, HandlerFunction } from './types.js';

const execAsync = promisify(exec);

const GitArgsSchema = z.object({
  command: z.enum(['status', 'log', 'diff', 'branch', 'show', 'blame']),
  path: z.string().optional().default('.'),
  short: z.boolean().optional().default(false),
  staged: z.boolean().optional().default(false),
  file: z.string().optional(),
  unified: z.number().optional().default(3),
  limit: z.number().optional().default(10),
  oneline: z.boolean().optional().default(false),
  graph: z.boolean().optional().default(false),
  author: z.string().optional(),
  since: z.string().optional(),
  remote: z.boolean().optional().default(false),
  all: z.boolean().optional().default(false),
  commit: z.string().optional().default('HEAD'),
  stat: z.boolean().optional().default(false),
  lineStart: z.number().optional(),
  lineEnd: z.number().optional()
});

async function runGitCommand(cwd: string, command: string): Promise<string> {
  try {
    const { stdout, stderr } = await execAsync(command, { cwd, maxBuffer: 10 * 1024 * 1024 });
    if (stderr && !stderr.includes('warning:')) logger.warn(`Git stderr: ${stderr}`);
    return stdout.trim();
  } catch (error) {
    const execError = error as { stderr?: string; stdout?: string };
    throw new Error(`Git command failed: ${execError.stderr || execError.stdout || 'Unknown error'}`);
  }
}

export const tools = [{
  name: 'git',
  description: 'Unified git tool. Use command: status|log|diff|branch|show|blame',
  inputSchema: zodToJsonSchema(GitArgsSchema) as ToolInput
}];

export const handlers: Record<string, HandlerFunction> = {
  async git(args: Record<string, unknown>): Promise<MCPResponse> {
    const parsed = GitArgsSchema.safeParse(args);
    if (!parsed.success) throw new Error(`Invalid arguments: ${parsed.error}`);
    const validPath = await validatePath(parsed.data.path);

    switch(parsed.data.command) {
      case 'status': return handleStatus(validPath, parsed.data);
      case 'log': return handleLog(validPath, parsed.data);
      case 'diff': return handleDiff(validPath, parsed.data);
      case 'branch': return handleBranch(validPath, parsed.data);
      case 'show': return handleShow(validPath, parsed.data);
      case 'blame': return handleBlame(parsed.data);
      default: throw new Error('Invalid git command');
    }
  }
};

type GitArgs = z.infer<typeof GitArgsSchema>;

async function handleStatus(cwd: string, data: GitArgs): Promise<MCPResponse> {
  const flags = data.short ? '--short --branch' : '';
  const output = await runGitCommand(cwd, `git status ${flags}`);
  return { content: [{ type: 'text', text: output || 'No git status output' }] };
}

async function handleLog(cwd: string, data: GitArgs): Promise<MCPResponse> {
  const flags: string[] = [];
  if (data.oneline) flags.push('--oneline');
  if (data.graph) flags.push('--graph');
  if (data.author) flags.push(`--author="${data.author}"`);
  if (data.since) flags.push(`--since="${data.since}"`);
  flags.push(`-n ${data.limit}`);
  const output = await runGitCommand(cwd, `git log ${flags.join(' ')}`);
  return { content: [{ type: 'text', text: output || 'No commits found' }] };
}

async function handleDiff(cwd: string, data: GitArgs): Promise<MCPResponse> {
  const stagedFlag = data.staged ? '--staged' : '';
  const fileArg = data.file ? `-- ${data.file}` : '';
  const output = await runGitCommand(cwd, `git diff ${stagedFlag} --unified=${data.unified} ${fileArg}`);
  return { content: [{ type: 'text', text: output || 'No changes to show' }] };
}

async function handleBranch(cwd: string, data: GitArgs): Promise<MCPResponse> {
  let flags = '-v';
  if (data.all) flags = '-a -v';
  else if (data.remote) flags = '-r -v';
  const output = await runGitCommand(cwd, `git branch ${flags}`);
  return { content: [{ type: 'text', text: output || 'No branches found' }] };
}

async function handleShow(cwd: string, data: GitArgs): Promise<MCPResponse> {
  const flags = data.stat ? '--stat' : '';
  const output = await runGitCommand(cwd, `git show ${flags} ${data.commit}`);
  return { content: [{ type: 'text', text: output || 'No commit details found' }] };
}

async function handleBlame(data: GitArgs): Promise<MCPResponse> {
  if (!data.file) throw new Error('file is required for blame command');
  const validPath = await validatePath(data.file);
  const lineRange = (data.lineStart && data.lineEnd) ? `-L ${data.lineStart},${data.lineEnd}` : '';
  const output = await runGitCommand('.', `git blame ${lineRange} ${validPath}`);
  return { content: [{ type: 'text', text: output || 'No blame information found' }] };
}
