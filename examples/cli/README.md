# Ralph Wiggum CLI Example

A general-purpose autonomous coding agent for long-running tasks like:

- **Code migrations** (Jest → Vitest, CJS → ESM, etc.)
- **Dependency upgrades** (React 17 → 18, TypeScript 4 → 5, etc.)
- **Large refactoring** (rename across codebase, restructure directories)
- **Feature implementation** (from specifications)
- **Bug fixes** (across multiple files)

## Usage

```bash
# Using PROMPT.md in the target directory
pnpm start -- /path/to/project

# With an inline prompt
pnpm start -- /path/to/project "Migrate from CommonJS to ESM"

# With a prompt file
pnpm start -- /path/to/project ./my-task.md
```

## Features

### Context Management
Handles long conversations automatically:
- **Auto-summarization** of older iterations when approaching token limits
- **Large file handling** with line-range reading
- **Change log** tracking decisions and progress

### Efficient Editing
- `editFile` tool for surgical search/replace (more token-efficient than full rewrites)
- `readFile` with `lineStart`/`lineEnd` for reading specific sections of large files

### Tools Available
- `listFiles` - Glob-based file listing
- `readFile` - Read files (with optional line range)
- `writeFile` - Write/create files
- `editFile` - Search/replace editing
- `deleteFile` - Delete files
- `runCommand` - Execute shell commands
- `markComplete` - Signal task completion

## Creating a PROMPT.md

Create a `PROMPT.md` in your target project:

```markdown
# Task: Migrate to ESM

Convert this project from CommonJS to ES Modules.

## Requirements
1. Update package.json: add "type": "module"
2. Rename .js files to .mjs or update imports
3. Replace require() with import
4. Replace module.exports with export
5. Run tests to verify

## Notes
- Start with package.json
- Work through files one at a time
```

## Environment

```bash
export ANTHROPIC_API_KEY=your_key_here
```
