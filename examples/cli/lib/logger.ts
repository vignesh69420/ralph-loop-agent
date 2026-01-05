/**
 * Logger utilities with ANSI colors
 */

import type { LanguageModelUsage } from 'ai';
import { getModelPricing, calculateCost } from 'ralph-loop-agent';

export const colors = {
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

export type Color = keyof typeof colors;

export function log(message: string, color: Color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

export function logSection(title: string) {
  console.log();
  log(`━━━ ${title} ━━━`, 'cyan');
}

/**
 * Format a number with thousands separators.
 */
function formatNumber(n: number): string {
  return n.toLocaleString();
}

/**
 * Format a cost in USD.
 */
function formatCost(cost: number): string {
  return `$${cost.toFixed(4)}`;
}

/**
 * Log a usage report showing tokens and estimated cost.
 */
export function logUsageReport(
  usage: LanguageModelUsage,
  model: string,
  label = 'Usage'
) {
  const inputTokens = usage.inputTokens ?? 0;
  const outputTokens = usage.outputTokens ?? 0;
  const totalTokens = usage.totalTokens ?? (inputTokens + outputTokens);
  
  const pricing = getModelPricing(model);
  
  log(`  ┌─ ${label} ─────────────────────────────`, 'dim');
  log(`  │  Input tokens:  ${formatNumber(inputTokens)}`, 'dim');
  log(`  │  Output tokens: ${formatNumber(outputTokens)}`, 'dim');
  log(`  │  Total tokens:  ${formatNumber(totalTokens)}`, 'dim');
  
  if (pricing) {
    const cost = calculateCost(usage, pricing);
    log(`  │  Est. cost:     ${formatCost(cost)}`, 'yellow');
  } else {
    log(`  │  Est. cost:     (unknown pricing for ${model})`, 'dim');
  }
  
  log(`  └────────────────────────────────────────`, 'dim');
}

