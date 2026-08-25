import {
  defineServicePlugin,
  type ServicePackageDefinition,
} from "@brains/sdk/services";
import { z } from "@brains/sdk/entities";
import { computeContentHash } from "@brains/utils/hash";
import { agent } from "./agent-entity";
import { skill } from "./skill-entity";
import { agentConnectTool } from "./tools/agent-connect";
import { agentScanDirectoriesTool } from "./tools/agent-scan-directories";
import { agentSetTrustLevelTool } from "./tools/agent-set-trust-level";
import { scanAgentDirectories } from "./tools/agent-scan-directories";
import { agentSightingsInbox } from "./inbox-source";
import { createSkillProjectionRule } from "./lib/skill-projection";
import { skillEvalHandlers } from "./lib/skill-eval-handlers";
import {
  atprotoConflicts,
  atprotoNotifications,
} from "./lib/atproto-notifications";

/**
 * What the directory scan has to say for itself.
 *
 * Spelled out rather than imported: the alert contract lives in an internal
 * package, and this one publishes.
 */
interface DirectoryAlert {
  dedupeKey: string;
  title: string;
  body: string;
  includeInInbox?: boolean | undefined;
}

export const agentDiscoveryConfigSchema: z.ZodObject<{
  notifyOnNewAgents: z.ZodDefault<z.ZodBoolean>;
  enableSkillDerivation: z.ZodDefault<z.ZodBoolean>;
}> = z
  .object({
    notifyOnNewAgents: z
      .boolean()
      .default(false)
      .describe("Notify when directory scans discover new agents"),
    enableSkillDerivation: z
      .boolean()
      .default(true)
      .describe("Derive skills from topic and agent evidence using AI"),
  })
  .strict();

export type AgentDiscoveryConfig = z.output<typeof agentDiscoveryConfigSchema>;
export type AgentDiscoveryConfigInput = z.input<
  typeof agentDiscoveryConfigSchema
>;

/**
 * The agent directory: who this brain knows, what they can do, and how it
 * found out.
 *
 * Agents and skills ship together because a skill has no meaning without the
 * agent advertising it — derivation reads agent evidence, and the directory
 * scan that discovers agents is the same act that surfaces their skills.
 */
export const agentDiscovery: ServicePackageDefinition<
  typeof agentDiscoveryConfigSchema
> = defineServicePlugin({
  // Plural: the entity type is "agent", and a service sharing that id would
  // scope to the same plugin name as the entity plugin the package installs.
  id: "agents",
  config: agentDiscoveryConfigSchema,
  entities: [agent, skill],
  tools: () => [
    agentConnectTool(),
    agentScanDirectoriesTool(),
    agentSetTrustLevelTool(),
  ],
  inbox: () => agentSightingsInbox,
  // A rule rather than an entity-side projection: whether skills are derived
  // at all is configured, and the entity slot is static.
  projectionRules: ({ config }) =>
    config.enableSkillDerivation ? [createSkillProjectionRule()] : [],
  evals: () => skillEvalHandlers(),
  checks: ({ config }) => [
    {
      id: "directory-scan",
      cadence: "daily",
      deliverAlerts: config.notifyOnNewAgents,
      run: async (context): Promise<{ alerts?: DirectoryAlert[] }> => {
        const result = await scanAgentDirectories(
          context,
          undefined,
          context.signal,
        );

        const alerts: DirectoryAlert[] = [];
        if (result.created > 0) {
          const createdDomains = [...result.createdDomains].sort();
          const peers = [...result.introducingPeers].sort();
          const visibleDomains = createdDomains.slice(0, 5).join(", ");
          const overflow =
            createdDomains.length > 5 ? ` +${createdDomains.length - 5}` : "";
          alerts.push({
            dedupeKey: `sightings:${computeContentHash(
              `${result.observedAt}\0${createdDomains.join("\0")}`,
            )}`,
            // The dedicated source projects each sighting with its entity and
            // decision actions; this rollup remains channel-only.
            includeInInbox: false,
            title: `${result.created} new agent sighting${result.created === 1 ? "" : "s"}`,
            body: `Found ${visibleDomains}${overflow}, introduced through ${peers.join(", ")}. Review in Agent sightings.`,
          });
        }

        // Only drained when it will actually be delivered. Recording happens
        // whether or not notifications are on — that is the point, so that
        // switching them on shows what was already found — and draining a
        // backlog nobody is told about would throw away the same history a
        // second way.
        if (!config.notifyOnNewAgents) {
          return alerts.length > 0 ? { alerts } : {};
        }

        const notifications = atprotoNotifications(context);
        const records = await notifications.list({ keyPrefix: "candidate:" });
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
          const overflow = pending.length > 5 ? ` +${pending.length - 5}` : "";
          const countLabel = `${pending.length} new agent${pending.length === 1 ? "" : "s"}`;
          const dedupeInput = pending.map((record) => record.key).join("\0");
          alerts.push({
            dedupeKey: `atproto:${computeContentHash(dedupeInput)}`,
            title: "New ATProto agents awaiting review",
            body: `${countLabel} awaiting review: ${names}${overflow}. Review: /agents?status=discovered`,
          });
          for (const record of pending) {
            await notifications.delete(record.key);
          }
        }

        const conflicts = atprotoConflicts(context);
        const conflictRecords = await conflicts.list({
          keyPrefix: "conflict:",
        });
        if (conflictRecords.length > 0) {
          const domains = [
            ...new Set(conflictRecords.map((record) => record.value.domain)),
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
            await conflicts.delete(record.key);
          }
        }

        return alerts.length > 0 ? { alerts } : {};
      },
    },
  ],
});

export default agentDiscovery;
