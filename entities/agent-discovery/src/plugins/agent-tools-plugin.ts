import {
  ATPROTO_BRAIN_CARD_CONFLICT,
  ATPROTO_BRAIN_DISCOVERED,
  atprotoBrainCardConflictPayloadSchema,
  atprotoBrainDiscoveryEventPayloadSchema,
} from "@brains/atproto-contracts";
import type { Plugin, ServicePluginContext, Tool } from "@brains/plugins";
import { ServicePlugin } from "@brains/plugins";
import { computeContentHash } from "@brains/utils/hash";
import { z } from "@brains/utils/zod";
import { createAgentConnectTool } from "../tools/agent-connect";
import {
  createAgentScanDirectoriesTool,
  scanAgentDirectories,
} from "../tools/agent-scan-directories";
import { createAgentSetTrustLevelTool } from "../tools/agent-set-trust-level";
import type { FetchFn } from "../lib/fetch-agent-card";
import packageJson from "../../package.json";

export interface AgentToolsConfig {
  /** Emit an operational notification when a directory scan discovers agents. */
  notifyOnNewAgents: boolean;
}

export interface AgentToolsConfigInput {
  /** Opt in to new-agent notifications. Daily scans remain enabled. */
  notifyOnNewAgents?: boolean | undefined;
}

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

type AtprotoNotificationCandidate = z.infer<
  typeof atprotoNotificationCandidateSchema
>;

const atprotoConflictNotificationSchema = z
  .object({
    domain: z.string().min(1),
    existingRepoDid: z.string().min(1).optional(),
    candidateRepoDid: z.string().min(1),
    observedAt: z.string().datetime(),
    reason: z.string().min(1),
  })
  .strict();

type AtprotoConflictNotification = z.infer<
  typeof atprotoConflictNotificationSchema
>;

export const agentToolsConfigSchema: z.ZodType<
  AgentToolsConfig,
  AgentToolsConfigInput
> = z
  .object({
    notifyOnNewAgents: z
      .boolean()
      .default(false)
      .describe("Notify when directory scans discover new agents"),
  })
  .strict();

export class AgentToolsPlugin extends ServicePlugin<
  AgentToolsConfig,
  AgentToolsConfigInput
> {
  private readonly fetchFn: FetchFn | undefined;

  constructor(fetchFn?: FetchFn, config: AgentToolsConfigInput = {}) {
    super("agent", packageJson, config, agentToolsConfigSchema);
    this.fetchFn = fetchFn;
  }

  protected override async onRegister(
    context: ServicePluginContext,
  ): Promise<void> {
    const atprotoNotifications =
      context.runtimeState.scoped<AtprotoNotificationCandidate>({
        namespace: "agent-discovery.atproto-notifications",
        schema: atprotoNotificationCandidateSchema,
      });
    const atprotoConflicts =
      context.runtimeState.scoped<AtprotoConflictNotification>({
        namespace: "agent-discovery.atproto-conflicts",
        schema: atprotoConflictNotificationSchema,
      });

    context.messaging.subscribe(ATPROTO_BRAIN_DISCOVERED, async (message) => {
      if (!this.config.notifyOnNewAgents) return { success: true };
      const payload = atprotoBrainDiscoveryEventPayloadSchema.parse(
        message.payload,
      );
      if (payload.status !== "discovered") return { success: true };
      const key = `candidate:${payload.cardCid ?? payload.repoDid ?? payload.agentId}`;
      await atprotoNotifications.setIfNotExists(key, {
        agentId: payload.agentId,
        name: payload.name,
        ...(payload.repoDid && { repoDid: payload.repoDid }),
        ...(payload.cardCid && { cardCid: payload.cardCid }),
        observedAt: new Date().toISOString(),
        status: "pending",
      });
      return { success: true };
    });

    context.messaging.subscribe(
      ATPROTO_BRAIN_CARD_CONFLICT,
      async (message) => {
        if (!this.config.notifyOnNewAgents) return { success: true };
        const payload = atprotoBrainCardConflictPayloadSchema.parse(
          message.payload,
        );
        const key = `conflict:${computeContentHash(
          `${payload.domain}\0${payload.existingRepoDid ?? ""}\0${payload.candidateRepoDid}`,
        )}`;
        await atprotoConflicts.setIfNotExists(key, payload);
        return { success: true };
      },
    );

    context.recurringChecks.register({
      id: "directory-scan",
      cadence: "daily",
      deliverAlerts: this.config.notifyOnNewAgents,
      run: async ({ signal }) => {
        const result = await scanAgentDirectories(
          context,
          this.fetchFn,
          signal,
        );
        if (!this.config.notifyOnNewAgents) return {};

        const alerts: Array<{
          dedupeKey: string;
          title: string;
          body: string;
        }> = [];
        if (result.created > 0) {
          const createdDomains = [...result.createdDomains].sort();
          const peers = [...result.introducingPeers].sort();
          const countLabel = `${result.created} agent${result.created === 1 ? "" : "s"}`;
          alerts.push({
            dedupeKey: `sightings:${computeContentHash(
              `${result.observedAt}\0${createdDomains.join("\0")}`,
            )}`,
            title: "New agent sightings",
            body: `${countLabel} sighted through ${peers.join(", ")}`,
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
          const overflow = pending.length > 5 ? ` +${pending.length - 5}` : "";
          const countLabel = `${pending.length} new agent${pending.length === 1 ? "" : "s"}`;
          const dedupeInput = pending.map((record) => record.key).join("\0");
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
            await atprotoConflicts.delete(record.key);
          }
        }

        return alerts.length > 0 ? { alerts } : {};
      },
    });
  }

  protected override async getTools(): Promise<Tool[]> {
    return [
      createAgentConnectTool(this.getContext(), this.fetchFn),
      createAgentScanDirectoriesTool(this.getContext(), this.fetchFn),
      createAgentSetTrustLevelTool(this.getContext(), this.fetchFn),
    ];
  }
}

export function agentToolsPlugin(config: AgentToolsConfigInput = {}): Plugin {
  return new AgentToolsPlugin(undefined, config);
}
