import { describe, expect, it } from "bun:test";
import { z } from "@brains/utils/zod";
import {
  ProjectionWriteIntentSchema,
  defineProjectionRule,
  type ProjectionExecutionContext,
  type ProjectionInputContext,
} from "../../src";

const inputContext: ProjectionInputContext = {
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
