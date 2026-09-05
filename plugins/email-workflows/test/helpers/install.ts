import type { JobHandler } from "@brains/job-queue";
import {
  bindPluginPackageMetadata,
  defineEntityPackage,
  instantiatePluginPackageDefinition,
  type EntityReactionContext,
  type Plugin,
  type PluginCapabilities,
} from "@brains/plugins";
import type { PluginTestHarness } from "@brains/plugins/test";
import { stubMethod } from "@brains/test-utils";
import emailWorkflowsPackage, {
  MailTriageOperatorService,
  mailTriageInbox,
  type MailThreadEntityAccess,
} from "../../src";
import { emailReplyDraft } from "../../src/reply-drafts/entity/definition";
import type { DraftOperatorContext } from "../../src/reply-drafts/operator";
import packageJson from "../../package.json";

export const PACKAGE_METADATA: { name: string; version: string } = {
  name: packageJson.name,
  version: packageJson.version,
};
export const SERVICE_PLUGIN_ID: string = `${packageJson.name}:email-workflows`;
export const ENTITY_PLUGIN_ID: string = `${packageJson.name}:mail-item`;
export const TRIAGE_JOB: string = `${SERVICE_PLUGIN_ID}:triage`;

/** The plugins the runtime builds from the package: the service and the mail-item entity. */
export function instantiate(config: unknown = {}): {
  service: Plugin;
  entity: Plugin;
} {
  bindPluginPackageMetadata(emailWorkflowsPackage, PACKAGE_METADATA);
  const plugins = instantiatePluginPackageDefinition(
    emailWorkflowsPackage,
    config,
    PACKAGE_METADATA,
  );
  const service = plugins.find(({ type }) => type === "service");
  const entity = plugins.find(({ type }) => type === "entity");
  if (!service || !entity) {
    throw new Error("Email workflows package did not produce both plugins");
  }
  return { service, entity };
}

/** Only the mail-item type, for tests that drive the operator code directly. */
export async function installMailItem(
  harness: PluginTestHarness,
): Promise<void> {
  await harness.installPlugin(instantiate().entity);
}

/**
 * Both plugins, with the triage job handler captured so a test can run it
 * the way the queue would.
 */
export async function installEmailWorkflows(
  harness: PluginTestHarness,
): Promise<{
  service: Plugin;
  capabilities: PluginCapabilities;
  runTriage: (input: unknown) => Promise<unknown>;
}> {
  const handlers = new Map<string, JobHandler>();
  const queue = harness.getMockShell().getJobQueueService();
  stubMethod(queue, "registerHandler", (name, handler) => {
    handlers.set(name, handler);
  });
  harness.getMockShell().getJobQueueService = (): typeof queue => queue;

  const { service, entity } = instantiate();
  await harness.installPlugin(entity);
  const capabilities = await harness.installPlugin(service);
  return {
    service,
    capabilities,
    runTriage: async (input): Promise<unknown> => {
      const handler = handlers.get(TRIAGE_JOB);
      if (!handler) throw new Error("Triage job handler was not registered");
      const { createMockProgressReporter } = await import("@brains/test-utils");
      return handler.process(
        input,
        "job-triage",
        createMockProgressReporter(),
        new AbortController().signal,
      );
    },
  };
}

/** The context a reaction of this package runs in, over the harness. */
export function reaction(harness: PluginTestHarness): EntityReactionContext {
  return harness.getReactionContext(SERVICE_PLUGIN_ID, [
    "mail-item",
    "email-reply-draft",
  ]);
}

export function mailEntities(
  harness: PluginTestHarness,
): MailThreadEntityAccess {
  return reaction(harness).entities;
}

export function operatorFor(
  harness: PluginTestHarness,
): MailTriageOperatorService {
  const context = reaction(harness);
  return new MailTriageOperatorService({
    entities: context.entities,
    permissions: context.permissions,
  });
}

/**
 * The inbox declaration bound to the harness, with the declaration's
 * context-taking methods closed over so a test reads like the inbox does.
 */
export function inboxSource(
  harness: PluginTestHarness,
  threadOrdinals: { isReady(): Promise<boolean> } = {
    isReady: async (): Promise<boolean> => true,
  },
): {
  sourceId: string;
  displayName: string;
  facets: ReturnType<typeof mailTriageInbox>["facets"];
  list: () => ReturnType<ReturnType<typeof mailTriageInbox>["list"]>;
  act: (
    itemId: string,
    actionId: string,
    actor: { permissionLevel: "admin" | "trusted" | "public" },
  ) => Promise<void>;
  resolveDetail: (
    itemId: string,
    actor: { permissionLevel: "admin" | "trusted" | "public" },
    signal: AbortSignal,
  ) => Promise<unknown>;
} {
  const declaration = mailTriageInbox({ threadOrdinals });
  return {
    sourceId: declaration.sourceId,
    displayName: declaration.displayName,
    facets: declaration.facets,
    list: () => declaration.list(reaction(harness)),
    act: (itemId, actionId, actor) =>
      declaration.act(reaction(harness), itemId, actionId, actor),
    resolveDetail: (itemId, actor, signal): Promise<unknown> => {
      if (!declaration.resolveDetail) {
        throw new Error("Inbox declares no detail view");
      }
      return declaration.resolveDetail(
        reaction(harness),
        itemId,
        actor,
        signal,
      );
    },
  };
}

/** Both entity types the drafting operator writes, as a stand-in package. */
export async function installReplyDraftEntities(
  harness: PluginTestHarness,
): Promise<void> {
  await installMailItem(harness);
  for (const plugin of instantiatePluginPackageDefinition(
    defineEntityPackage({ id: "reply-drafts", entities: [emailReplyDraft] }),
    {},
    { name: "@fixture/reply-drafts", version: "0.1.0" },
  )) {
    await harness.installPlugin(plugin);
  }
}

export function draftContext(harness: PluginTestHarness): DraftOperatorContext {
  const context = reaction(harness);
  return {
    entities: context.entities,
    permissions: context.permissions,
    channels: harness.getServiceContext(SERVICE_PLUGIN_ID).channels,
  };
}
