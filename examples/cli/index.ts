#!/usr/bin/env npx tsx
/**
 * Ralph Wiggum CLI - Autonomous Coding Agent
 *
 * A general-purpose agent for long-running autonomous coding tasks like:
 * - Code migrations (Jest → Vitest, CJS → ESM, etc.)
 * - Dependency upgrades
 * - Refactoring across large codebases
 * - Creating new features from specifications
 * - Fixing bugs across multiple files
 *
 * Usage:
 *   npx tsx index.ts /path/to/repo                    # Uses PROMPT.md in repo
 *   npx tsx index.ts /path/to/repo "Your task"        # Uses provided prompt
 *   npx tsx index.ts /path/to/repo ./task.md          # Uses prompt from file
 *
 * The prompt can be:
 *   1. A PROMPT.md file in the target directory (auto-detected)
 *   2. A string passed as the second argument
 *   3. A path to a .md file passed as the second argument
 *
 * Environment:
 *   ANTHROPIC_API_KEY - Your Anthropic API key
 */

import {
  RalphLoopAgent,
  iterationCountIs,
  type VerifyCompletionContext,
} from 'ralph-wiggum';
import { tool } from 'ai';
import { z } from 'zod';
import * as fs from 'fs/promises';
import * as path from 'path';
import { glob } from 'glob';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Constants for context management
const MAX_FILE_CHARS = 30_000;
const MAX_FILE_LINES_PREVIEW = 400;

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  magenta: '\x1b[35m',
  blue: '\x1b[34m',
  red: '\x1b[31m',
};

function log(message: string, color: keyof typeof colors = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSection(title: string) {
  console.log();
  log(`━━━ ${title} ━━━`, 'cyan');
}

// Get CLI arguments
const targetDir = process.argv[2];
const promptArg = process.argv[3];

if (!targetDir) {
  console.error('Usage: npx tsx index.ts <target-directory> [prompt or prompt-file]');
  console.error('');
  console.error('Examples:');
  console.error('  npx tsx index.ts ~/Developer/myproject                     # Uses PROMPT.md in repo');
  console.error('  npx tsx index.ts ~/Developer/myproject "Add TypeScript"    # Uses provided prompt');
  console.error('  npx tsx index.ts ~/Developer/myproject ./task.md           # Uses prompt from file');
  process.exit(1);
}

const resolvedDir = path.resolve(targetDir.replace('~', process.env.HOME || ''));

/**
 * Get the task prompt from various sources:
 * 1. CLI argument (string or path to .md file)
 * 2. PROMPT.md in the target directory
 * 3. Default fallback
 */
async function getTaskPrompt(): Promise<{ prompt: string; source: string }> {
  // If a prompt argument was provided
  if (promptArg) {
    // Check if it's a path to a .md file
    if (promptArg.endsWith('.md')) {
      const promptPath = path.resolve(promptArg.replace('~', process.env.HOME || ''));
      try {
        const content = await fs.readFile(promptPath, 'utf-8');
        return { prompt: content.trim(), source: promptPath };
      } catch {
        // If file doesn't exist, treat it as a literal string
        return { prompt: promptArg, source: 'CLI argument' };
      }
    }
    // It's a literal prompt string
    return { prompt: promptArg, source: 'CLI argument' };
  }

  // Check for PROMPT.md in target directory
  const promptMdPath = path.join(resolvedDir, 'PROMPT.md');
  try {
    const content = await fs.readFile(promptMdPath, 'utf-8');
    return { prompt: content.trim(), source: promptMdPath };
  } catch {
    // No PROMPT.md found
  }

  // Default fallback
  return {
    prompt: 'Analyze this codebase and suggest improvements that could be made.',
    source: 'default',
  };
}

// Define tools for the agent
const tools = {
  listFiles: tool({
    description: 'List files in a directory matching a glob pattern',
    inputSchema: z.object({
      pattern: z.string().describe('Glob pattern like "**/*.js" or "src/**/*.ts"'),
    }),
    execute: async ({ pattern }) => {
      try {
        const files = await glob(pattern, { cwd: resolvedDir, nodir: true });
        log(`  📂 Found ${files.length} files matching "${pattern}"`, 'dim');
        return { success: true, files: files.slice(0, 100) }; // Limit to 100 files
      } catch (error) {
        return { success: false, error: String(error) };
      }
    },
  }),

  readFile: tool({
    description: 'Read the contents of a file. For large files, use lineStart/lineEnd to read specific sections.',
    inputSchema: z.object({
      filePath: z.string().describe('Path to the file relative to the project root'),
      lineStart: z.number().optional().describe('Start line (1-indexed). Use for large files.'),
      lineEnd: z.number().optional().describe('End line (inclusive). Use for large files.'),
    }),
    execute: async ({ filePath, lineStart, lineEnd }) => {
      try {
        const fullPath = path.join(resolvedDir, filePath);
        const content = await fs.readFile(fullPath, 'utf-8');
        const lines = content.split('\n');
        const totalLines = lines.length;
        
        // If specific range requested, extract it
        if (lineStart !== undefined || lineEnd !== undefined) {
          const start = Math.max(1, lineStart ?? 1);
          const end = Math.min(totalLines, lineEnd ?? totalLines);
          const selectedLines = lines.slice(start - 1, end);
          const numberedContent = selectedLines
            .map((line, i) => `${String(start + i).padStart(6)}| ${line}`)
            .join('\n');
          log(`  📖 Read: ${filePath} lines ${start}-${end} of ${totalLines}`, 'dim');
          return { 
            success: true, 
            content: numberedContent,
            totalLines,
            lineRange: { start, end },
          };
        }
        
        // Auto-truncate large files
        if (content.length > MAX_FILE_CHARS) {
          const maxLines = Math.min(MAX_FILE_LINES_PREVIEW, totalLines);
          const selectedLines = lines.slice(0, maxLines);
          const numberedContent = selectedLines
            .map((line, i) => `${String(i + 1).padStart(6)}| ${line}`)
            .join('\n');
          const warning = `\n\n... [TRUNCATED: File has ${totalLines} lines, showing 1-${maxLines}. Use lineStart/lineEnd to read specific sections] ...`;
          log(`  📖 Read: ${filePath} (TRUNCATED: ${totalLines} lines, showing 1-${maxLines})`, 'yellow');
          return { 
            success: true, 
            content: numberedContent + warning,
            totalLines,
            truncated: true,
            lineRange: { start: 1, end: maxLines },
          };
        }
        
        log(`  📖 Read: ${filePath} (${content.length} chars)`, 'dim');
        return { success: true, content, totalLines };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    },
  }),

  writeFile: tool({
    description: 'Write content to a file (creates directories if needed). For small changes, prefer editFile instead.',
    inputSchema: z.object({
      filePath: z.string().describe('Path to the file relative to the project root'),
      content: z.string().describe('The content to write to the file'),
    }),
    execute: async ({ filePath, content }) => {
      try {
        const fullPath = path.join(resolvedDir, filePath);
        await fs.mkdir(path.dirname(fullPath), { recursive: true });
        await fs.writeFile(fullPath, content, 'utf-8');
        log(`  ✏️  Wrote: ${filePath}`, 'green');
        return { success: true, filePath };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    },
  }),

  editFile: tool({
    description: 'Make surgical edits to a file by replacing specific text. More token-efficient than writeFile for small changes. The old_string must be unique in the file.',
    inputSchema: z.object({
      filePath: z.string().describe('Path to the file relative to the project root'),
      old_string: z.string().describe('Exact text to find and replace (must be unique in the file)'),
      new_string: z.string().describe('Text to replace it with'),
    }),
    execute: async ({ filePath, old_string, new_string }) => {
      try {
        const fullPath = path.join(resolvedDir, filePath);
        const content = await fs.readFile(fullPath, 'utf-8');
        
        // Check for exact match
        const occurrences = content.split(old_string).length - 1;
        if (occurrences === 0) {
          return { 
            success: false, 
            error: 'old_string not found in file. Make sure it matches exactly (including whitespace).',
          };
        }
        if (occurrences > 1) {
          return { 
            success: false, 
            error: `old_string found ${occurrences} times - must be unique. Add more surrounding context to make it unique.`,
          };
        }
        
        // Perform replacement
        const newContent = content.replace(old_string, new_string);
        await fs.writeFile(fullPath, newContent, 'utf-8');
        
        log(`  🔧 Edited: ${filePath}`, 'green');
        return { 
          success: true, 
          filePath,
          replaced: old_string.length > 100 ? old_string.slice(0, 100) + '...' : old_string,
          with: new_string.length > 100 ? new_string.slice(0, 100) + '...' : new_string,
        };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    },
  }),

  deleteFile: tool({
    description: 'Delete a file',
    inputSchema: z.object({
      filePath: z.string().describe('Path to the file relative to the project root'),
    }),
    execute: async ({ filePath }) => {
      try {
        const fullPath = path.join(resolvedDir, filePath);
        await fs.unlink(fullPath);
        log(`  🗑️  Deleted: ${filePath}`, 'yellow');
        return { success: true, filePath };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    },
  }),

  runCommand: tool({
    description: 'Run a shell command in the project directory',
    inputSchema: z.object({
      command: z.string().describe('The shell command to run'),
    }),
    execute: async ({ command }) => {
      try {
        log(`  🔧 Running: ${command}`, 'blue');
        const { stdout, stderr } = await execAsync(command, {
          cwd: resolvedDir,
          timeout: 120000, // 2 minute timeout
        });
        const output = stdout + (stderr ? `\nSTDERR: ${stderr}` : '');
        log(`  ✓ Command completed`, 'dim');
        return { success: true, output: output.slice(0, 8000) }; // Limit output
      } catch (error: any) {
        log(`  ✗ Command failed`, 'red');
        return {
          success: false,
          error: error.message,
          stdout: error.stdout?.slice(0, 3000),
          stderr: error.stderr?.slice(0, 3000),
        };
      }
    },
  }),

  markComplete: tool({
    description: 'Mark the task as complete with a summary of what was done',
    inputSchema: z.object({
      summary: z.string().describe('Summary of what was accomplished'),
      filesModified: z.array(z.string()).describe('List of files that were modified'),
    }),
    execute: async ({ summary, filesModified }) => {
      log(`  ✅ Task marked complete`, 'green');
      return { complete: true, summary, filesModified };
    },
  }),
};

type Tools = typeof tools;

// Track completion
let taskComplete = false;
let taskSummary = '';

async function main() {
  log('╔════════════════════════════════════════════════════════════╗', 'magenta');
  log('║      Ralph Wiggum CLI Example - Autonomous Coding Agent    ║', 'magenta');
  log('╚════════════════════════════════════════════════════════════╝', 'magenta');

  // Verify directory exists
  try {
    await fs.access(resolvedDir);
  } catch {
    log(`Error: Directory does not exist: ${resolvedDir}`, 'red');
    process.exit(1);
  }

  // Get the task prompt
  const { prompt: taskPrompt, source: promptSource } = await getTaskPrompt();

  logSection('Configuration');
  log(`Target: ${resolvedDir}`, 'bright');
  log(`Prompt source: ${promptSource}`, 'dim');
  
  logSection('Task');
  // Show first 500 chars of prompt, or full if shorter
  const promptPreview = taskPrompt.length > 500 
    ? taskPrompt.slice(0, 500) + '...' 
    : taskPrompt;
  log(promptPreview, 'bright');

  const agent = new RalphLoopAgent({
    model: 'anthropic/claude-opus-4.5' as any,
    instructions: `You are an expert software engineer. Your task is to complete coding tasks autonomously.

## Guidelines:
1. First, explore the codebase to understand its structure (list files, read key files like package.json, README, etc.)
2. Plan your approach before making changes
3. Make incremental changes - modify one file at a time
4. After making changes, verify they work (run tests, type-check, lint, etc.)
5. When the task is complete and verified, use markComplete to finish

## CRITICAL - Package Versions:
Before adding ANY new dependency, you MUST check the latest version using:
  npm view <package-name> version

Then use that exact version. NEVER guess or use outdated versions.

## Best Practices:
- Always read a file before modifying it
- For SMALL CHANGES (fixing imports, renaming, type errors), use editFile instead of writeFile
- editFile is more token-efficient and prevents full file rewrites
- For LARGE FILES, use lineStart/lineEnd in readFile to read specific sections
- Run tests frequently to catch issues early
- Be thorough but efficient

Current working directory: ${resolvedDir}`,

    tools,

    // Enable context management to handle long conversations
    contextManagement: {
      maxContextTokens: 180_000,      // Claude's 200k limit minus output buffer
      enableSummarization: true,       // Summarize old iterations
      recentIterationsToKeep: 2,       // Keep last 2 iterations in full detail
      maxFileChars: MAX_FILE_CHARS,    // Truncate files larger than this
      changeLogBudget: 8_000,          // Tokens for tracking decisions
      fileContextBudget: 60_000,       // Tokens for file content
    },

    stopWhen: iterationCountIs(20),

    verifyCompletion: async ({ result }: VerifyCompletionContext<Tools>) => {
      // Check if markComplete was called
      for (const step of result.steps) {
        for (const toolResult of step.toolResults) {
          if (
            toolResult.toolName === 'markComplete' &&
            typeof toolResult.output === 'object' &&
            toolResult.output !== null &&
            'complete' in toolResult.output
          ) {
            taskComplete = true;
            taskSummary = (toolResult.output as any).summary;
          }
        }
      }

      if (taskComplete) {
        return {
          complete: true,
          reason: `Task complete: ${taskSummary}`,
        };
      }

      return {
        complete: false,
        reason: 'Continue working on the task. Use markComplete when finished and verified.',
      };
    },

    onIterationStart: ({ iteration }: { iteration: number }) => {
      logSection(`Iteration ${iteration}`);
    },

    onIterationEnd: ({ iteration, duration }: { iteration: number; duration: number }) => {
      log(`  ⏱️  Duration: ${duration}ms`, 'dim');
    },

    onContextSummarized: ({ iteration, summarizedIterations, tokensSaved }: { iteration: number; summarizedIterations: number; tokensSaved: number }) => {
      log(`  📝 Context summarized: ${summarizedIterations} iterations compressed, ${tokensSaved} tokens available`, 'yellow');
    },
  });

  logSection('Starting Task');
  log('The agent will iterate until the task is complete...', 'dim');

  const startTime = Date.now();

  try {
    const result = await agent.loop({
      prompt: taskPrompt,
    });

    const totalDuration = Date.now() - startTime;

    logSection('Result');
    log(`Status: ${result.completionReason}`, result.completionReason === 'verified' ? 'green' : 'yellow');
    log(`Iterations: ${result.iterations}`, 'blue');
    log(`Total time: ${Math.round(totalDuration / 1000)}s`, 'blue');

    if (result.reason) {
      logSection('Summary');
      log(result.reason, 'bright');
    }

    logSection('Final Notes');
    console.log(result.text);

  } catch (error) {
    logSection('Error');
    console.error(error);
    process.exit(1);
  }
}

main();
