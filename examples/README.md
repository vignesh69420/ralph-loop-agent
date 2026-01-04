# Examples

This directory contains example projects demonstrating how to use `ralph-wiggum`.

## Examples

| Example | Description |
|---------|-------------|
| [cli](./cli) | General-purpose autonomous coding agent for migrations, upgrades, refactoring, etc. |

## Running the CLI Example

```bash
cd examples/cli
pnpm install
pnpm start -- /path/to/your/project
```

Or with a specific prompt:

```bash
pnpm start -- /path/to/project "Migrate from Jest to Vitest"
```

Or create a `PROMPT.md` file in your target project and run:

```bash
pnpm start -- /path/to/project
```

## Environment Variables

The CLI requires an API key (uses AI Gateway):

```bash
export ANTHROPIC_API_KEY=your_key_here
```
