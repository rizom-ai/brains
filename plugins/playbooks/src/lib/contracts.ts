import type { ActionsCard } from "@brains/contracts";
import { z } from "@brains/utils/zod";
import type {
  PlaybookBody,
  PlaybookState,
  PlaybookTransition,
} from "../entity";
import type { PlaybookRun } from "../run-store";
import {
  lifecycleConfigSchema,
  type LifecyclePlaybookConfig,
} from "./lifecycle-starters";

export interface LifecyclePlaybookConfigInput {
  trigger: string;
  playbookId: string;
  once?: boolean | undefined;
  starterText: string;
  description?: string | undefined;
  starterPrompt: string;
}

export interface PlaybooksConfig {
  lifecycle: Record<string, LifecyclePlaybookConfig>;
  triggers: Record<string, boolean>;
}

export interface PlaybooksConfigInput {
  lifecycle?: Record<string, LifecyclePlaybookConfigInput> | undefined;
  triggers?: Record<string, boolean> | undefined;
}

export interface LifecycleStartersRequest {
  lifecycle?: string | undefined;
  interfaceType: string;
  userPermissionLevel: "admin" | "trusted" | "public";
}

export interface PlaybookEntityMetadata extends Record<string, unknown> {
  title: string;
  status: "draft" | "active" | "archived";
  audience: "admin" | "trusted" | "public";
  trigger?: string | undefined;
  lifecycle?: string | undefined;
  once?: boolean | undefined;
  starterText?: string | undefined;
  description?: string | undefined;
  starterPrompt?: string | undefined;
  completionMode: "agent-confirmed" | "manual";
}

/**
 * The playbook shape carried in tool responses — deliberately narrower than
 * the stored `PlaybookEntity` from ./entity, which also carries base-entity
 * bookkeeping fields callers have no use for.
 */
export interface PlaybookStatusEntity extends Record<string, unknown> {
  id: string;
  entityType: "playbook";
  content: string;
  metadata: PlaybookEntityMetadata;
}

export interface ParsedPlaybook {
  entity: PlaybookStatusEntity;
  body: PlaybookBody;
  version: string;
}

export interface PlaybookStatusResponse {
  runs: PlaybookRun[];
  activeRun?: PlaybookRun | undefined;
  playbook?: PlaybookStatusEntity | undefined;
  body?: PlaybookBody | undefined;
  currentState?: PlaybookState | undefined;
  validEvents?: PlaybookTransition[] | undefined;
  operatorActions?: PlaybookTransition[] | undefined;
  blockedEvents?: PlaybookTransition[] | undefined;
  guidance?: string | undefined;
  cards?: ActionsCard[] | undefined;
  lifecycle: Record<string, LifecyclePlaybookConfig>;
}

export const playbooksConfigSchema: z.ZodType<
  PlaybooksConfig,
  PlaybooksConfigInput
> = z
  .object({
    lifecycle: z.record(z.string(), lifecycleConfigSchema).default({}),
    triggers: z.record(z.string(), z.boolean()).default({}),
  })
  .strict();

export const lifecycleStartersRequestSchema: z.ZodType<
  LifecycleStartersRequest,
  LifecycleStartersRequest
> = z
  .object({
    lifecycle: z.string().min(1).optional(),
    interfaceType: z.string().min(1),
    userPermissionLevel: z.enum(["admin", "trusted", "public"]),
  })
  .strict();

export const playbookStatusEntitySchema: z.ZodType<PlaybookStatusEntity> = z
  .object({
    id: z.string().min(1),
    entityType: z.literal("playbook"),
    content: z.string().min(1),
    metadata: z
      .object({
        title: z.string().min(1),
        status: z.enum(["draft", "active", "archived"]),
        audience: z.enum(["admin", "trusted", "public"]),
        trigger: z.string().min(1).optional(),
        lifecycle: z.string().min(1).optional(),
        once: z.boolean().optional(),
        starterText: z.string().min(1).optional(),
        description: z.string().min(1).optional(),
        starterPrompt: z.string().min(1).optional(),
        completionMode: z.enum(["agent-confirmed", "manual"]),
      })
      .passthrough(),
  })
  .passthrough();
