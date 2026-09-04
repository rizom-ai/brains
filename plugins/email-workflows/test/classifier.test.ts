import { describe, expect, it, mock } from "bun:test";
import type { InboundEmail } from "@brains/contracts";
import type { IEntityAINamespace } from "@brains/plugins";
import { genericSpy } from "@brains/test-utils";
import { createMailClassifier } from "../src/lib/classifier";

type GenerateObject = Pick<IEntityAINamespace, "generateObject">;
type AIGenerationSchema<T> = Parameters<
  IEntityAINamespace["generateObject"]
>[1] & { parse(input: unknown): T };

/**
 * Records the arguments the classifier sends and answers with `object`,
 * parsed through the caller's own schema so the fixture has to match what
 * the classifier actually asked for.
 */
function aiReturning(object: unknown): GenerateObject & {
  calls: Array<[string, AIGenerationSchema<unknown>]>;
} {
  const calls: Array<[string, AIGenerationSchema<unknown>]> = [];
  const generateObject = genericSpy<GenerateObject["generateObject"]>(
    mock(async (prompt: string, schema: AIGenerationSchema<unknown>) => {
      calls.push([prompt, schema]);
      return { object: schema.parse(object) };
    }),
  );
  return { generateObject, calls };
}

const email: InboundEmail = {
  messageId: "message-1",
  sourceRef: "imap:message-1",
  from: { name: "Sam", address: "sam@example.com" },
  to: [{ name: "Smoke", address: "smoke@rizom.ai" }],
  subject: "Quick question about the demo",
  receivedAt: "2026-08-09T15:00:00.000Z",
  text: "Can we meet Tuesday to walk through the inbox demo?",
  headers: {},
};

describe("mail classifier wire schema", () => {
  // OpenAI's strict structured outputs reject root-level unions ("'oneOf' is
  // not permitted"), so the AI-facing schema is a flat object mapped onto the
  // domain decision union afterward.
  it("maps a retained wire decision onto the domain union", async () => {
    const ai = aiReturning({
      decision: "retain",
      retained: {
        title: "Meeting request about the inbox demo",
        category: "work",
        priority: "normal",
        needsReply: true,
        organization: null,
        requestedActions: ["Confirm Tuesday meeting"],
        summary: "A contact proposes meeting Tuesday to review the demo.",
      },
    });

    const classify = createMailClassifier(ai, "");
    const decision = await classify(email);

    expect(decision).toEqual({
      decision: "retain",
      title: "Meeting request about the inbox demo",
      category: "work",
      priority: "normal",
      needsReply: true,
      requestedActions: ["Confirm Tuesday meeting"],
      summary: "A contact proposes meeting Tuesday to review the demo.",
    });
    const schema = ai.calls[0]?.[1];
    if (!schema) throw new Error("classifier did not call generateObject");
    // The schema handed to the AI accepts the flat wire shape directly.
    expect(() =>
      schema.parse({ decision: "discard", retained: null }),
    ).not.toThrow();
  });

  it("maps a discard wire decision onto the domain union", async () => {
    const classify = createMailClassifier(
      aiReturning({ decision: "discard", retained: null }),
      "",
    );

    expect(await classify(email)).toEqual({
      decision: "discard",
      reason: "spam",
    });
  });

  it("rejects a retain decision without retained fields", async () => {
    const classify = createMailClassifier(
      aiReturning({ decision: "retain", retained: null }),
      "",
    );

    expect(classify(email)).rejects.toThrow();
  });
});
