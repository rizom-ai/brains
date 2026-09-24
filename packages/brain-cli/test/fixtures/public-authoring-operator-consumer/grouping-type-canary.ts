import { defineEntity, z } from "@rizom/brain/entities";
import {
  defineServicePlugin,
  type InterfaceCaller,
  type OperatorEntityGroupings,
  type OperatorEntityWrites,
  type ServiceGroupingDeclaration,
} from "@rizom/brain/services";

const policy = defineEntity({
  type: "fixture-policy",
  purpose: "Repairable vocabulary",
  metadata: z.object({}),
  singleton: true,
  hasBody: false,
  config: {
    actionPolicy: { create: "admin", update: "admin", delete: "admin" },
  },
  markdown: {
    reconstruct: (content) => ({ content, metadata: {} }),
    encode: ({ content }) => ({ content, frontmatter: {} }),
  },
  validatePersist: ({ content, visibility }) => {
    if (visibility !== "shared" || content !== "open")
      throw new Error("Invalid policy");
  },
});

export const groupingTypeCanary = defineServicePlugin(
  {
    id: "collections",
    config: z.object({}),
    entities: [policy],
  },
  {
    groupings: () => ({
      definitions: [
        {
          key: "labels",
          label: "Labels",
          field: "labels",
          types: ["fixture-record"],
        },
      ],
      vocabulary: { entity: policy, read: (): Record<string, never> => ({}) },
    }),
  },
);

export async function groupingReads(
  groups: OperatorEntityGroupings,
  caller: InterfaceCaller,
): Promise<void> {
  await groups.definitions(caller);
  await groups.catalog(
    { grouping: "labels", entityTypes: ["fixture-record"], limit: 20 },
    caller,
  );
  await groups.members(
    {
      grouping: "labels",
      entityTypes: ["fixture-record"],
      value: "Acme",
      signal: AbortSignal.abort(),
    },
    caller,
  );
  // @ts-expect-error caller identity is required for content queries
  await groups.catalog({ grouping: "labels", entityTypes: [] });
  await groups.catalog(
    {
      grouping: "labels",
      entityTypes: [],
      // @ts-expect-error visibility cannot be supplied by the reader
      visibilityScope: "restricted",
    },
    caller,
  );
}

export function forbiddenValidator(): ServiceGroupingDeclaration {
  return {
    definitions: [],
    vocabulary: {
      entity: policy,
      read: () => ({}),
      // @ts-expect-error no arbitrary foreign entity validation callback
      validateForeign: (_entity: unknown): never => {
        throw new Error("Unavailable capability");
      },
    },
  };
}

export async function fieldResults(
  operator: OperatorEntityWrites,
  caller: InterfaceCaller,
): Promise<void> {
  const result = await operator.create(
    {
      entityType: "fixture-record",
      entity: { entityType: "fixture-record", content: "body", metadata: {} },
    },
    caller,
  );
  if (result.kind === "invalid") {
    const message: string | undefined = result.issues[0]?.message;
    void message;
    // @ts-expect-error internal causes are not part of the result
    void result.originalError;
  }
}
