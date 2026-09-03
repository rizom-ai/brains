import { PermissionService, type UserPermissionLevel } from "@brains/templates";
import type { Logger } from "@brains/utils/logger";
import { z } from "@brains/utils/zod";
import { normalizeSameOriginPath } from "./internal/same-origin-path";
import {
  inboxActorSchema,
  inboxIdSchema,
  inboxItemSchema,
  type InboxActor,
  type InboxItem,
} from "./inbox-registry";

const MAX_TARGET_LENGTH = 2_048;
const MAX_STATE_BYTES = 8 * 1_024;

export type InboxFollowUpMode = "universal" | "declared";
export type InboxFollowUpContext = Readonly<Record<string, string>>;
export type InboxFollowUpJson = z.output<ReturnType<typeof z.json>>;

export interface InboxFollowUpResolutionInput {
  sourceId: string;
  item: InboxItem;
  actor: InboxActor;
  context?: InboxFollowUpContext | undefined;
}

export interface InboxFollowUpTargetInput {
  href: string;
  state?: unknown;
}

export interface InboxFollowUpKindRegistration {
  kind: string;
  label: string;
  priority: number;
  mode: InboxFollowUpMode;
  permissionLevel: UserPermissionLevel;
  contextSchema?: z.ZodType<InboxFollowUpContext, unknown> | undefined;
  applies(input: InboxFollowUpResolutionInput): boolean | Promise<boolean>;
  resolve(
    input: InboxFollowUpResolutionInput,
  ):
    | InboxFollowUpTargetInput
    | undefined
    | Promise<InboxFollowUpTargetInput | undefined>;
}

export type RegisteredInboxFollowUpKind =
  Readonly<InboxFollowUpKindRegistration>;

export interface IInboxFollowUpRegistry {
  registerKind(
    pluginId: string,
    registration: InboxFollowUpKindRegistration,
  ): void;
  unregisterPlugin(pluginId: string): void;
  finalize(): void;
  listKinds(): RegisteredInboxFollowUpKind[];
  getKind(kind: string): RegisteredInboxFollowUpKind | undefined;
  resolve(
    input: Omit<InboxFollowUpResolutionInput, "context">,
  ): Promise<ResolvedInboxFollowUp[]>;
  resolveUniversal(
    input: Omit<InboxFollowUpResolutionInput, "context">,
  ): Promise<ResolvedInboxFollowUp[]>;
  isFinalized(): boolean;
}

interface KindRegistration {
  pluginId: string;
  kind: RegisteredInboxFollowUpKind;
}

const kindRegistrationSchema: z.ZodType<
  InboxFollowUpKindRegistration,
  InboxFollowUpKindRegistration
> = z
  .strictObject({
    kind: inboxIdSchema,
    label: z.string().trim().min(1).max(100),
    priority: z.number().int().min(0).max(1_000),
    mode: z.enum(["universal", "declared"]),
    permissionLevel: z.enum(["admin", "trusted", "public"]),
    contextSchema: z
      .custom<z.ZodType<InboxFollowUpContext, unknown>>(
        (value) =>
          typeof value === "object" &&
          value !== null &&
          "safeParse" in value &&
          typeof value.safeParse === "function",
      )
      .optional(),
    applies: z.custom<InboxFollowUpKindRegistration["applies"]>(
      (value) => typeof value === "function",
    ),
    resolve: z.custom<InboxFollowUpKindRegistration["resolve"]>(
      (value) => typeof value === "function",
    ),
  })
  .superRefine((registration, context) => {
    if (
      registration.mode === "declared" &&
      registration.contextSchema === undefined
    ) {
      context.addIssue({
        code: "custom",
        path: ["contextSchema"],
        message: "Declared inbox follow-up kinds require a context schema",
      });
    }
    if (
      registration.mode === "universal" &&
      registration.contextSchema !== undefined
    ) {
      context.addIssue({
        code: "custom",
        path: ["contextSchema"],
        message: "Universal inbox follow-up kinds cannot accept context",
      });
    }
  });

const targetSchema = z.strictObject({
  href: z.string(),
  state: z.unknown().optional(),
});

const inboxFollowUpStateSchema: z.ZodRecord<
  z.ZodString,
  ReturnType<typeof z.json>
> = z
  .record(z.string(), z.json())
  .refine(
    (state) =>
      new TextEncoder().encode(JSON.stringify(state)).byteLength <=
      MAX_STATE_BYTES,
    { message: "Inbox follow-up state is too large" },
  );

type ResolvedInboxFollowUpSchema = z.ZodObject<
  {
    kind: z.ZodString;
    label: z.ZodString;
    href: z.ZodString;
    state: z.ZodOptional<typeof inboxFollowUpStateSchema>;
  },
  z.core.$strict
>;

export const resolvedInboxFollowUpSchema: ResolvedInboxFollowUpSchema =
  z.strictObject({
    kind: inboxIdSchema,
    label: z.string().trim().min(1).max(100),
    href: z
      .string()
      .min(1)
      .max(MAX_TARGET_LENGTH)
      .refine((href) => normalizeSameOriginPath(href) === href),
    state: inboxFollowUpStateSchema.optional(),
  });

export type ResolvedInboxFollowUp = z.output<
  typeof resolvedInboxFollowUpSchema
>;

/** App-scoped catalog of destination-owned, non-mutating Inbox launches. */
export class InboxFollowUpRegistry implements IInboxFollowUpRegistry {
  private readonly registrations = new Map<string, KindRegistration[]>();
  private activeKinds = new Map<string, RegisteredInboxFollowUpKind>();
  private finalized = false;
  private readonly logger: Logger | undefined;

  constructor(logger?: Logger) {
    this.logger = logger;
  }

  registerKind(
    pluginId: string,
    registration: InboxFollowUpKindRegistration,
  ): void {
    this.assertRegistrationOpen();
    const owner = normalizePluginId(pluginId);
    const normalized = Object.freeze(
      kindRegistrationSchema.parse(registration),
    );
    const registrations = this.registrations.get(normalized.kind) ?? [];
    registrations.push({ pluginId: owner, kind: normalized });
    this.registrations.set(normalized.kind, registrations);
  }

  unregisterPlugin(pluginId: string): void {
    const owner = pluginId.trim();
    for (const [kind, registrations] of this.registrations) {
      const remaining = registrations.filter(
        (registration) => registration.pluginId !== owner,
      );
      if (remaining.length === 0) this.registrations.delete(kind);
      else this.registrations.set(kind, remaining);
    }
    if (this.finalized) this.rebuildActiveState(false);
  }

  finalize(): void {
    if (this.finalized) return;
    this.rebuildActiveState(true);
    this.finalized = true;
  }

  listKinds(): RegisteredInboxFollowUpKind[] {
    this.assertFinalized();
    return [...this.activeKinds.values()].sort(compareKinds);
  }

  getKind(kind: string): RegisteredInboxFollowUpKind | undefined {
    this.assertFinalized();
    return this.activeKinds.get(inboxIdSchema.parse(kind));
  }

  async resolve(
    input: Omit<InboxFollowUpResolutionInput, "context">,
  ): Promise<ResolvedInboxFollowUp[]> {
    this.assertFinalized();
    const normalizedInput: InboxFollowUpResolutionInput = Object.freeze({
      sourceId: inboxIdSchema.parse(input.sourceId),
      item: inboxItemSchema.parse(input.item),
      actor: inboxActorSchema.parse(input.actor),
    });
    const declarations = new Map(
      (normalizedInput.item.followUps ?? []).map((declaration) => [
        declaration.kind,
        declaration.context,
      ]),
    );
    const kinds = this.listKinds();
    const declared = await Promise.all(
      kinds
        .filter((kind) => kind.mode === "declared")
        .map(async (kind) => {
          const context = declarations.get(kind.kind);
          if (!context || !kind.contextSchema) return undefined;
          const parsedContext = kind.contextSchema.safeParse(context);
          if (!parsedContext.success) return undefined;
          return resolveKind(
            kind,
            Object.freeze({ ...normalizedInput, context: parsedContext.data }),
            this.logger,
          );
        }),
    );
    const universal = await Promise.all(
      kinds
        .filter((kind) => kind.mode === "universal")
        .map(async (kind) => resolveKind(kind, normalizedInput, this.logger)),
    );
    return [...declared, ...universal].filter(
      (target): target is ResolvedInboxFollowUp => target !== undefined,
    );
  }

  async resolveUniversal(
    input: Omit<InboxFollowUpResolutionInput, "context">,
  ): Promise<ResolvedInboxFollowUp[]> {
    this.assertFinalized();
    const normalizedInput: InboxFollowUpResolutionInput = Object.freeze({
      sourceId: inboxIdSchema.parse(input.sourceId),
      item: inboxItemSchema.parse(input.item),
      actor: inboxActorSchema.parse(input.actor),
    });
    const resolved = await Promise.all(
      this.listKinds()
        .filter((kind) => kind.mode === "universal")
        .map(async (kind) => resolveKind(kind, normalizedInput, this.logger)),
    );
    return resolved.filter(
      (target): target is ResolvedInboxFollowUp => target !== undefined,
    );
  }

  isFinalized(): boolean {
    return this.finalized;
  }

  private rebuildActiveState(failOnInvalid: boolean): void {
    const kinds = new Map<string, RegisteredInboxFollowUpKind>();
    for (const [kind, registrations] of this.registrations) {
      if (registrations.length > 1) {
        if (!failOnInvalid) continue;
        const owners = registrations
          .map((registration) => registration.pluginId)
          .sort()
          .join(", ");
        throw new Error(
          `Inbox follow-up kind "${kind}" is registered by multiple plugins: ${owners}`,
        );
      }
      const registration = registrations[0]?.kind;
      if (registration) kinds.set(kind, registration);
    }
    this.activeKinds = kinds;
  }

  private assertRegistrationOpen(): void {
    if (this.finalized) {
      throw new Error("Inbox follow-up registration is closed");
    }
  }

  private assertFinalized(): void {
    if (!this.finalized) {
      throw new Error("Inbox follow-up registry is not finalized");
    }
  }
}

async function resolveKind(
  kind: RegisteredInboxFollowUpKind,
  input: InboxFollowUpResolutionInput,
  logger?: Logger,
): Promise<ResolvedInboxFollowUp | undefined> {
  if (
    !PermissionService.hasPermission(
      input.actor.permissionLevel,
      kind.permissionLevel,
    )
  ) {
    return undefined;
  }
  try {
    if (!(await kind.applies(input))) return undefined;
    const target = await kind.resolve(input);
    if (!target) return undefined;
    const normalized = normalizeTarget(target);
    return Object.freeze({
      kind: kind.kind,
      label: kind.label,
      href: normalized.href,
      ...(normalized.state ? { state: normalized.state } : {}),
    });
  } catch (error) {
    // A hidden launch looks identical to an unavailable one at the surface, so
    // a destination whose predicate or resolver always throws would otherwise
    // fail silently forever. Detail stays server-side; the caller still gets
    // nothing.
    logger?.debug("Inbox follow-up kind did not resolve", {
      kind: kind.kind,
      sourceId: input.sourceId,
      error,
    });
    return undefined;
  }
}

function normalizeTarget(target: InboxFollowUpTargetInput): {
  href: string;
  state?: Readonly<Record<string, InboxFollowUpJson>> | undefined;
} {
  const parsed = targetSchema.parse(target);
  const href = normalizeSameOriginPath(parsed.href);
  if (!href) throw new Error("Invalid inbox follow-up target");
  const state =
    parsed.state === undefined
      ? undefined
      : normalizeHistoryState(parsed.state);
  return { href, ...(state ? { state } : {}) };
}

function normalizeHistoryState(
  state: unknown,
): Readonly<Record<string, InboxFollowUpJson>> {
  return Object.freeze(inboxFollowUpStateSchema.parse(state));
}

function compareKinds(
  left: RegisteredInboxFollowUpKind,
  right: RegisteredInboxFollowUpKind,
): number {
  return left.priority - right.priority || left.kind.localeCompare(right.kind);
}

function normalizePluginId(pluginId: string): string {
  const normalized = pluginId.trim();
  if (!normalized) {
    throw new Error("Inbox follow-up registration plugin id is required");
  }
  return normalized;
}
