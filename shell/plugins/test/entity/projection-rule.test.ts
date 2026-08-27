import { describe, expect, it } from "bun:test";
import { z } from "@brains/utils/zod";
import {
  ProjectionWriteIntentSchema,
  CONVERSATION_SOURCE_TYPE,
  defineProjectionRule,
  type ProjectionExecutionContext,
  type ProjectionInputContext,
} from "../../src";

const inputContext: ProjectionInputContext = {
  spaces: [],
  conversations: {
    get: async () => null,
    getMessages: async () => [],
  },
  entities: {
    getEntity: async () => null,
    listEntities: async () => [],
    getEntityTypes: () => [],
    hasEntityType: () => false,
    getEntityTypeConfig: () => ({}),
    isProjectionOwnedEntity: async () => false,
  },
  resolvePrompt: async (_reference, fallback) => fallback,
  appInfo: async () => {
    throw new Error("not used");
  },
  identityInput: () => ({}),
};

const executionContext: ProjectionExecutionContext = {
  get ai(): never {
    throw new Error("not used");
  },
  get logger(): never {
    throw new Error("not used");
  },
};

const emptyInputSchema = z.object({});

function expectDeepFrozen(value: unknown): void {
  if (value === null || typeof value !== "object") return;
  expect(Object.isFrozen(value)).toBe(true);
  for (const child of Object.values(value)) expectDeepFrozen(child);
}

describe("ProjectionRule", () => {
  it("defines a deeply frozen executable rule capability", async () => {
    const rule = defineProjectionRule({
      id: "topics",
      version: "1",
      sources: [{ kind: "entity", types: ["document"] }],
      targetType: "topic",
      targets: { authority: "additive" },
      sourceChangeBatchDelayMs: 250,
      inputSchema: z.object({
        sources: z.array(z.object({ id: z.string() })),
      }),
      selectInput: async () => ({ sources: [{ id: "doc-1" }] }),
      derive: async () => [],
    });

    expect(Object.isFrozen(rule)).toBe(true);
    expect(Object.isFrozen(rule.sources)).toBe(true);
    expect(Object.isFrozen(rule.sources[0])).toBe(true);
    expect(Object.isFrozen(rule.sources[0]?.types)).toBe(true);
    expect(rule.sourceChangeBatchDelayMs).toBe(250);
    const selectedInput = await rule.selectInput(
      { waveId: "wave-1", inputs: [] },
      inputContext,
      new AbortController().signal,
    );
    expect(selectedInput).toEqual({ sources: [{ id: "doc-1" }] });
    expectDeepFrozen(selectedInput);
    expect(rule.fingerprint(selectedInput)).toMatch(/^[a-f0-9]{64}$/);
  });

  it("defaults to immediate admission and rejects malformed rule metadata", () => {
    expect(
      defineProjectionRule({
        id: "immediate",
        version: "1",
        sources: [{ kind: "entity", types: ["document"] }],
        targetType: "topic",
        targets: { authority: "additive" },
        inputSchema: emptyInputSchema,
        selectInput: async () => ({}),
        derive: async () => [],
      }).sourceChangeBatchDelayMs,
    ).toBe(0);

    expect(() =>
      defineProjectionRule({
        id: "",
        version: "1",
        sources: [{ kind: "entity", types: ["document"] }],
        targetType: "topic",
        targets: { authority: "additive" },
        inputSchema: emptyInputSchema,
        selectInput: async () => ({}),
        derive: async () => [],
      }),
    ).toThrow();
  });

  it("rejects non-JSON selected inputs and derived intents at execution boundaries", async () => {
    const invalidInputRule = defineProjectionRule({
      id: "invalid-input",
      version: "1",
      sources: [{ kind: "entity", types: ["document"] }],
      targetType: "topic",
      targets: { authority: "additive" },
      inputSchema: z.object({ unsafe: z.number() }),
      selectInput: async () => ({ unsafe: Number.MAX_SAFE_INTEGER + 1 }),
      derive: async () => [],
    });
    void expect(
      invalidInputRule.selectInput(
        { waveId: "wave-1", inputs: [] },
        inputContext,
        new AbortController().signal,
      ),
    ).rejects.toThrow();

    const invalidOutputRule = defineProjectionRule({
      id: "invalid-output",
      version: "1",
      sources: [{ kind: "entity", types: ["document"] }],
      targetType: "topic",
      targets: { authority: "additive" },
      inputSchema: emptyInputSchema,
      selectInput: async () => ({}),
      derive: async () => [
        {
          operation: "upsert",
          entity: {
            id: "topic-1",
            entityType: "topic",
            content: "content",
            metadata: { unsafe: Number.MAX_SAFE_INTEGER + 1 },
            visibility: "public",
          },
        },
      ],
    });
    void expect(
      invalidOutputRule.derive(
        {},
        executionContext,
        new AbortController().signal,
      ),
    ).rejects.toThrow();
  });

  it("rejects write intents outside the declared target type", async () => {
    const rule = defineProjectionRule({
      id: "topics",
      version: "1",
      sources: [{ kind: "entity", types: ["document"] }],
      targetType: "topic",
      targets: { authority: "additive" },
      inputSchema: emptyInputSchema,
      selectInput: async () => ({}),
      derive: async () => [
        {
          operation: "delete",
          entityType: "skill",
          id: "skill-1",
        },
      ],
    });

    void expect(
      rule.derive({}, executionContext, new AbortController().signal),
    ).rejects.toThrow('cannot write entity type "skill"');
  });

  it("reserves explicit deletes for managed rules", async () => {
    const additive = defineProjectionRule({
      id: "additive-topics",
      version: "1",
      sources: [{ kind: "entity", types: ["document"] }],
      targetType: "topic",
      targets: { authority: "additive" },
      inputSchema: emptyInputSchema,
      selectInput: async () => ({}),
      derive: async () => [
        { operation: "delete" as const, entityType: "topic", id: "topic-1" },
      ],
    });
    const managed = defineProjectionRule({
      id: "managed-topics",
      version: "1",
      sources: [{ kind: "entity", types: ["document"] }],
      targetType: "topic",
      targets: { authority: "managed" },
      inputSchema: emptyInputSchema,
      selectInput: async () => ({}),
      derive: async () => [
        { operation: "delete" as const, entityType: "topic", id: "topic-1" },
      ],
    });

    void expect(
      additive.derive({}, executionContext, new AbortController().signal),
    ).rejects.toThrow("cannot delete targets");
    expect(
      await managed.derive({}, executionContext, new AbortController().signal),
    ).toEqual([{ operation: "delete", entityType: "topic", id: "topic-1" }]);
  });

  it("accepts canonical upsert and delete intents", () => {
    expect(
      ProjectionWriteIntentSchema.parse({
        operation: "upsert",
        entity: {
          id: "topic-1",
          entityType: "topic",
          content: "---\ntitle: Topic\n---",
          metadata: { title: "Topic", score: 0.9 },
          visibility: "public",
        },
      }),
    ).toEqual({
      operation: "upsert",
      entity: {
        id: "topic-1",
        entityType: "topic",
        content: "---\ntitle: Topic\n---",
        metadata: { title: "Topic", score: 0.9 },
        visibility: "public",
      },
    });

    expect(
      ProjectionWriteIntentSchema.parse({
        operation: "delete",
        entityType: "topic",
        id: "topic-1",
      }),
    ).toEqual({
      operation: "delete",
      entityType: "topic",
      id: "topic-1",
    });
  });

  it("rejects non-JSON memo output and unstable entity identifiers", () => {
    expect(() =>
      ProjectionWriteIntentSchema.parse({
        operation: "upsert",
        entity: {
          id: "",
          entityType: "topic",
          content: "content",
          metadata: { callback: () => undefined },
          visibility: "public",
        },
      }),
    ).toThrow();

    expect(() =>
      ProjectionWriteIntentSchema.parse({
        operation: "upsert",
        entity: {
          id: "topic-1",
          entityType: "topic",
          content: "content",
          metadata: { unsafe: Number.MAX_SAFE_INTEGER + 1 },
          visibility: "public",
        },
      }),
    ).toThrow();
  });
});

/**
 * Conversations as evidence.
 *
 * A summary is derived from what was said, not from an entity — so the rule
 * that derives it has no entity source to declare. Conversations live in
 * their own database, so unlike an entity they cannot mark themselves dirty
 * inside the write that changed them; the runtime polls them instead. What a
 * rule declares is the same either way: this is what I derive from.
 */
describe("a rule that derives from conversations", () => {
  const rule = defineProjectionRule({
    id: "summary-derivation",
    version: "1",
    sources: [{ kind: "conversation" }],
    targetType: "summary",
    targets: { authority: "exclusive", visibility: "shared" },
    inputSchema: z.object({}),
    selectInput: async () => ({}),
    derive: async () => [],
  });

  it("declares the conversation source it was given", () => {
    expect(rule.sources).toEqual([
      { kind: "conversation", types: [CONVERSATION_SOURCE_TYPE] },
    ]);
  });

  it("carries the source type the runtime marks dirty", () => {
    // The normalized `types` is what every downstream consumer matches
    // against, so a conversation source has to name itself in the same
    // vocabulary an entity source does.
    expect(CONVERSATION_SOURCE_TYPE).toBe("conversation");
  });
});
