# Agent Instructions

## Package Management

**Always check the latest version before installing a package.**

Before adding or updating any dependency, verify the current latest version on npm:

```bash
npm view <package-name> version
```

Or check multiple packages at once:

```bash
npm view ai version
npm view @ai-sdk/provider-utils version
npm view zod version
```

This ensures we don't install outdated versions that may have incompatible types or missing features.

## AI Gateway

**Use AI Gateway string format for models, not provider packages.**

Do NOT install or import from provider-specific packages like `@ai-sdk/openai`, `@ai-sdk/anthropic`, etc.

Instead, use the AI Gateway string format: `{provider}/{model}`

```typescript
// CORRECT - Use AI Gateway strings
import { streamText } from 'ai';

const result = streamText({
  model: 'anthropic/claude-opus-4.5',
  prompt: 'Why is the sky blue?',
});

// INCORRECT - Don't use provider packages
import { anthropic } from '@ai-sdk/anthropic';  // DON'T DO THIS

const result = streamText({
  model: anthropic('claude-opus-4.5'),  // DON'T DO THIS
  prompt: 'Why is the sky blue?',
});
```

**Default model:** When examples need a model, default to `anthropic/claude-opus-4.5`.

Note: `@ai-sdk/provider-utils` is fine to use for types like `ModelMessage`, `SystemModelMessage`, etc.
