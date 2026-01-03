import type { LanguageModel, GenerateTextResult, ToolSet } from 'ai';

/**
 * Context passed to the evaluator for determining task completion.
 */
export interface RalphEvaluatorContext<TOOLS extends ToolSet = {}> {
  /**
   * The original task/prompt provided to the agent.
   */
  readonly originalPrompt: string;

  /**
   * The result of the current iteration.
   */
  readonly result: GenerateTextResult<TOOLS, never>;

  /**
   * The current iteration number (1-indexed).
   */
  readonly iteration: number;

  /**
   * All results from previous iterations.
   */
  readonly previousResults: Array<GenerateTextResult<TOOLS, never>>;
}

/**
 * Result of an evaluation.
 */
export interface RalphEvaluatorResult {
  /**
   * Whether the task is considered complete.
   */
  readonly isComplete: boolean;

  /**
   * Optional feedback to provide to the model for the next iteration.
   * Only used when isComplete is false.
   */
  readonly feedback?: string;

  /**
   * Optional reason for why the task is considered complete or not.
   * Useful for logging and debugging.
   */
  readonly reason?: string;
}

/**
 * Self-judging evaluator configuration.
 * Uses the same model to evaluate if the task is complete.
 */
export interface SelfJudgeEvaluator {
  readonly type: 'self-judge';

  /**
   * Custom prompt to ask the model if the task is complete.
   * The prompt should instruct the model to respond with a clear YES or NO.
   *
   * @default "Based on the conversation above, has the original task been fully completed? Respond with YES if the task is complete, or NO followed by what still needs to be done."
   */
  readonly prompt?: string;
}

/**
 * Separate judge model evaluator configuration.
 * Uses a different (potentially cheaper) model to evaluate task completion.
 */
export interface JudgeModelEvaluator {
  readonly type: 'judge-model';

  /**
   * The model to use for evaluation.
   */
  readonly model: LanguageModel;

  /**
   * Custom prompt to ask the judge model if the task is complete.
   *
   * @default "Based on the conversation above, has the original task been fully completed? Respond with YES if the task is complete, or NO followed by what still needs to be done."
   */
  readonly prompt?: string;
}

/**
 * Callback-based evaluator configuration.
 * Allows custom logic for determining task completion.
 */
export interface CallbackEvaluator<TOOLS extends ToolSet = {}> {
  readonly type: 'callback';

  /**
   * Custom function to evaluate if the task is complete.
   *
   * @param context - The evaluation context containing results and iteration info.
   * @returns Boolean indicating completion, or a full RalphEvaluatorResult for more control.
   */
  readonly fn: (
    context: RalphEvaluatorContext<TOOLS>,
  ) => boolean | RalphEvaluatorResult | Promise<boolean | RalphEvaluatorResult>;
}

/**
 * Union type for all evaluator configurations.
 */
export type RalphEvaluator<TOOLS extends ToolSet = {}> =
  | SelfJudgeEvaluator
  | JudgeModelEvaluator
  | CallbackEvaluator<TOOLS>;

/**
 * Default prompt for self-judge and judge-model evaluators.
 */
export const DEFAULT_EVALUATION_PROMPT =
  'Based on the conversation above, has the original task been fully completed? ' +
  'Respond with YES if the task is complete, or NO followed by what still needs to be done.';
