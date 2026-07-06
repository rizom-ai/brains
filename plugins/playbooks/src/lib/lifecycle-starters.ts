/**
 * Lifecycle Starters
 *
 * Registration and resolution of playbook lifecycle starters: entries
 * configured on the plugin, starters registered by other plugins over
 * messaging, and active playbooks discovered via enabled triggers.
 * Store/catalog access is injected so the registry is unit-testable.
 */

import type { LifecycleStarterRegistration } from "@brains/contracts";
import type { Logger } from "@brains/utils/logger";
import { z } from "@brains/utils/zod";

export const lifecycleConfigSchema = z
  .object({
    trigger: z.string().min(1),
    playbookId: z.string().min(1),
    once: z.boolean().default(true),
    starterText: z.string().min(1),
    description: z.string().min(1).optional(),
    starterPrompt: z.string().min(1),
  })
  .strict();

export type LifecyclePlaybookConfig = z.infer<typeof lifecycleConfigSchema>;

export interface PlaybookStarter {
  id: string;
  title: string;
  description?: string | undefined;
  playbookId: string;
  lifecycle: string;
  starterPrompt: string;
}

export interface LifecycleStartersResponse {
  starters: PlaybookStarter[];
}

export interface LifecycleStarterRegistrationResponse {
  registered: boolean;
  id: string;
  ignored?: boolean | undefined;
  reason?: string | undefined;
}

/** The slice of a parsed playbook the starter logic reads. */
export interface StarterPlaybook {
  entity: {
    id: string;
    metadata: {
      title: string;
      status: string;
      audience: string;
      trigger?: string | undefined;
      lifecycle?: string | undefined;
      once?: boolean | undefined;
      starterText?: string | undefined;
      description?: string | undefined;
      starterPrompt?: string | undefined;
    };
  };
  body: { purpose: string };
}

export interface LifecycleStarterRegistryDeps {
  logger: Logger;
  configuredLifecycle: Record<string, LifecyclePlaybookConfig>;
  triggers: Record<string, boolean>;
  findRunByLifecycle: (
    lifecycle: string,
  ) => Promise<{ status: string } | null | undefined>;
  getPlaybook: (playbookId: string) => Promise<StarterPlaybook | undefined>;
  listPlaybooks: () => Promise<StarterPlaybook[]>;
}

function sameLifecycleConfig(
  left: LifecyclePlaybookConfig,
  right: LifecyclePlaybookConfig,
): boolean {
  return (
    left.trigger === right.trigger &&
    left.playbookId === right.playbookId &&
    left.once === right.once &&
    left.starterText === right.starterText &&
    left.description === right.description &&
    left.starterPrompt === right.starterPrompt
  );
}

export class LifecycleStarterRegistry {
  private readonly registered = new Map<
    string,
    { source: string; config: LifecyclePlaybookConfig }
  >();

  constructor(private readonly deps: LifecycleStarterRegistryDeps) {}

  /**
   * Register a starter on behalf of another plugin. Identical
   * re-registrations are idempotent; conflicting ones are ignored with
   * a reason so the caller can surface it.
   */
  public register(
    registration: LifecycleStarterRegistration,
    source: string,
  ): LifecycleStarterRegistrationResponse {
    const existing = this.registered.get(registration.id);
    const config = lifecycleConfigSchema.parse({
      trigger: registration.trigger,
      playbookId: registration.playbookId,
      once: registration.once,
      starterText: registration.starterText,
      ...(registration.description
        ? { description: registration.description }
        : {}),
      starterPrompt: registration.starterPrompt,
    });

    if (existing) {
      if (
        existing.source === source &&
        sameLifecycleConfig(existing.config, config)
      ) {
        return { registered: true, id: registration.id };
      }

      this.deps.logger.warn("Ignoring conflicting playbook lifecycle starter", {
        id: registration.id,
        source,
        existingSource: existing.source,
      });
      return {
        registered: false,
        id: registration.id,
        ignored: true,
        reason: `Lifecycle starter '${registration.id}' is already registered by '${existing.source}'.`,
      };
    }

    this.registered.set(registration.id, { source, config });
    return { registered: true, id: registration.id };
  }

  public async resolveStarters(input: {
    lifecycle?: string | undefined;
    interfaceType: string;
    userPermissionLevel: "anchor" | "trusted" | "public";
  }): Promise<PlaybookStarter[]> {
    if (
      input.interfaceType !== "web-chat" ||
      input.userPermissionLevel !== "anchor"
    ) {
      return [];
    }

    const starters: PlaybookStarter[] = [];
    const seenLifecycleIds = new Set<string>();

    const entries = Object.entries(this.deps.configuredLifecycle).filter(
      ([id]) => !input.lifecycle || id === input.lifecycle,
    );

    for (const [id, lifecycle] of entries) {
      const starter = await this.resolveConfigured(id, lifecycle);
      if (!starter) continue;
      starters.push(starter);
      seenLifecycleIds.add(id);
    }

    for (const [id, registration] of this.registered) {
      if (input.lifecycle && id !== input.lifecycle) continue;
      if (seenLifecycleIds.has(id)) continue;
      const starter = await this.resolveConfigured(id, registration.config);
      if (!starter) continue;
      starters.push(starter);
      seenLifecycleIds.add(id);
    }

    const enabledTriggers = new Set(
      Object.entries(this.deps.triggers)
        .filter(([, enabled]) => enabled)
        .map(([trigger]) => trigger),
    );
    if (enabledTriggers.size === 0) return starters;

    for (const playbook of await this.deps.listPlaybooks()) {
      const metadata = playbook.entity.metadata;
      if (metadata.status !== "active" || metadata.audience !== "anchor") {
        continue;
      }
      const trigger = metadata.trigger;
      if (!trigger || !enabledTriggers.has(trigger)) continue;
      const lifecycle = metadata.lifecycle ?? playbook.entity.id;
      if (seenLifecycleIds.has(lifecycle)) continue;
      if (input.lifecycle && lifecycle !== input.lifecycle) continue;

      const existingRun = await this.deps.findRunByLifecycle(lifecycle);
      if (
        (metadata.once ?? true) &&
        (existingRun?.status === "completed" ||
          existingRun?.status === "dismissed")
      ) {
        continue;
      }

      starters.push({
        id: lifecycle,
        title: metadata.starterText ?? metadata.title,
        ...((metadata.description ?? playbook.body.purpose)
          ? { description: metadata.description ?? playbook.body.purpose }
          : {}),
        playbookId: playbook.entity.id,
        lifecycle,
        starterPrompt:
          metadata.starterPrompt ?? `Start the ${metadata.title} playbook.`,
      });
      seenLifecycleIds.add(lifecycle);
    }

    return starters;
  }

  private async resolveConfigured(
    id: string,
    lifecycle: LifecyclePlaybookConfig,
  ): Promise<PlaybookStarter | undefined> {
    const existingRun = await this.deps.findRunByLifecycle(id);
    if (
      lifecycle.once &&
      (existingRun?.status === "completed" ||
        existingRun?.status === "dismissed")
    ) {
      return undefined;
    }

    const playbook = await this.deps.getPlaybook(lifecycle.playbookId);
    if (playbook?.entity.metadata.status !== "active") return undefined;

    return {
      id,
      title: lifecycle.starterText,
      ...(lifecycle.description ? { description: lifecycle.description } : {}),
      playbookId: lifecycle.playbookId,
      lifecycle: id,
      starterPrompt: lifecycle.starterPrompt,
    };
  }
}
