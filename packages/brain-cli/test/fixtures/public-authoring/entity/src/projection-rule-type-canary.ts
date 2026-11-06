import {
  ProjectionJsonObjectSchema,
  defineEntity,
  defineProjectionRule,
  z,
  type ProjectionJsonObject,
  type ProjectionRule,
  type ProjectionRuleDefinition,
  type ProjectionWriteIntent,
} from "@rizom/brain/entities";

// Compile-only: checked by the fixture typecheck, never loaded by the brain.
const shelfInput = z.object({
  saved: z.number(),
  latest: z.array(z.string()),
  identity: ProjectionJsonObjectSchema,
});

function shelfWrite(
  input: z.output<typeof shelfInput>,
  summary: string,
): ProjectionWriteIntent<ProjectionJsonObject> {
  return {
    operation: "upsert",
    entity: {
      id: "shelf",
      entityType: "reading-shelf",
      content: summary,
      metadata: { saved: input.saved, latest: input.latest },
      visibility: "public",
    },
  };
}

function shelfRule(template: string): ProjectionRule {
  const definition: ProjectionRuleDefinition<z.output<typeof shelfInput>> = {
    id: "reading-shelf",
    version: "1",
    sources: [{ kind: "entity", types: ["bookmark", "reading-digest"] }],
    targetType: "reading-shelf",
    sourceChangeBatchDelayMs: 5_000,
    inputSchema: shelfInput,
    selectInput: async (trigger, context) => {
      const saved = await context.entities.listEntities({
        entityType: "bookmark",
        options: { limit: 5 },
      });
      return {
        saved: trigger.inputs.length + saved.length,
        latest: saved.map(({ id }) => id),
        identity: context.identityInput(),
      };
    },
    derive: async (input, context, signal) => {
      const { body } = await context.ai.generate(
        {
          prompt: `Saved pages: ${input.latest.join(", ")}`,
          templateName: template,
          representedIdentity: "brain",
        },
        z.object({ body: z.string() }),
        signal,
      );
      context.logger.debug("Derived the reading shelf");
      return [shelfWrite(input, body)];
    },
  };
  return defineProjectionRule(definition);
}

export const readingShelf = defineEntity({
  type: "reading-shelf",
  purpose: "What the reader has been saving lately, in one place.",
  metadata: z.object({ saved: z.number(), latest: z.array(z.string()) }),
  templates: {
    shelf: {
      name: "shelf",
      description: "Summarizes the reading shelf",
      schema: z.object({ body: z.string() }),
      basePrompt: "Summarize what the reader saved.",
      requiredPermission: "public",
    },
  },
  projectionRules: ({ template }) => [shelfRule(template("shelf"))],
});

export const invalidRuleInput = defineProjectionRule({
  id: "invalid-input",
  version: "1",
  sources: [{ kind: "entity", types: ["bookmark"] }],
  targetType: "reading-shelf",
  // @ts-expect-error A rule's input is JSON, so it is fingerprinted as it is.
  inputSchema: z.object({ at: z.date() }),
  selectInput: async () => {
    throw new Error("unused");
  },
  derive: async () => [],
});

export const invalidRuleWrite = defineProjectionRule({
  id: "invalid-write",
  version: "1",
  sources: [{ kind: "entity", types: ["bookmark"] }],
  targetType: "reading-shelf",
  inputSchema: z.object({}),
  selectInput: async () => ({}),
  // @ts-expect-error A write intent upserts or deletes.
  derive: async () => [{ operation: "replace", id: "shelf" }],
});
