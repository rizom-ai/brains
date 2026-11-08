import {
  defineEntityCatalog,
  defineServicePlugin,
  defineStudioWorkspace,
  defineWorkspaceAction,
  z,
  type OperatorCapabilityDefinition,
  type OperatorEntityCatalogDefinition,
  type StudioWorkspaceViewBlock,
} from "@rizom/brain/services";

// Included by the standalone and packed typechecks, not loaded by a brain.

// A workspace over entity types the brain names when it is opened, not ones
// the package declares, opened in Studio through its catalog.
const shelfSources: OperatorEntityCatalogDefinition = defineEntityCatalog({
  id: "shelf-sources",
  label: "Shelf sources",
});

// One action whose verbs come from the data: each control carries the
// capability it offers, and the capability goes back with its input.
const capabilitySchema = z.object({
  id: z.string(),
  label: z.string(),
  confirmation: z.literal("prepared").optional(),
});
const runShelfAction = defineWorkspaceAction({
  name: "run-shelf-action",
  label: "Run shelf action",
  catalog: true,
  confirmation: { kind: "prepared", conditional: true },
  permission: "trusted",
  input: z.object({ itemId: z.string(), capability: capabilitySchema }),
  output: z.object({ done: z.boolean() }),
});

const shelfItem = z.object({
  id: z.string(),
  entityType: z.string(),
  title: z.string(),
});

const shelfWorkspace = defineStudioWorkspace({
  id: "shelf",
  label: "Shelf",
  permission: "trusted",
  entityCatalog: shelfSources,
  data: z.object({ items: z.array(shelfItem) }),
  actions: [runShelfAction],
  view: ({ data }) => ({
    title: "Shelf",
    blocks: [
      {
        type: "links",
        id: "open",
        items: data.items.map((item) => ({
          label: item.title,
          target: {
            catalog: shelfSources,
            entityType: item.entityType,
            id: item.id,
          },
        })),
      },
      ...data.items.map(
        (item): StudioWorkspaceViewBlock<typeof runShelfAction> => {
          const capability: OperatorCapabilityDefinition = {
            id: "archive",
            label: `Archive ${item.title}`,
            confirmation: "prepared",
          };
          return {
            type: "action",
            action: runShelfAction,
            capability,
            input: { itemId: item.id, capability },
          };
        },
      ),
    ],
  }),
});

export const catalogTypeCanary = defineServicePlugin(
  { id: "shelf", config: z.object({}) },
  {
    studioWorkspaces: (context) => [
      shelfWorkspace.bind(context, {
        // The entity types the catalog covers, named when the workspace opens.
        listEntityTypes: () => ["bookmark", "reading-digest"],
        load: () => ({
          items: [{ id: "a", entityType: "bookmark", title: "A reading" }],
        }),
        actions: [
          runShelfAction.bind(
            context,
            async () => ({ done: true }),
            ({ input }) => ({
              summary: `${input.capability.label}?`,
              revision: input.itemId,
            }),
          ),
        ],
      }),
    ],
  },
);
