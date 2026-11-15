import {
  atprotoBrainCardConflictChannel,
  atprotoBrainDiscoveredChannel,
} from "@brains/atproto-contracts";
import {
  defineServicePlugin,
  z,
  type ServicePackageDefinition,
} from "@brains/sdk/services";
import {
  serviceRuntime,
  withTools,
} from "@brains/sdk/internal/service-runtime";
import { computeContentHash } from "@brains/utils/hash";
import { agentEntity } from "./agent-entity";
import { derivedSkill, skill } from "./skill-entity";
import { agentContextOf, type AgentNetwork } from "./lib/agent-context";
import { agentDataSource } from "./datasources/agent-datasource";
import { proximityMapDataSource } from "./datasources/proximity-map-datasource";
import { registerAgentNetworkDashboardWidget } from "./lib/agent-dashboard";
import {
  refreshKnownAgentCards,
  registerAtprotoBrainCardHandlers,
} from "./lib/atproto-card-events";
import { getAgentDiscoveryInstructions } from "./lib/agent-instructions";
import { getTemplates } from "./lib/register-templates";
import { registerSkillsDashboardWidget } from "./lib/skill-dashboard";
import { registerSkillEvalHandlers } from "./lib/skill-eval-handlers";
import { skillDerivationTemplate } from "./templates/skill-derivation-template";
import { SKILL_DERIVATION_TEMPLATE_NAME } from "./lib/constants";
import { createAgentConnectTool } from "./tools/agent-connect";
import {
  createAgentScanDirectoriesTool,
  scanAgentDirectories,
} from "./tools/agent-scan-directories";
import { createAgentSetTrustLevelTool } from "./tools/agent-set-trust-level";
import { createNetworkAskTool } from "./tools/network-ask";
import { AgentSightingsInboxSource } from "./inbox-source";

const atprotoNotificationCandidateSchema = z
  .object({
    agentId: z.string().min(1),
    name: z.string().min(1),
    repoDid: z.string().min(1).optional(),
    cardCid: z.string().min(1).optional(),
    observedAt: z.string().datetime(),
    status: z.enum(["pending", "notified"]),
  })
  .strict();

const atprotoConflictNotificationSchema = z
  .object({
    domain: z.string().min(1),
    existingRepoDid: z.string().min(1).optional(),
    candidateRepoDid: z.string().min(1),
    observedAt: z.string().datetime(),
    reason: z.string().min(1),
  })
  .strict();

export const agentToolsConfigSchema: z.ZodObject<{
  notifyOnNewAgents: z.ZodDefault<z.ZodBoolean>;
}> = z
  .object({
    notifyOnNewAgents: z
      .boolean()
      .default(false)
      .describe("Notify when directory scans discover new agents"),
  })
  .strict();

/** Opt in to new-agent notifications. Daily scans remain enabled. */
export type AgentToolsConfigInput = z.input<typeof agentToolsConfigSchema>;
/** Whether an operational notification is emitted when a directory scan discovers agents. */
export type AgentToolsConfig = z.output<typeof agentToolsConfigSchema>;

const emptyConfigSchema: z.ZodObject<Record<string, never>> = z.object({});

/** The agents capability's packages, reaching other brains as `network` says. */
export interface AgentDiscoveryPackages {
  /** The agent type, its directory, card events, card refresh and widgets. */
  readonly agentDiscovery: ServicePackageDefinition<typeof emptyConfigSchema>;
  /** The agent tools, the sightings Inbox source and the directory scan. */
  readonly agentTools: ServicePackageDefinition<typeof agentToolsConfigSchema>;
  /** The skill type with its derivation rule, its template, widget and eval. */
  readonly derivedSkill: ServicePackageDefinition<typeof emptyConfigSchema>;
  /** The skill type with derivation off. */
  readonly skill: ServicePackageDefinition<typeof emptyConfigSchema>;
}

/**
 * The agent directory, as three packages under the ids its three classes
 * had: agent-discovery (the agent type's own, which the organization site
 * depends on), the agent tools service agent, and skill. Each installs its
 * type apart from the service, under the id the composer names.
 */
export function createAgentDiscoveryPackages(
  network: AgentNetwork = {},
): AgentDiscoveryPackages {
  const agent = agentEntity(network.fetch);

  const agentDiscovery = defineServicePlugin(
    {
      id: "agent-discovery",
      config: emptyConfigSchema,
      entities: [agent],
      setup: async (setupContext): Promise<Record<never, never>> => {
        const runtime = serviceRuntime(setupContext);
        const context = agentContextOf(runtime);
        // Brains no longer copy what other brains publish; delete the pieces
        // a brain kept before, with their files.
        await runtime.entityMutations.purgeEntityType("network-piece");
        for (const [name, template] of Object.entries(getTemplates())) {
          runtime.template(name, template);
        }
        runtime.dataSource(agentDataSource(agent));
        runtime.dataSource(proximityMapDataSource);
        registerAtprotoBrainCardHandlers(runtime, context);
        runtime.recurringCheck({
          id: "agent-card-refresh",
          cadence: "daily",
          deliverAlerts: false,
          run: async ({ signal }) => {
            await refreshKnownAgentCards(
              context,
              network.fetch,
              signal,
              new Date().toISOString(),
              network.resolveHostname,
            );
            return {};
          },
        });
        registerAgentNetworkDashboardWidget(runtime, context);
        return {};
      },
    },
    {
      instructions: () =>
        [
          getAgentDiscoveryInstructions(),
          'Agent approval/archive is a status field update on `entityType: "agent"`.',
        ].join("\n"),
    },
  );

  const agentTools = withTools(
    defineServicePlugin({
      id: "agent",
      config: agentToolsConfigSchema,
      setup: (setupContext): Record<never, never> => {
        const runtime = serviceRuntime(setupContext);
        const context = agentContextOf(runtime);
        const { config } = setupContext;
        const atprotoNotifications = runtime.classRuntimeState.scoped({
          namespace: "agent-discovery.atproto-notifications",
          schema: atprotoNotificationCandidateSchema,
        });
        const atprotoConflicts = runtime.classRuntimeState.scoped({
          namespace: "agent-discovery.atproto-conflicts",
          schema: atprotoConflictNotificationSchema,
        });

        runtime.inboxSource(new AgentSightingsInboxSource(context));

        runtime.listen(atprotoBrainDiscoveredChannel, async ({ payload }) => {
          if (!config.notifyOnNewAgents) return;
          if (payload.status !== "discovered") return;
          const key = `candidate:${payload.cardCid ?? payload.repoDid ?? payload.agentId}`;
          await atprotoNotifications.setIfNotExists(key, {
            agentId: payload.agentId,
            name: payload.name,
            ...(payload.repoDid && { repoDid: payload.repoDid }),
            ...(payload.cardCid && { cardCid: payload.cardCid }),
            observedAt: new Date().toISOString(),
            status: "pending",
          });
        });

        runtime.listen(atprotoBrainCardConflictChannel, async ({ payload }) => {
          if (!config.notifyOnNewAgents) return;
          const key = `conflict:${computeContentHash(
            `${payload.domain}\0${payload.existingRepoDid ?? ""}\0${payload.candidateRepoDid}`,
          )}`;
          await atprotoConflicts.setIfNotExists(key, payload);
        });

        runtime.recurringCheck({
          id: "directory-scan",
          cadence: "daily",
          deliverAlerts: config.notifyOnNewAgents,
          run: async ({ signal }) => {
            const result = await scanAgentDirectories(
              context,
              network.fetch,
              signal,
            );

            const alerts: Array<{
              dedupeKey: string;
              title: string;
              body: string;
              includeInInbox?: boolean | undefined;
            }> = [];
            if (result.created > 0) {
              const createdDomains = [...result.createdDomains].sort();
              const peers = [...result.introducingPeers].sort();
              const visibleDomains = createdDomains.slice(0, 5).join(", ");
              const overflow =
                createdDomains.length > 5
                  ? ` +${createdDomains.length - 5}`
                  : "";
              alerts.push({
                dedupeKey: `sightings:${computeContentHash(
                  `${result.observedAt}\0${createdDomains.join("\0")}`,
                )}`,
                // The dedicated source projects each sighting with its entity
                // and decision actions; this rollup remains channel-only.
                includeInInbox: false,
                title: `${result.created} new agent sighting${result.created === 1 ? "" : "s"}`,
                body: `Found ${visibleDomains}${overflow}, introduced through ${peers.join(", ")}. Review in Agent sightings.`,
              });
            }

            const records = await atprotoNotifications.list({
              keyPrefix: "candidate:",
            });
            const pending = records
              .filter((record) => record.value.status === "pending")
              .sort((left, right) =>
                left.value.observedAt.localeCompare(right.value.observedAt),
              );
            if (pending.length > 0) {
              const names = pending
                .slice(0, 5)
                .map((record) => record.value.name)
                .join(", ");
              const overflow =
                pending.length > 5 ? ` +${pending.length - 5}` : "";
              const countLabel = `${pending.length} new agent${pending.length === 1 ? "" : "s"}`;
              const dedupeInput = pending
                .map((record) => record.key)
                .join("\0");
              alerts.push({
                dedupeKey: `atproto:${computeContentHash(dedupeInput)}`,
                title: "New ATProto agents awaiting review",
                body: `${countLabel} awaiting review: ${names}${overflow}. Review: /agents?status=discovered`,
              });
              for (const record of pending) {
                await atprotoNotifications.delete(record.key);
              }
            }

            const conflictRecords = await atprotoConflicts.list({
              keyPrefix: "conflict:",
            });
            if (conflictRecords.length > 0) {
              const domains = [
                ...new Set(
                  conflictRecords.map((record) => record.value.domain),
                ),
              ].sort();
              alerts.push({
                dedupeKey: `atproto-conflict:${computeContentHash(
                  conflictRecords
                    .map((record) => record.key)
                    .sort()
                    .join("\0"),
                )}`,
                title: "ATProto identity conflict",
                body: `${conflictRecords.length} conflicting repo claim${conflictRecords.length === 1 ? "" : "s"} blocked for ${domains.join(", ")}. Existing approvals were preserved.`,
              });
              for (const record of conflictRecords) {
                await atprotoConflicts.delete(record.key);
              }
            }

            return alerts.length > 0 ? { alerts } : {};
          },
        });
        return {};
      },
    }),
    (slotContext) => {
      const context = agentContextOf(serviceRuntime(slotContext));
      return [
        createAgentConnectTool(context, network.fetch),
        createAgentScanDirectoriesTool(context, network.fetch),
        createAgentSetTrustLevelTool(context, network.fetch),
        createNetworkAskTool(context),
      ];
    },
  );

  const skillService = (
    type: typeof skill,
  ): ServicePackageDefinition<typeof emptyConfigSchema> =>
    defineServicePlugin({
      // Installed under the skill class's id, skill, its type apart.
      id: "skills",
      config: emptyConfigSchema,
      entities: [type],
      setup: (setupContext): Record<never, never> => {
        const runtime = serviceRuntime(setupContext);
        const context = agentContextOf(runtime);
        runtime.template(
          SKILL_DERIVATION_TEMPLATE_NAME,
          skillDerivationTemplate,
        );
        registerSkillsDashboardWidget(runtime, context);
        registerSkillEvalHandlers(runtime, context);
        return {};
      },
    });

  return {
    agentDiscovery,
    agentTools,
    derivedSkill: skillService(derivedSkill),
    skill: skillService(skill),
  };
}

const packages: AgentDiscoveryPackages = createAgentDiscoveryPackages();

/** The agent directory's packages, reaching other brains through the globals. */
export const agentDiscoveryPackage: AgentDiscoveryPackages["agentDiscovery"] =
  packages.agentDiscovery;
export const agentToolsPackage: AgentDiscoveryPackages["agentTools"] =
  packages.agentTools;
export const derivedSkillPackage: AgentDiscoveryPackages["derivedSkill"] =
  packages.derivedSkill;
export const skillPackage: AgentDiscoveryPackages["skill"] = packages.skill;
