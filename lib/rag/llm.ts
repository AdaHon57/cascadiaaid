/**
 * Answer-model abstraction. answer.ts depends only on `AnswerModel`; all OpenAI-specific answer
 * code lives in this file. To switch providers, implement `AnswerModel` and return it from
 * `createAnswerModel`.
 */
import OpenAI from "openai";
import { getRagConfig } from "./config.ts";
import { errorMessage, RagError } from "./errors.ts";
import { getOpenAIClient } from "./openai-client.ts";

export interface JsonGenerationRequest {
  system: string;
  prompt: string;
  /** Name for the JSON schema (letters, digits, underscores). */
  schemaName: string;
  /** JSON Schema the response must conform to. */
  schema: Record<string, unknown>;
}

export interface AnswerModel {
  readonly name: string;
  /** Returns the parsed JSON object produced by the model. Throws RagError on failure. */
  generateJson(request: JsonGenerationRequest): Promise<unknown>;
}

export function createAnswerModel(options: { openaiApiKey?: string } = {}): AnswerModel {
  const { answerModel, answerTemperature } = getRagConfig();
  return new OpenAIAnswerModel(answerModel, answerTemperature, options.openaiApiKey);
}

/** OpenAI Chat Completions with strict structured outputs (`response_format: json_schema`). */
class OpenAIAnswerModel implements AnswerModel {
  readonly name: string;
  private readonly model: string;
  private readonly temperature: number | undefined;
  private readonly apiKey: string | undefined;

  constructor(model: string, temperature: number | undefined, apiKey: string | undefined) {
    this.model = model;
    this.temperature = temperature;
    this.apiKey = apiKey;
    this.name = `openai/${model}`;
  }

  async generateJson({
    system,
    prompt,
    schemaName,
    schema,
  }: JsonGenerationRequest): Promise<unknown> {
    let completion: OpenAI.Chat.Completions.ChatCompletion;
    try {
      completion = await getOpenAIClient(this.apiKey).chat.completions.create({
        model: this.model,
        ...(this.temperature !== undefined ? { temperature: this.temperature } : {}),
        messages: [
          { role: "system", content: system },
          { role: "user", content: prompt },
        ],
        response_format: {
          type: "json_schema",
          json_schema: { name: schemaName, schema, strict: true },
        },
      });
    } catch (err) {
      throw toRagError(err);
    }

    const choice = completion.choices[0];
    if (!choice) throw new RagError("MODEL_ERROR", "OpenAI response contained no choices");
    if (choice.message.refusal || choice.finish_reason === "content_filter") {
      throw new RagError(
        "MODEL_REFUSED",
        `Model refused to answer: ${choice.message.refusal ?? "content filter"}`,
      );
    }
    if (choice.finish_reason === "length") {
      throw new RagError("MODEL_ERROR", "Model output was truncated (token limit reached)");
    }
    const content = choice.message.content;
    if (!content) throw new RagError("MODEL_ERROR", "OpenAI response contained no content");

    try {
      return JSON.parse(content);
    } catch (err) {
      throw new RagError("MODEL_ERROR", `Model did not return valid JSON: ${errorMessage(err)}`, {
        cause: err,
      });
    }
  }
}

function toRagError(err: unknown): RagError {
  if (err instanceof RagError) return err;
  if (err instanceof OpenAI.AuthenticationError || err instanceof OpenAI.PermissionDeniedError) {
    return new RagError("MODEL_NOT_CONFIGURED", `OpenAI credentials rejected: ${err.message}`, {
      cause: err,
    });
  }
  if (err instanceof OpenAI.RateLimitError) {
    return new RagError("MODEL_RATE_LIMITED", `OpenAI rate limit: ${err.message}`, { cause: err });
  }
  if (err instanceof OpenAI.APIConnectionError) {
    return new RagError("MODEL_ERROR", `Could not reach OpenAI: ${err.message}`, { cause: err });
  }
  if (err instanceof OpenAI.APIError) {
    return new RagError("MODEL_ERROR", `OpenAI API error ${err.status ?? ""}: ${err.message}`, {
      cause: err,
    });
  }
  return new RagError("MODEL_ERROR", `Could not call the answer model: ${errorMessage(err)}`, {
    cause: err,
  });
}
