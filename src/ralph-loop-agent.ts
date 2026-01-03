import {
  generateText,
  streamText,
  stepCountIs,
  type GenerateTextResult,
  type StreamTextResult,
  type ToolSet,
  type LanguageModel,
} from 'ai';
import type { ModelMessage } from '@ai-sdk/provider-utils';
import type { RalphLoopAgentSettings } from './ralph-loop-agent-settings';
import {
  DEFAULT_EVALUATION_PROMPT,
  type RalphEvaluatorContext,
  type RalphEvaluatorResult,
} from './ralph-loop-agent-evaluator';

/**
 * Parameters for calling a RalphLoopAgent.
 */
export type RalphLoopAgentCallParameters = {
  /**
   * The prompt/task to complete.
   */
  prompt: string;

  /**
   * Abort signal for cancellation.
   */
  abortSignal?: AbortSignal;
};

/**
 * Result of a RalphLoopAgent execution.
 */
export interface RalphLoopAgentResult<TOOLS extends ToolSet = {}> {
  /**
   * The final result from the last iteration.
   */
  readonly result: GenerateTextResult<TOOLS, never>;

  /**
   * The total number of iterations that were executed.
   */
  readonly totalIterations: number;

  /**
   * Whether the task was completed successfully or stopped due to max iterations.
   */
  readonly completedSuccessfully: boolean;

  /**
   * All results from each iteration.
   */
  readonly allResults: Array<GenerateTextResult<TOOLS, never>>;
}

/**
 * A Ralph Loop Agent implements the "Ralph Wiggum" technique - an iterative
 * approach that continuously runs until a task is completed.
 *
 * The agent has two nested loops:
 * 1. **Outer loop (Ralph loop)**: Runs iterations until the task is evaluated as complete
 * 2. **Inner loop (Tool loop)**: Executes tools and LLM calls within each iteration
 *
 * The agent supports three evaluation strategies:
 * - **self-judge**: Uses the same model to evaluate completion
 * - **judge-model**: Uses a separate model to evaluate completion
 * - **callback**: Uses a custom function to evaluate completion
 */
export class RalphLoopAgent<TOOLS extends ToolSet = {}> {
  readonly version = 'ralph-agent-v1';

  private readonly settings: RalphLoopAgentSettings<TOOLS>;

  constructor(settings: RalphLoopAgentSettings<TOOLS>) {
    this.settings = settings;
  }

  /**
   * The id of the agent.
   */
  get id(): string | undefined {
    return this.settings.id;
  }

  /**
   * The tools that the agent can use.
   */
  get tools(): TOOLS {
    return this.settings.tools as TOOLS;
  }

  /**
   * The maximum number of Ralph iterations.
   */
  get maxIterations(): number {
    return this.settings.maxIterations ?? 10;
  }

  /**
   * Generates output from the agent using the Ralph loop technique.
   * Runs iteratively until the task is complete or max iterations reached.
   */
  async generate({
    prompt,
    abortSignal,
  }: RalphLoopAgentCallParameters): Promise<RalphLoopAgentResult<TOOLS>> {
    const allResults: Array<GenerateTextResult<TOOLS, never>> = [];
    let currentMessages: Array<ModelMessage> = [];
    let iteration = 0;
    let completedSuccessfully = false;

    // Build the initial user message
    const initialUserMessage: ModelMessage = {
      role: 'user',
      content: [{ type: 'text', text: prompt }],
    };

    // Add instructions as system message if provided
    const systemMessages = this.buildSystemMessages();

    while (iteration < this.maxIterations) {
      iteration++;

      // Build messages for this iteration
      const messages: Array<ModelMessage> = [
        ...systemMessages,
        initialUserMessage,
        ...currentMessages,
      ];

      // If not the first iteration, add continuation prompt
      if (iteration > 1) {
        messages.push({
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Continue working on the task. The previous attempt was not complete.',
            },
          ],
        });
      }

      // Run the inner tool loop
      const result = (await generateText({
        model: this.settings.model,
        messages,
        tools: this.settings.tools,
        toolChoice: this.settings.toolChoice,
        stopWhen: this.settings.stopWhen ?? stepCountIs(20),
        maxOutputTokens: this.settings.maxOutputTokens,
        temperature: this.settings.temperature,
        topP: this.settings.topP,
        topK: this.settings.topK,
        presencePenalty: this.settings.presencePenalty,
        frequencyPenalty: this.settings.frequencyPenalty,
        stopSequences: this.settings.stopSequences,
        seed: this.settings.seed,
        experimental_telemetry: this.settings.experimental_telemetry,
        activeTools: this.settings.activeTools,
        prepareStep: this.settings.prepareStep,
        experimental_repairToolCall: this.settings.experimental_repairToolCall,
        providerOptions: this.settings.providerOptions,
        experimental_context: this.settings.experimental_context,
        abortSignal,
      })) as GenerateTextResult<TOOLS, never>;

      allResults.push(result);

      // Add the response messages to conversation history
      currentMessages = [...currentMessages, ...result.response.messages];

      // Evaluate if the task is complete
      const evaluatorContext: RalphEvaluatorContext<TOOLS> = {
        originalPrompt: prompt,
        result,
        iteration,
        previousResults: allResults.slice(0, -1),
      };

      const evaluatorResult = await this.evaluate(evaluatorContext);

      // Call onIterationFinish callback
      await this.settings.onIterationFinish?.({
        iteration,
        result,
        isComplete: evaluatorResult.isComplete,
        feedback: evaluatorResult.feedback,
        reason: evaluatorResult.reason,
      });

      if (evaluatorResult.isComplete) {
        completedSuccessfully = true;
        break;
      }

      // If not complete and there's feedback, add it to the conversation
      if (evaluatorResult.feedback) {
        currentMessages.push({
          role: 'user',
          content: [{ type: 'text', text: evaluatorResult.feedback }],
        });
      }
    }

    const finalResult = allResults[allResults.length - 1]!;

    // Call onFinish callback
    await this.settings.onFinish?.({
      totalIterations: iteration,
      result: finalResult,
      completedSuccessfully,
      allResults,
    });

    return {
      result: finalResult,
      totalIterations: iteration,
      completedSuccessfully,
      allResults,
    };
  }

  /**
   * Streams output from the agent. Note: This only streams the final iteration.
   * For full streaming support across iterations, use generate() with callbacks.
   */
  async stream({
    prompt,
    abortSignal,
  }: RalphLoopAgentCallParameters): Promise<StreamTextResult<TOOLS, never>> {
    // For streaming, we run non-streaming iterations until the last one
    // then stream the final iteration
    const allResults: Array<GenerateTextResult<TOOLS, never>> = [];
    let currentMessages: Array<ModelMessage> = [];
    let iteration = 0;

    const initialUserMessage: ModelMessage = {
      role: 'user',
      content: [{ type: 'text', text: prompt }],
    };

    const systemMessages = this.buildSystemMessages();

    // Run iterations until we're at the last one or complete
    while (iteration < this.maxIterations - 1) {
      iteration++;

      const messages: Array<ModelMessage> = [
        ...systemMessages,
        initialUserMessage,
        ...currentMessages,
      ];

      if (iteration > 1) {
        messages.push({
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Continue working on the task. The previous attempt was not complete.',
            },
          ],
        });
      }

      const result = (await generateText({
        model: this.settings.model,
        messages,
        tools: this.settings.tools,
        toolChoice: this.settings.toolChoice,
        stopWhen: this.settings.stopWhen ?? stepCountIs(20),
        maxOutputTokens: this.settings.maxOutputTokens,
        temperature: this.settings.temperature,
        topP: this.settings.topP,
        topK: this.settings.topK,
        presencePenalty: this.settings.presencePenalty,
        frequencyPenalty: this.settings.frequencyPenalty,
        stopSequences: this.settings.stopSequences,
        seed: this.settings.seed,
        experimental_telemetry: this.settings.experimental_telemetry,
        activeTools: this.settings.activeTools,
        prepareStep: this.settings.prepareStep,
        experimental_repairToolCall: this.settings.experimental_repairToolCall,
        providerOptions: this.settings.providerOptions,
        experimental_context: this.settings.experimental_context,
        abortSignal,
      })) as GenerateTextResult<TOOLS, never>;

      allResults.push(result);

      currentMessages = [...currentMessages, ...result.response.messages];

      const evaluatorContext: RalphEvaluatorContext<TOOLS> = {
        originalPrompt: prompt,
        result,
        iteration,
        previousResults: allResults.slice(0, -1),
      };

      const evaluatorResult = await this.evaluate(evaluatorContext);

      await this.settings.onIterationFinish?.({
        iteration,
        result,
        isComplete: evaluatorResult.isComplete,
        feedback: evaluatorResult.feedback,
        reason: evaluatorResult.reason,
      });

      if (evaluatorResult.isComplete) {
        // Task is complete before final iteration - return a stream that yields the final result
        return streamText({
          model: this.settings.model,
          messages: [...systemMessages, initialUserMessage, ...currentMessages],
          tools: this.settings.tools,
          toolChoice: this.settings.toolChoice,
          stopWhen: this.settings.stopWhen ?? stepCountIs(20),
          maxOutputTokens: this.settings.maxOutputTokens,
          temperature: this.settings.temperature,
          abortSignal,
        }) as StreamTextResult<TOOLS, never>;
      }

      if (evaluatorResult.feedback) {
        currentMessages.push({
          role: 'user',
          content: [{ type: 'text', text: evaluatorResult.feedback }],
        });
      }
    }

    // Stream the final iteration
    iteration++;
    const finalMessages: Array<ModelMessage> = [
      ...systemMessages,
      initialUserMessage,
      ...currentMessages,
    ];

    if (iteration > 1) {
      finalMessages.push({
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'Continue working on the task. The previous attempt was not complete.',
          },
        ],
      });
    }

    return streamText({
      model: this.settings.model,
      messages: finalMessages,
      tools: this.settings.tools,
      toolChoice: this.settings.toolChoice,
      stopWhen: this.settings.stopWhen ?? stepCountIs(20),
      maxOutputTokens: this.settings.maxOutputTokens,
      temperature: this.settings.temperature,
      topP: this.settings.topP,
      topK: this.settings.topK,
      presencePenalty: this.settings.presencePenalty,
      frequencyPenalty: this.settings.frequencyPenalty,
      stopSequences: this.settings.stopSequences,
      seed: this.settings.seed,
      experimental_telemetry: this.settings.experimental_telemetry,
      activeTools: this.settings.activeTools,
      prepareStep: this.settings.prepareStep,
      experimental_repairToolCall: this.settings.experimental_repairToolCall,
      providerOptions: this.settings.providerOptions,
      experimental_context: this.settings.experimental_context,
      abortSignal,
    }) as StreamTextResult<TOOLS, never>;
  }

  /**
   * Build system messages from instructions.
   */
  private buildSystemMessages(): Array<ModelMessage> {
    const { instructions } = this.settings;

    if (!instructions) {
      return [];
    }

    if (typeof instructions === 'string') {
      return [{ role: 'system', content: instructions }];
    }

    if (Array.isArray(instructions)) {
      return instructions;
    }

    return [instructions];
  }

  /**
   * Evaluate if the task is complete using the configured evaluator.
   */
  private async evaluate(
    context: RalphEvaluatorContext<TOOLS>,
  ): Promise<RalphEvaluatorResult> {
    const { evaluator } = this.settings;

    switch (evaluator.type) {
      case 'self-judge':
        return this.evaluateWithSelfJudge(context, evaluator.prompt);

      case 'judge-model':
        return this.evaluateWithJudgeModel(
          context,
          evaluator.model,
          evaluator.prompt,
        );

      case 'callback':
        return this.evaluateWithCallback(context, evaluator.fn);

      default:
        // TypeScript exhaustiveness check
        const _exhaustive: never = evaluator;
        throw new Error(`Unknown evaluator type: ${_exhaustive}`);
    }
  }

  /**
   * Evaluate using the same model (self-judge).
   */
  private async evaluateWithSelfJudge(
    context: RalphEvaluatorContext<TOOLS>,
    customPrompt?: string,
  ): Promise<RalphEvaluatorResult> {
    const evaluationPrompt = customPrompt ?? DEFAULT_EVALUATION_PROMPT;

    // Build conversation history for evaluation
    const systemMessages = this.buildSystemMessages();
    const messages: Array<ModelMessage> = [
      ...systemMessages,
      {
        role: 'user',
        content: [{ type: 'text', text: context.originalPrompt }],
      },
      ...context.result.response.messages,
      {
        role: 'user',
        content: [{ type: 'text', text: evaluationPrompt }],
      },
    ];

    const evalResult = await generateText({
      model: this.settings.model,
      messages,
      maxOutputTokens: 500,
    });

    return this.parseEvaluationResponse(evalResult.text);
  }

  /**
   * Evaluate using a separate judge model.
   */
  private async evaluateWithJudgeModel(
    context: RalphEvaluatorContext<TOOLS>,
    judgeModel: LanguageModel,
    customPrompt?: string,
  ): Promise<RalphEvaluatorResult> {
    const evaluationPrompt = customPrompt ?? DEFAULT_EVALUATION_PROMPT;

    // Build a summary of the conversation for the judge
    const conversationSummary = `
Original Task: ${context.originalPrompt}

Agent's Response (Iteration ${context.iteration}):
${context.result.text}

${evaluationPrompt}
`.trim();

    const evalResult = await generateText({
      model: judgeModel,
      prompt: conversationSummary,
      maxOutputTokens: 500,
    });

    return this.parseEvaluationResponse(evalResult.text);
  }

  /**
   * Evaluate using a custom callback function.
   */
  private async evaluateWithCallback(
    context: RalphEvaluatorContext<TOOLS>,
    fn: (
      ctx: RalphEvaluatorContext<TOOLS>,
    ) => boolean | RalphEvaluatorResult | Promise<boolean | RalphEvaluatorResult>,
  ): Promise<RalphEvaluatorResult> {
    const result = await fn(context);

    if (typeof result === 'boolean') {
      return { isComplete: result };
    }

    return result;
  }

  /**
   * Parse the evaluation response from the model.
   */
  private parseEvaluationResponse(response: string): RalphEvaluatorResult {
    const normalizedResponse = response.trim().toUpperCase();

    // Check for YES at the start
    if (
      normalizedResponse.startsWith('YES') ||
      normalizedResponse.includes('TASK IS COMPLETE') ||
      normalizedResponse.includes('TASK HAS BEEN COMPLETED')
    ) {
      return {
        isComplete: true,
        reason: response,
      };
    }

    // Check for NO at the start
    if (normalizedResponse.startsWith('NO')) {
      // Extract feedback (everything after NO)
      const feedback = response.replace(/^no[,:\s]*/i, '').trim();

      return {
        isComplete: false,
        feedback: feedback || undefined,
        reason: response,
      };
    }

    // Default to not complete if unclear
    return {
      isComplete: false,
      reason: `Unclear response: ${response}`,
    };
  }
}
