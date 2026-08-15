import type { UserPermissionLevel } from "@brains/templates";
import { z } from "@brains/utils/zod";

const inboxIdPattern = /^[a-z][a-z0-9-]*$/;

/** Grammar for source and action identifiers; shared with inbox consumers. */
export const inboxIdSchema: z.ZodString = z
  .string()
  .trim()
  .regex(inboxIdPattern);

export const inboxItemIdSchema: z.ZodString = z.string().trim().min(1).max(300);

export const inboxUrgencySchema: z.ZodEnum<{
  high: "high";
  normal: "normal";
}> = z.enum(["high", "normal"]);

export const inboxFacetKeySchema: z.ZodString = inboxIdSchema.max(40);
export const inboxFacetValueSchema: z.ZodString = inboxIdSchema.max(40);

interface InboxFacetOptionValue {
  value: string;
  label: string;
}

export const inboxFacetOptionSchema: z.ZodType<
  InboxFacetOptionValue,
  InboxFacetOptionValue
> = z.strictObject({
  value: inboxFacetValueSchema,
  label: z.string().trim().min(1).max(100),
});

interface InboxFacetDefinitionValue {
  key: string;
  label: string;
  values: InboxFacetOptionValue[];
}

export const inboxFacetDefinitionSchema: z.ZodType<
  InboxFacetDefinitionValue,
  InboxFacetDefinitionValue
> = z
  .strictObject({
    key: inboxFacetKeySchema,
    label: z.string().trim().min(1).max(100),
    values: z.array(inboxFacetOptionSchema).min(1).max(20),
  })
  .superRefine((definition, context) => {
    const values = new Set<string>();
    for (const option of definition.values) {
      if (values.has(option.value)) {
        context.addIssue({
          code: "custom",
          path: ["values"],
          message: `Duplicate inbox facet value: ${option.value}`,
        });
      }
      values.add(option.value);
    }
  });

export const inboxFacetDefinitionsSchema: z.ZodType<
  InboxFacetDefinitionValue[],
  InboxFacetDefinitionValue[]
> = z
  .array(inboxFacetDefinitionSchema)
  .max(8)
  .superRefine((definitions, context) => {
    const keys = new Set<string>();
    for (const definition of definitions) {
      if (keys.has(definition.key)) {
        context.addIssue({
          code: "custom",
          path: [],
          message: `Duplicate inbox facet key: ${definition.key}`,
        });
      }
      keys.add(definition.key);
    }
  });

interface InboxFacetsValue {
  [key: string]: string;
}

export const inboxFacetsSchema: z.ZodType<InboxFacetsValue, InboxFacetsValue> =
  z
    .record(inboxFacetKeySchema, inboxFacetValueSchema)
    .refine((facets) => Object.keys(facets).length <= 8, {
      message: "Inbox items may declare at most eight facets",
    });

const inboxFollowUpContextKeySchema = z
  .string()
  .regex(/^[a-z][A-Za-z0-9]{0,39}$/);
const inboxFollowUpContextValueSchema = z
  .string()
  .min(1)
  .max(300)
  .refine((value) => !/[\p{Cc}\p{Cf}]/u.test(value), {
    message: "Inbox follow-up context values cannot contain controls",
  });

interface InboxFollowUpDeclarationValue {
  kind: string;
  context: Record<string, string>;
}

const inboxFollowUpDeclarationSchema: z.ZodType<
  InboxFollowUpDeclarationValue,
  InboxFollowUpDeclarationValue
> = z.strictObject({
  kind: inboxIdSchema,
  context: z
    .record(inboxFollowUpContextKeySchema, inboxFollowUpContextValueSchema)
    .refine((context) => Object.keys(context).length <= 8, {
      message: "Inbox follow-up context may contain at most eight entries",
    }),
});

const inboxFollowUpDeclarationsSchema: z.ZodType<
  InboxFollowUpDeclarationValue[],
  InboxFollowUpDeclarationValue[]
> = z
  .array(inboxFollowUpDeclarationSchema)
  .max(8)
  .superRefine((declarations, context) => {
    const kinds = new Set<string>();
    for (const declaration of declarations) {
      if (kinds.has(declaration.kind)) {
        context.addIssue({
          code: "custom",
          path: [],
          message: `Duplicate inbox follow-up kind: ${declaration.kind}`,
        });
      }
      kinds.add(declaration.kind);
    }
  });

interface InboxActionValue {
  id: string;
  label: string;
  confirm?: boolean | undefined;
}

export const inboxActionSchema: z.ZodType<InboxActionValue, InboxActionValue> =
  z.strictObject({
    id: inboxIdSchema,
    label: z.string().trim().min(1).max(100),
    confirm: z.boolean().optional(),
  });

interface InboxEntityRefValue {
  entityType: string;
  entityId: string;
}

export const inboxEntityRefSchema: z.ZodType<
  InboxEntityRefValue,
  InboxEntityRefValue
> = z.strictObject({
  entityType: z.string().trim().min(1).max(100),
  entityId: z.string().trim().min(1).max(300),
});

interface InboxContactValue {
  label: string;
  personId?: string | undefined;
}

export const inboxContactSchema: z.ZodType<
  InboxContactValue,
  InboxContactValue
> = z.strictObject({
  label: z.string().trim().min(1).max(300),
  personId: z.string().trim().min(1).max(200).optional(),
});

interface InboxItemValue {
  id: string;
  title: string;
  summary?: string | undefined;
  contact?: InboxContactValue | undefined;
  threadOrdinal?: number | undefined;
  receivedAt: string;
  urgency: "high" | "normal";
  entityRef?: InboxEntityRefValue | undefined;
  facets?: InboxFacetsValue | undefined;
  followUps?: InboxFollowUpDeclarationValue[] | undefined;
  actions: InboxActionValue[];
}

export const inboxItemSchema: z.ZodType<InboxItemValue, InboxItemValue> = z
  .strictObject({
    id: inboxItemIdSchema,
    title: z.string().trim().min(1).max(160),
    summary: z.string().trim().min(1).max(1_000).optional(),
    contact: inboxContactSchema.optional(),
    threadOrdinal: z
      .number()
      .int()
      .positive()
      .max(Number.MAX_SAFE_INTEGER)
      .optional(),
    receivedAt: z.iso.datetime(),
    urgency: inboxUrgencySchema,
    entityRef: inboxEntityRefSchema.optional(),
    facets: inboxFacetsSchema.optional(),
    followUps: inboxFollowUpDeclarationsSchema.optional(),
    actions: z.array(inboxActionSchema).max(10),
  })
  .superRefine((item, context) => {
    const actionIds = new Set<string>();
    for (const action of item.actions) {
      if (actionIds.has(action.id)) {
        context.addIssue({
          code: "custom",
          path: ["actions"],
          message: `Duplicate inbox action id: ${action.id}`,
        });
      }
      actionIds.add(action.id);
    }
  });

export const inboxItemListSchema: z.ZodType<
  InboxItemValue[],
  InboxItemValue[]
> = z.array(inboxItemSchema).max(1_000);

interface InboxActorValue {
  permissionLevel: UserPermissionLevel;
}

export const inboxActorSchema: z.ZodType<InboxActorValue, InboxActorValue> =
  z.strictObject({
    permissionLevel: z.enum(["admin", "trusted", "public"]),
  });

interface InboxItemDetailValue {
  kind: "plain";
  text: string;
  truncated: boolean;
}

export const inboxItemDetailSchema: z.ZodType<
  InboxItemDetailValue,
  InboxItemDetailValue
> = z.strictObject({
  kind: z.literal("plain"),
  text: z.string().max(100_000),
  truncated: z.boolean(),
});

interface InboxSourceMetadataValue {
  sourceId: string;
  displayName: string;
}

export const inboxSourceMetadataSchema: z.ZodType<
  InboxSourceMetadataValue,
  InboxSourceMetadataValue
> = z.strictObject({
  sourceId: inboxIdSchema,
  displayName: z.string().trim().min(1).max(100),
});

interface InboxSourceDescriptorValue extends InboxSourceMetadataValue {
  facets?: InboxFacetDefinitionValue[] | undefined;
}

export const inboxSourceDescriptorSchema: z.ZodType<
  InboxSourceDescriptorValue,
  InboxSourceDescriptorValue
> = z.strictObject({
  sourceId: inboxIdSchema,
  displayName: z.string().trim().min(1).max(100),
  facets: inboxFacetDefinitionsSchema.optional(),
});

export type InboxAction = z.output<typeof inboxActionSchema>;
export type InboxFollowUpDeclaration = z.output<
  typeof inboxFollowUpDeclarationSchema
>;
export type InboxEntityRef = z.output<typeof inboxEntityRefSchema>;
export type InboxContact = z.output<typeof inboxContactSchema>;
export type InboxFacetOption = z.output<typeof inboxFacetOptionSchema>;
export type InboxFacetDefinition = z.output<typeof inboxFacetDefinitionSchema>;
export type InboxFacets = z.output<typeof inboxFacetsSchema>;
export type InboxItem = z.output<typeof inboxItemSchema>;
export type InboxActor = z.output<typeof inboxActorSchema>;
export type InboxItemDetail = z.output<typeof inboxItemDetailSchema>;
export type InboxSourceMetadata = z.output<typeof inboxSourceMetadataSchema>;
export type InboxSourceDescriptor = z.output<
  typeof inboxSourceDescriptorSchema
>;

export interface InboxSource extends InboxSourceDescriptor {
  list(): Promise<InboxItem[]>;
  resolveDetail?(
    itemId: string,
    actor: InboxActor,
    signal: AbortSignal,
  ): Promise<InboxItemDetail>;
  act(itemId: string, actionId: string, actor: InboxActor): Promise<void>;
}

export interface IInboxRegistry {
  registerSource(pluginId: string, source: InboxSource): void;
  unregisterPlugin(pluginId: string): void;
  finalize(): void;
  listSources(): InboxSource[];
  getSource(sourceId: string): InboxSource | undefined;
  isFinalized(): boolean;
}

interface InboxSourceRegistration {
  pluginId: string;
  source: InboxSource;
}

/** App-scoped registry of source-owned operator attention projections. */
export class InboxRegistry implements IInboxRegistry {
  private readonly registrations = new Map<string, InboxSourceRegistration[]>();
  private activeSources = new Map<string, InboxSource>();
  private finalized = false;

  registerSource(pluginId: string, source: InboxSource): void {
    this.assertRegistrationOpen();
    const owner = normalizePluginId(pluginId);
    const descriptor = inboxSourceDescriptorSchema.parse({
      sourceId: source.sourceId,
      displayName: source.displayName,
      ...(source.facets ? { facets: source.facets } : {}),
    });
    if (typeof source.list !== "function" || typeof source.act !== "function") {
      throw new Error("Inbox source operations are required");
    }
    const normalized = normalizeSource(
      descriptor,
      descriptor.facets ?? [],
      source,
    );
    const registrations = this.registrations.get(descriptor.sourceId) ?? [];
    registrations.push({ pluginId: owner, source: normalized });
    this.registrations.set(descriptor.sourceId, registrations);
  }

  unregisterPlugin(pluginId: string): void {
    const owner = pluginId.trim();
    for (const [sourceId, registrations] of this.registrations) {
      const remaining = registrations.filter(
        (registration) => registration.pluginId !== owner,
      );
      if (remaining.length === 0) this.registrations.delete(sourceId);
      else this.registrations.set(sourceId, remaining);
    }
    if (this.finalized) this.rebuildActiveState(false);
  }

  finalize(): void {
    if (this.finalized) return;
    this.rebuildActiveState(true);
    this.finalized = true;
  }

  listSources(): InboxSource[] {
    this.assertFinalized();
    return [...this.activeSources.values()].sort((left, right) =>
      left.sourceId.localeCompare(right.sourceId),
    );
  }

  getSource(sourceId: string): InboxSource | undefined {
    this.assertFinalized();
    return this.activeSources.get(normalizeSourceId(sourceId));
  }

  isFinalized(): boolean {
    return this.finalized;
  }

  private rebuildActiveState(failOnInvalid: boolean): void {
    const sources = new Map<string, InboxSource>();
    for (const [sourceId, registrations] of this.registrations) {
      if (registrations.length > 1) {
        if (!failOnInvalid) continue;
        const pluginIds = registrations
          .map((registration) => registration.pluginId)
          .sort()
          .join(", ");
        throw new Error(
          `Inbox source "${sourceId}" is registered by multiple plugins: ${pluginIds}`,
        );
      }
      const source = registrations[0]?.source;
      if (source) sources.set(sourceId, source);
    }
    this.activeSources = sources;
  }

  private assertRegistrationOpen(): void {
    if (this.finalized) throw new Error("Inbox registration is closed");
  }

  private assertFinalized(): void {
    if (!this.finalized) throw new Error("Inbox registry is not finalized");
  }
}

function normalizeSource(
  metadata: InboxSourceMetadata,
  facets: InboxFacetDefinition[],
  source: InboxSource,
): InboxSource {
  const normalizedFacets = freezeFacetDefinitions(facets);
  const sourceFacetsSchema = createSourceFacetsSchema(normalizedFacets);
  return Object.freeze({
    ...metadata,
    ...(normalizedFacets.length > 0 ? { facets: normalizedFacets } : {}),
    list: async (): Promise<InboxItem[]> => {
      const items = inboxItemListSchema.parse(await source.list());
      for (const item of items) {
        if (item.facets !== undefined) sourceFacetsSchema.parse(item.facets);
      }
      return items.map(freezeItem);
    },
    ...(source.resolveDetail
      ? {
          resolveDetail: async (
            itemId: string,
            actor: InboxActor,
            signal: AbortSignal,
          ): Promise<InboxItemDetail> => {
            if (!(signal instanceof AbortSignal)) {
              throw new Error("Inbox detail signal is invalid");
            }
            return inboxItemDetailSchema.parse(
              await source.resolveDetail?.(
                inboxItemIdSchema.parse(itemId),
                inboxActorSchema.parse(actor),
                signal,
              ),
            );
          },
        }
      : {}),
    act: async (
      itemId: string,
      actionId: string,
      actor: InboxActor,
    ): Promise<void> => {
      const normalizedItemId = inboxItemIdSchema.parse(itemId);
      const normalizedActionId = inboxIdSchema.parse(actionId);
      await source.act(
        normalizedItemId,
        normalizedActionId,
        inboxActorSchema.parse(actor),
      );
    },
  });
}

function freezeItem(item: InboxItem): InboxItem {
  const actions: InboxAction[] = item.actions.map((action) =>
    Object.freeze({ ...action }),
  );
  const followUps: InboxFollowUpDeclaration[] | undefined = item.followUps?.map(
    (followUp) =>
      Object.freeze({
        ...followUp,
        context: Object.freeze({ ...followUp.context }),
      }),
  );
  Object.freeze(actions);
  if (followUps) Object.freeze(followUps);
  return Object.freeze({
    ...item,
    ...(item.contact ? { contact: Object.freeze({ ...item.contact }) } : {}),
    ...(item.entityRef
      ? { entityRef: Object.freeze({ ...item.entityRef }) }
      : {}),
    ...(item.facets ? { facets: Object.freeze({ ...item.facets }) } : {}),
    ...(followUps ? { followUps } : {}),
    actions,
  });
}

function freezeFacetDefinitions(
  definitions: InboxFacetDefinition[],
): InboxFacetDefinition[] {
  const frozen = definitions.map((definition) => {
    const values = definition.values.map((option) =>
      Object.freeze({ ...option }),
    );
    Object.freeze(values);
    return Object.freeze({ ...definition, values });
  });
  Object.freeze(frozen);
  return frozen;
}

function createSourceFacetsSchema(
  definitions: InboxFacetDefinition[],
): z.ZodType<InboxFacets, InboxFacets> {
  const allowed = new Map(
    definitions.map((definition) => [
      definition.key,
      new Set(definition.values.map((option) => option.value)),
    ]),
  );
  return inboxFacetsSchema.superRefine((facets, context) => {
    for (const [key, value] of Object.entries(facets)) {
      if (!allowed.get(key)?.has(value)) {
        context.addIssue({
          code: "custom",
          path: [key],
          message: `Undeclared inbox facet value: ${key}=${value}`,
        });
      }
    }
  });
}

function normalizePluginId(pluginId: string): string {
  const normalized = pluginId.trim();
  if (!normalized) throw new Error("Inbox registration plugin id is required");
  return normalized;
}

function normalizeSourceId(sourceId: string): string {
  return inboxIdSchema.parse(sourceId);
}
