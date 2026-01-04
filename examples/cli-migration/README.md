# CLI Migration Example

A code migration agent using RalphLoopAgent that can transform codebases automatically.

## What This Demonstrates

- Using `RalphLoopAgent` with filesystem tools
- Running shell commands from an agent
- Verification-based completion (migration marked complete)
- Real-world code transformation workflow

## Setup

```bash
# Install dependencies
pnpm install

# Set your API key
export ANTHROPIC_API_KEY=your_api_key_here
```

## Usage

```bash
# Migrate a codebase
pnpm start ~/Developer/classnames "Migrate from Node test to Vitest"

# Or directly with tsx
npx tsx index.ts /path/to/repo "Your migration task"
```

## Example: Node Test → Vitest Migration

```bash
# Clone a test repo
git clone --depth 1 https://github.com/JedWatson/classnames.git ~/Developer/classnames

# Run the migration
pnpm start ~/Developer/classnames "Migrate from Node native test runner to Vitest"
```

The agent will:
1. Explore the codebase structure
2. Read existing test files
3. Add vitest as a dependency
4. Create vitest.config.ts
5. Transform test files to use vitest syntax
6. Update package.json scripts
7. Run npm install
8. Verify tests pass

## Available Tools

| Tool | Description |
|------|-------------|
| `listFiles` | List files matching a glob pattern |
| `readFile` | Read file contents |
| `writeFile` | Write/create files |
| `deleteFile` | Delete files |
| `runCommand` | Execute shell commands |
| `markComplete` | Signal migration completion |

## Example Output

```
╔════════════════════════════════════════════════════════════╗
║         Ralph Wiggum Agent - Code Migration                ║
╚════════════════════════════════════════════════════════════╝

━━━ Configuration ━━━
Target: /Users/you/Developer/classnames
Task: Migrate from Node native test runner to Vitest

━━━ Starting Migration ━━━
The agent will iterate until the migration is complete...

━━━ Iteration 1 ━━━
  📖 Read: package.json (1847 chars)
  📂 Found 3 files matching "tests/**/*.js"
  📖 Read: tests/index.js (3421 chars)
  ⏱️  Duration: 4521ms

━━━ Iteration 2 ━━━
  ✏️  Wrote: vitest.config.ts
  ✏️  Wrote: package.json
  🔧 Running: npm install
  ✓ Command completed
  ⏱️  Duration: 12043ms

━━━ Iteration 3 ━━━
  ✏️  Wrote: tests/index.js
  ✏️  Wrote: tests/bind.js
  ✏️  Wrote: tests/dedupe.js
  🔧 Running: npm test
  ✓ Command completed
  ✅ Migration marked complete
  ⏱️  Duration: 8234ms

━━━ Migration Result ━━━
Status: verified
Iterations: 3
Total time: 25s

━━━ Summary ━━━
Migration complete: Successfully migrated from Node test to Vitest...
```

## Notes

- The agent has a 15 iteration limit to prevent runaway costs
- Shell commands have a 60 second timeout
- File output is truncated to prevent token overflow

