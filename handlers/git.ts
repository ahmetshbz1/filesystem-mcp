import { exec } from 'child_process';
import { promisify } from 'util';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { logger } from '../logger.js';
import { validatePath } from '../lib.js';

const execAsync = promisify(exec);

const GitStatusArgsSchema = z.object({
  path: z.string().optional().default('.').describe('Repository path'),
  short: z.boolean().optional().default(false).describe('Show short format')
});

const GitDiffArgsSchema = z.object({
  path: z.string().optional().default('.').describe('Repository path'),
  staged: z.boolean().optional().default(false).describe('Show staged changes'),
  file: z.string().optional().describe('Specific file to diff'),
  unified: z.number().optional().default(3).describe('Lines of context')
});

const GitLogArgsSchema = z.object({
  path: z.string().optional().default('.').describe('Repository path'),
  limit: z.number().optional().default(10).describe('Number of commits to show'),
  oneline: z.boolean().optional().default(false).describe('Show one line per commit'),
  graph: z.boolean().optional().default(false).describe('Show branch graph'),
  author: z.string().optional().describe('Filter by author'),
  since: z.string().optional().describe('Show commits since date (e.g., "2 weeks ago")')
});

const GitBranchListArgsSchema = z.object({
  path: z.string().optional().default('.').describe('Repository path'),
  remote: z.boolean().optional().default(false).describe('Show remote branches'),
  all: z.boolean().optional().default(false).describe('Show all branches')
});

const GitShowArgsSchema = z.object({
  path: z.string().optional().default('.').describe('Repository path'),
  commit: z.string().default('HEAD').describe('Commit hash or reference'),
  stat: z.boolean().optional().default(false).describe('Show diffstat only')
});

const GitBlameArgsSchema = z.object({
  path: z.string().describe('File path'),
  lineStart: z.number().optional().describe('Start line number'),
  lineEnd: z.number().optional().describe('End line number')
});

type ToolInput = any;

async function runGitCommand(cwd: string, command: string): Promise<string> {
  try {
    const { stdout, stderr } = await execAsync(command, { cwd, maxBuffer: 10 * 1024 * 1024 });
    if (stderr && !stderr.includes('warning:')) {
      logger.warn(`Git stderr: ${stderr}`);
    }
    return stdout.trim();
  } catch (error) {
    const execError = error as { code?: number; stderr?: string; stdout?: string };
    throw new Error(`Git command failed: ${execError.stderr || execError.stdout || 'Unknown error'}`);
  }
}

export const tools = [
  {
    name: 'git_status',
    description: 'Get git repository status',
    inputSchema: zodToJsonSchema(GitStatusArgsSchema) as ToolInput
  },
  {
    name: 'git_diff',
    description: 'Show git diff for changes',
    inputSchema: zodToJsonSchema(GitDiffArgsSchema) as ToolInput
  },
  {
    name: 'git_log',
    description: 'Show git commit history',
    inputSchema: zodToJsonSchema(GitLogArgsSchema) as ToolInput
  },
  {
    name: 'git_branch_list',
    description: 'List git branches',
    inputSchema: zodToJsonSchema(GitBranchListArgsSchema) as ToolInput
  },
  {
    name: 'git_show',
    description: 'Show git commit details',
    inputSchema: zodToJsonSchema(GitShowArgsSchema) as ToolInput
  },
  {
    name: 'git_blame',
    description: 'Show git blame for a file',
    inputSchema: zodToJsonSchema(GitBlameArgsSchema) as ToolInput
  }
];

export const handlers: Record<string, (args: any) => Promise<any>> = {
  async git_status(args) {
    const parsed = GitStatusArgsSchema.safeParse(args);
    if (!parsed.success) throw new Error(`Invalid arguments for git_status: ${parsed.error}`);
    const { path: repoPath, short } = parsed.data;
    const validPath = await validatePath(repoPath);

    const flags = short ? '--short --branch' : '';
    const output = await runGitCommand(validPath, `git status ${flags}`);

    logger.info(`Git status checked for ${repoPath}`);
    return {
      content: [{
        type: 'text',
        text: output || 'No git status output'
      }]
    };
  },

  async git_diff(args) {
    const parsed = GitDiffArgsSchema.safeParse(args);
    if (!parsed.success) throw new Error(`Invalid arguments for git_diff: ${parsed.error}`);
    const { path: repoPath, staged, file, unified } = parsed.data;
    const validPath = await validatePath(repoPath);

    const stagedFlag = staged ? '--staged' : '';
    const fileArg = file ? `-- ${file}` : '';
    const output = await runGitCommand(
      validPath,
      `git diff ${stagedFlag} --unified=${unified} ${fileArg}`
    );

    logger.info(`Git diff checked for ${repoPath}`);
    return {
      content: [{
        type: 'text',
        text: output || 'No changes to show'
      }]
    };
  },

  async git_log(args) {
    const parsed = GitLogArgsSchema.safeParse(args);
    if (!parsed.success) throw new Error(`Invalid arguments for git_log: ${parsed.error}`);
    const { path: repoPath, limit, oneline, graph, author, since } = parsed.data;
    const validPath = await validatePath(repoPath);

    const flags = [];
    if (oneline) flags.push('--oneline');
    if (graph) flags.push('--graph');
    if (author) flags.push(`--author="${author}"`);
    if (since) flags.push(`--since="${since}"`);
    flags.push(`-n ${limit}`);

    const output = await runGitCommand(validPath, `git log ${flags.join(' ')}`);

    logger.info(`Git log checked for ${repoPath}`);
    return {
      content: [{
        type: 'text',
        text: output || 'No commits found'
      }]
    };
  },

  async git_branch_list(args) {
    const parsed = GitBranchListArgsSchema.safeParse(args);
    if (!parsed.success) throw new Error(`Invalid arguments for git_branch_list: ${parsed.error}`);
    const { path: repoPath, remote, all } = parsed.data;
    const validPath = await validatePath(repoPath);

    let flags = '-v';
    if (all) flags = '-a -v';
    else if (remote) flags = '-r -v';

    const output = await runGitCommand(validPath, `git branch ${flags}`);

    logger.info(`Git branches listed for ${repoPath}`);
    return {
      content: [{
        type: 'text',
        text: output || 'No branches found'
      }]
    };
  },

  async git_show(args) {
    const parsed = GitShowArgsSchema.safeParse(args);
    if (!parsed.success) throw new Error(`Invalid arguments for git_show: ${parsed.error}`);
    const { path: repoPath, commit, stat } = parsed.data;
    const validPath = await validatePath(repoPath);

    const flags = stat ? '--stat' : '';
    const output = await runGitCommand(validPath, `git show ${flags} ${commit}`);

    logger.info(`Git show executed for ${commit} in ${repoPath}`);
    return {
      content: [{
        type: 'text',
        text: output || 'No commit details found'
      }]
    };
  },

  async git_blame(args) {
    const parsed = GitBlameArgsSchema.safeParse(args);
    if (!parsed.success) throw new Error(`Invalid arguments for git_blame: ${parsed.error}`);
    const { path: filePath, lineStart, lineEnd } = parsed.data;
    const validPath = await validatePath(filePath);

    const lineRange = (lineStart && lineEnd) ? `-L ${lineStart},${lineEnd}` : '';
    const output = await runGitCommand('.', `git blame ${lineRange} ${validPath}`);

    logger.info(`Git blame executed for ${filePath}`);
    return {
      content: [{
        type: 'text',
        text: output || 'No blame information found'
      }]
    };
  }
};
