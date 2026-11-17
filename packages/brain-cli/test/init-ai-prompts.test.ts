import { describe, expect, it } from "bun:test";
import { keyEnvVar, type KeyProviderId } from "@brains/ai-service";
import {
  promptAIProviders,
  type SetupQuestions,
} from "../src/lib/init-prompts";

/** Setup questions answered from a script, recording what was asked. */
function scripted(answers: {
  confirm?: boolean[];
  select?: KeyProviderId[];
  model?: string[];
  keys?: Partial<Record<KeyProviderId, string>>;
}): { questions: SetupQuestions; asked: string[] } {
  const asked: string[] = [];
  const next = <T>(queue: T[] | undefined, question: string): T => {
    const answer = queue?.shift();
    if (answer === undefined)
      throw new Error(`Unexpected question: ${question}`);
    return answer;
  };
  return {
    asked,
    questions: {
      confirm: async (message): Promise<boolean> => {
        asked.push(`confirm: ${message}`);
        return next(answers.confirm, message);
      },
      select: async (message): Promise<KeyProviderId> => {
        asked.push(`select: ${message}`);
        return next(answers.select, message);
      },
      model: async (message): Promise<string> => {
        asked.push(`model: ${message}`);
        return next(answers.model, message);
      },
      key: async (provider): Promise<string> => {
        asked.push(`key: ${provider}`);
        const key = answers.keys?.[provider];
        if (key === undefined) throw new Error(`Unexpected key: ${provider}`);
        return key;
      },
      note: (): void => {},
      warn: (): void => {},
    },
  };
}

describe("the AI questions brain init asks", () => {
  it("keeps a chat model named on the command line and asks only for the keys it needs", async () => {
    const { questions, asked } = scripted({
      select: ["openai"],
      keys: { anthropic: "sk-ant-chat", openai: "sk-embed" },
    });

    const answers = await promptAIProviders(
      { model: "claude-sonnet-5" },
      questions,
    );

    expect(asked).toEqual([
      "select: Image provider",
      "key: anthropic",
      "key: openai",
    ]);
    expect(answers).toEqual({
      model: "claude-sonnet-5",
      apiKeys: {
        [keyEnvVar("anthropic")]: "sk-ant-chat",
        [keyEnvVar("openai")]: "sk-embed",
      },
    });
  });

  it("asks no provider question when both models are named", async () => {
    const { questions, asked } = scripted({
      keys: { anthropic: "sk-ant-chat", openai: "sk-embed", google: "g-key" },
    });

    const answers = await promptAIProviders(
      { model: "claude-sonnet-5", imageModel: "gemini-3-pro-image-preview" },
      questions,
    );

    expect(asked).toEqual(["key: anthropic", "key: openai", "key: google"]);
    expect(answers.model).toBe("claude-sonnet-5");
    expect(answers.imageModel).toBe("gemini-3-pro-image-preview");
  });

  it("asks no key for a model the model runtime serves", async () => {
    const { questions, asked } = scripted({
      select: ["openai"],
      keys: { openai: "sk-embed" },
    });

    const answers = await promptAIProviders(
      { model: "local:qwen3:4b" },
      questions,
    );

    expect(asked).toEqual(["select: Image provider", "key: openai"]);
    expect(answers.apiKeys).toEqual({ [keyEnvVar("openai")]: "sk-embed" });
  });

  it("offers one provider for everything when no model is named", async () => {
    const { questions, asked } = scripted({
      confirm: [true],
      keys: { openai: "sk-all" },
    });

    const answers = await promptAIProviders({}, questions);

    expect(asked).toEqual([
      "confirm: Use OpenAI for chat, embeddings and images (one API key)?",
      "key: openai",
    ]);
    expect(answers).toEqual({ apiKeys: { [keyEnvVar("openai")]: "sk-all" } });
  });
});
