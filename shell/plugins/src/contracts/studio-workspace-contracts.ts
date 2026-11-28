import {
  defineBusContract,
  type ActorRef,
  type BusContract,
} from "@brains/contracts";
import type { ContentVisibility } from "@brains/entity-service";
import type { UserPermissionLevel } from "@brains/templates";
import { z } from "@brains/utils/zod";

export const DECLARATIVE_STUDIO_WORKSPACE_RENDERER =
  "DeclarativeOperatorWorkspace";

export interface StudioWorkspaceActor {
  interfaceType: "studio";
  userId: string;
  /** The signed-in person's name, for providers that record who acted. */
  displayName?: string | undefined;
  actor: ActorRef;
  userPermissionLevel: UserPermissionLevel;
  visibilityScope: ContentVisibility;
  isAnchor: boolean;
}

/**
 * Entity types a workspace covers, resolved per actor so descriptors never
 * disclose types the actor cannot act on.
 */
export type StudioWorkspaceEntityTypesResolver = (
  actor: StudioWorkspaceActor,
) => string[] | Promise<string[]>;
export type StudioWorkspaceAccessHandler = (
  actor: StudioWorkspaceActor,
) => boolean | Promise<boolean>;
export type StudioWorkspaceDataProvider = (
  actor: StudioWorkspaceActor,
  query?: unknown,
  signal?: AbortSignal,
) => Promise<unknown>;
export type StudioWorkspaceActionHandler = (
  request: unknown,
  actor: StudioWorkspaceActor,
  signal?: AbortSignal,
) => Promise<unknown>;
/** Bounded attention count shown in the workspace rail. */
export type StudioWorkspaceBadgeProvider = (
  actor: StudioWorkspaceActor,
) => number | undefined | Promise<number | undefined>;

/**
 * One thing that needs the person, as Home's "Needs you" lists it: what it
 * is, why, how urgent, and the verb that clears it. The verb opens the
 * workspace that holds it, with the query named.
 */
export const studioAttentionItemSchema: z.ZodObject<
  {
    id: z.ZodString;
    title: z.ZodString;
    detail: z.ZodOptional<z.ZodString>;
    severity: z.ZodEnum<{ error: "error"; warn: "warn"; info: "info" }>;
    action: z.ZodObject<
      {
        label: z.ZodString;
        query: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
      },
      z.core.$strict
    >;
  },
  z.core.$strict
> = z.strictObject({
  id: z.string().trim().min(1).max(120),
  title: z.string().trim().min(1).max(200),
  detail: z.string().trim().min(1).max(500).optional(),
  severity: z.enum(["error", "warn", "info"]),
  action: z.strictObject({
    label: z.string().trim().min(1).max(40),
    query: z.record(z.string().min(1).max(60), z.string().max(500)).optional(),
  }),
});

export type StudioAttentionItem = z.output<typeof studioAttentionItemSchema>;

/** What in a workspace needs the person now; empty when nothing does. */
export type StudioWorkspaceAttentionProvider = (
  actor: StudioWorkspaceActor,
) => readonly StudioAttentionItem[] | Promise<readonly StudioAttentionItem[]>;

type StudioWorkspaceAliasSchema = z.ZodObject<
  {
    id: z.ZodString;
    query: z.ZodRecord<z.ZodString, z.ZodString>;
  },
  z.core.$strict
>;

const studioWorkspaceAliasSchema: StudioWorkspaceAliasSchema = z
  .object({
    id: z.string().trim().min(1),
    query: z.record(z.string().trim().min(1), z.string()),
  })
  .strict();

/**
 * Studio's fixed sections. A workspace names the one it belongs to; plugins
 * cannot add sections, so navigation keeps its shape however many install.
 */
export const STUDIO_SECTIONS = [
  "home",
  "library",
  "publish",
  "chat",
  "brain",
] as const;

export type StudioSection = (typeof STUDIO_SECTIONS)[number];

/** One retired workspace id and the stable query state of its replacement. */
export type StudioWorkspaceAlias = z.output<typeof studioWorkspaceAliasSchema>;

type StudioWorkspaceRegistrationSchema = z.ZodObject<{
  id: z.ZodString;
  pluginId: z.ZodString;
  label: z.ZodString;
  rendererName: z.ZodLiteral<typeof DECLARATIVE_STUDIO_WORKSPACE_RENDERER>;
  priority: z.ZodNumber;
  permission: z.ZodDefault<
    z.ZodEnum<{ public: "public"; trusted: "trusted"; admin: "admin" }>
  >;
  urlQuery: z.ZodOptional<z.ZodLiteral<true>>;
  aliases: z.ZodOptional<z.ZodReadonly<z.ZodArray<StudioWorkspaceAliasSchema>>>;
  entityTypes: z.ZodDefault<
    z.ZodUnion<
      readonly [
        z.ZodArray<z.ZodString>,
        z.ZodCustom<
          StudioWorkspaceEntityTypesResolver,
          StudioWorkspaceEntityTypesResolver
        >,
      ]
    >
  >;
  publishesEntityTypes: z.ZodOptional<z.ZodLiteral<true>>;
  section: z.ZodOptional<z.ZodEnum<{ [K in StudioSection]: K }>>;
  accessHandler: z.ZodCustom<
    StudioWorkspaceAccessHandler,
    StudioWorkspaceAccessHandler
  >;
  dataProvider: z.ZodCustom<
    StudioWorkspaceDataProvider,
    StudioWorkspaceDataProvider
  >;
  actionHandler: z.ZodOptional<
    z.ZodCustom<StudioWorkspaceActionHandler, StudioWorkspaceActionHandler>
  >;
  badgeProvider: z.ZodOptional<
    z.ZodCustom<StudioWorkspaceBadgeProvider, StudioWorkspaceBadgeProvider>
  >;
  attentionProvider: z.ZodOptional<
    z.ZodCustom<
      StudioWorkspaceAttentionProvider,
      StudioWorkspaceAttentionProvider
    >
  >;
}>;

/**
 * A workspace registration as Studio receives it. Omitted permission floors
 * default to Trusted so a permissive source handler cannot widen access;
 * `urlQuery` lets the Studio container hydrate stable renderer-owned filters
 * from the URL; `aliases` are retired ids the browser resolves to this
 * workspace; `publishesEntityTypes` sends publication actions for the covered
 * entity types here.
 */
export const studioWorkspaceRegistrationSchema: StudioWorkspaceRegistrationSchema =
  z.object({
    id: z.string().trim().min(1),
    pluginId: z.string().trim().min(1),
    label: z.string().trim().min(1),
    rendererName: z.literal(DECLARATIVE_STUDIO_WORKSPACE_RENDERER),
    priority: z.number().int(),
    permission: z.enum(["public", "trusted", "admin"]).default("trusted"),
    urlQuery: z.literal(true).optional(),
    aliases: z.array(studioWorkspaceAliasSchema).max(20).readonly().optional(),
    entityTypes: z
      .union([
        z.array(z.string().trim().min(1)),
        z.custom<StudioWorkspaceEntityTypesResolver>(
          (value) => typeof value === "function",
          {
            message: "Expected Studio workspace entity types resolver function",
          },
        ),
      ])
      .default([]),
    publishesEntityTypes: z.literal(true).optional(),
    section: z.enum(STUDIO_SECTIONS).optional(),
    accessHandler: z.custom<StudioWorkspaceAccessHandler>(
      (value) => typeof value === "function",
      { message: "Expected Studio workspace access handler function" },
    ),
    dataProvider: z.custom<StudioWorkspaceDataProvider>(
      (value) => typeof value === "function",
      { message: "Expected Studio workspace data provider function" },
    ),
    actionHandler: z
      .custom<StudioWorkspaceActionHandler>(
        (value) => typeof value === "function",
        { message: "Expected Studio workspace action handler function" },
      )
      .optional(),
    badgeProvider: z
      .custom<StudioWorkspaceBadgeProvider>(
        (value) => typeof value === "function",
        { message: "Expected Studio workspace badge provider function" },
      )
      .optional(),
    attentionProvider: z
      .custom<StudioWorkspaceAttentionProvider>(
        (value) => typeof value === "function",
        { message: "Expected Studio workspace attention provider function" },
      )
      .optional(),
  });

export type StudioWorkspaceRegistration = z.input<
  typeof studioWorkspaceRegistrationSchema
>;

type StudioWorkspaceRegistrationResultSchema = z.ZodObject<{
  workspaceUrl: z.ZodString;
}>;

const studioWorkspaceRegistrationResultSchema: StudioWorkspaceRegistrationResultSchema =
  z.object({ workspaceUrl: z.string() });

export type StudioWorkspaceRegistrationResult = z.output<
  typeof studioWorkspaceRegistrationResultSchema
>;

type StudioWorkspaceUnregistrationSchema = z.ZodObject<{
  pluginId: z.ZodString;
  workspaceId: z.ZodOptional<z.ZodString>;
}>;

const studioWorkspaceUnregistrationSchema: StudioWorkspaceUnregistrationSchema =
  z.object({
    pluginId: z.string(),
    workspaceId: z.string().optional(),
  });

export type StudioWorkspaceUnregistration = z.input<
  typeof studioWorkspaceUnregistrationSchema
>;

/**
 * Register a workspace with Studio, which owns it and answers with the
 * workspace's URL. Studio refuses the ids it reserves for its own workspaces.
 */
export const studioWorkspaceRegisterContract: BusContract<
  StudioWorkspaceRegistrationSchema,
  StudioWorkspaceRegistrationResultSchema,
  "request"
> = defineBusContract({
  channel: "studio:register-workspace",
  request: studioWorkspaceRegistrationSchema,
  response: studioWorkspaceRegistrationResultSchema,
  delivery: "request",
});

/** Withdraw one workspace, or every workspace, of a plugin from Studio. */
export const studioWorkspaceUnregisterContract: BusContract<
  StudioWorkspaceUnregistrationSchema,
  z.ZodVoid,
  "request"
> = defineBusContract({
  channel: "studio:unregister-workspace",
  request: studioWorkspaceUnregistrationSchema,
  response: z.void(),
  delivery: "request",
});
