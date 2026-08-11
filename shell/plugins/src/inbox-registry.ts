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

export type InboxAction = z.output<typeof inboxActionSchema>;
export type InboxEntityRef = z.output<typeof inboxEntityRefSchema>;
export type InboxContact = z.output<typeof inboxContactSchema>;
export type InboxItem = z.output<typeof inboxItemSchema>;
export type InboxActor = z.output<typeof inboxActorSchema>;
export type InboxSourceMetadata = z.output<typeof inboxSourceMetadataSchema>;

export interface InboxSource extends InboxSourceMetadata {
  list(): Promise<InboxItem[]>;
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
    const metadata = inboxSourceMetadataSchema.parse({
      sourceId: source.sourceId,
      displayName: source.displayName,
    });
    if (typeof source.list !== "function" || typeof source.act !== "function") {
      throw new Error("Inbox source operations are required");
    }
    const normalized = normalizeSource(metadata, source);
    const registrations = this.registrations.get(metadata.sourceId) ?? [];
    registrations.push({ pluginId: owner, source: normalized });
    this.registrations.set(metadata.sourceId, registrations);
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
  source: InboxSource,
): InboxSource {
  return Object.freeze({
    ...metadata,
    list: async (): Promise<InboxItem[]> => {
      const items = inboxItemListSchema.parse(await source.list());
      return items.map(freezeItem);
    },
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
  Object.freeze(actions);
  return Object.freeze({
    ...item,
    ...(item.contact ? { contact: Object.freeze({ ...item.contact }) } : {}),
    ...(item.entityRef
      ? { entityRef: Object.freeze({ ...item.entityRef }) }
      : {}),
    actions,
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
