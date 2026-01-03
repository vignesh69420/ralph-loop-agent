import type {
  LanguageModel,
  ToolSet,
  GenerateTextResult,
  ToolChoice,
  StopCondition,
  PrepareStepFunction,
  ToolCallRepairFunction,
  TelemetrySettings,
  CallSettings,
} from 'ai';
import type { ProviderOptions, SystemModelMessage } from '@ai-sdk/provider-utils';
import type { RalphEvaluator } from './ralph-loop-agent-evaluator';

/**
 * Callback invoked after each Ralph iteration completes.
 */
export type RalphLoopAgentOnIterationFinishCallback<TOOLS extends ToolSet = {}> = (event: {
  /**
   * The iteration number (1-indexed).
   */
  readonly iteration: number;

  /**
   * The result of this iteration.
   */
  readonly result: GenerateTextResult<TOOLS, never>;

  /**
   * Whether this iteration was determined to be complete.
   */
  readonly isComplete: boolean;

  /**
   * Feedback from the evaluator (if any).
   */
  readonly feedback?: string;

  /**
   * Reason from the evaluator (if any).
   */
  readonly reason?: string;
}) => void | Promise<void>;

/**
 * Callback invoked when all iterations are finished.
 */
export type RalphLoopAgentOnFinishCallback<TOOLS extends ToolSet = {}> = (event: {
  /**
   * The total number of iterations that were executed.
   */
  readonly totalIterations: number;

  /**
   * The final result.
   */
  readonly result: GenerateTextResult<TOOLS, never>;

  /**
   * Whether the task was completed successfully or stopped due to max iterations.
   */
  readonly completedSuccessfully: boolean;

  /**
   * All results from each iteration.
   */
  readonly allResults: Array<GenerateTextResult<TOOLS, never>>;
}) => void | Promise<void>;

/**
 * Configuration options for RalphLoopAgent.
 */
export type RalphLoopAgentSettings<TOOLS extends ToolSet = {}> = Omit<
  CallSettings,
  'abortSignal'
> & {
  /**
   * The id of the agent.
   */
  id?: string;

  /**
   * The instructions for the agent.
   * Can be a string, or a SystemModelMessage for provider-specific options.
   */
  instructions?: string | SystemModelMessage | Array<SystemModelMessage>;

  /**
   * The language model to use.
   */
  model: LanguageModel;

  /**
   * The tools that the model can call.
   */
  tools?: TOOLS;

  /**
   * The tool choice strategy. Default: 'auto'.
   */
  toolChoice?: ToolChoice<NoInfer<TOOLS>>;

  /**
   * Condition for stopping the inner tool loop.
   * @default stepCountIs(20)
   */
  stopWhen?: StopCondition<NoInfer<TOOLS>> | Array<StopCondition<NoInfer<TOOLS>>>;

  /**
   * The evaluator to determine when the task is complete.
   * This controls the outer Ralph loop.
   */
  evaluator: RalphEvaluator<NoInfer<TOOLS>>;

  /**
   * Maximum number of Ralph iterations (outer loop).
   * @default 10
   */
  maxIterations?: number;

  /**
   * Optional telemetry configuration.
   */
  experimental_telemetry?: TelemetrySettings;

  /**
   * Limits the tools that are available for the model to call.
   */
  activeTools?: Array<keyof NoInfer<TOOLS>>;

  /**
   * Optional function to provide different settings for each step.
   */
  prepareStep?: PrepareStepFunction<NoInfer<TOOLS>>;

  /**
   * A function that attempts to repair a tool call that failed to parse.
   */
  experimental_repairToolCall?: ToolCallRepairFunction<NoInfer<TOOLS>>;

  /**
   * Callback invoked after each Ralph iteration.
   */
  onIterationFinish?: RalphLoopAgentOnIterationFinishCallback<NoInfer<TOOLS>>;

  /**
   * Callback invoked when all iterations are complete.
   */
  onFinish?: RalphLoopAgentOnFinishCallback<NoInfer<TOOLS>>;

  /**
   * Additional provider-specific options.
   */
  providerOptions?: ProviderOptions;

  /**
   * Context passed into tool calls.
   */
  experimental_context?: unknown;
};
