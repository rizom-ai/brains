import { defineEntity, z } from "@rizom/brain/entities";
import {
  defineServicePlugin,
  type InterfaceCaller,
  type OperatorEntityWrites,
  type ServiceGroupingDeclaration,
  type GroupingDefinitionsSnapshot,
  type GroupingDefinition,
} from "@rizom/brain/services";

const document = defineEntity({
  type: "collection-policy",
  purpose: "Owned grouping control document",
  metadata: z.object({}),
  singleton: true,
  config: {
    actionPolicy: {
      create: "admin",
      update: "admin",
      delete: "admin",
      publish: "never",
    },
  },
});
const definition: GroupingDefinition = {
  label: "Areas",
  excludeTypes: ["post"],
  multiple: false,
  values: ["Work"],
};
const retiredAllowlist: GroupingDefinition = {
  label: "Areas",
  multiple: true,
  // @ts-expect-error Source policies use exclusions, not the retired allowlist.
  types: ["note"],
};
void retiredAllowlist;
const initial: GroupingDefinitionsSnapshot = {
  excludedTypes: [],
  groupings: { areas: definition },
  issues: [],
};

export const groupingSourceCanary = defineServicePlugin(
  {
    id: "grouping-source-canary",
    config: z.object({}),
    entities: [document],
    setup: ({ operatorEntities, entityGroupings }) => {
      const read = async (
        caller: InterfaceCaller,
        signal: AbortSignal,
      ): Promise<void> => {
        await operatorEntities.readSource(
          { entityType: "note", id: "one", signal },
          caller,
        );
        await entityGroupings.ensureReady(caller);
        entityGroupings.canContribute("note");
        await entityGroupings.usage(
          {
            grouping: "areas",
            entityTypes: ["note"],
            values: ["Work"],
            signal,
          },
          caller,
        );
      };
      return { snapshot: initial, read };
    },
  },
  {
    groupings: ({ state }) => ({
      source: {
        entity: document,
        read: (content): unknown => JSON.parse(content),
        publish: (snapshot): void => {
          state.snapshot = snapshot;
        },
      },
    }),
  },
);

// Compile-only negative canaries: no raw services, caller omission, scope widening or legacy declarations.
export function unsupportedSourceReads(
  operator: OperatorEntityWrites,
  caller: InterfaceCaller,
): void {
  // @ts-expect-error A live runtime-issued caller is required.
  void operator.readSource({ entityType: "note", id: "one" });
  void operator.readSource(
    {
      entityType: "note",
      id: "one",
      // @ts-expect-error Visibility is derived by the runtime, not selected by source readers.
      visibilityScope: "restricted",
    },
    caller,
  );
  // @ts-expect-error The operator does not expose a native raw entity service.
  void operator.getEntityRaw({ entityType: "note", id: "one" });
}
export const retiredGroupingDeclaration: ServiceGroupingDeclaration = {
  // @ts-expect-error Static definitions/vocabulary were replaced, not retained as a compatibility API.
  definitions: [],
};
