import { channelLabel, formatShortDate } from "@brains/action-items";
import { defineDashboardWidget } from "@brains/sdk/services";
import type {
  ContentVisibility,
  ServiceRuntime,
} from "@brains/sdk/internal/service-runtime";
import { z } from "@brains/utils/zod";
import type { MemoryEntityService } from "../memory-context";
import type { MemorySource } from "../../schemas/conversation-memory";
import { formatTimeRange } from "./format";
import { listBlockItems, listItemOf } from "./list-item";

const MAX_ITEMS = 6;

/** A decision or an insight, as far as a widget lists one. */
interface Claim {
  readonly id: string;
  readonly content: string;
  readonly created: string;
  readonly metadata: MemorySource;
}

export const claimListDataSchema: z.ZodObject<{
  items: z.ZodArray<
    z.ZodObject<{
      id: z.ZodString;
      name: z.ZodString;
      description: z.ZodOptional<z.ZodString>;
      meta: z.ZodArray<z.ZodString>;
      status: z.ZodEnum<{ active: "active"; superseded: "superseded" }>;
    }>
  >;
}> = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      description: z.string().optional(),
      meta: z.array(z.string()),
      status: z.enum(["active", "superseded"]),
    }),
  ),
});

export type ClaimListData = z.output<typeof claimListDataSchema>;

function statusOrder(status: MemorySource["status"]): number {
  return status === "active" ? 0 : 1;
}

/** When it was said: the end of its messages, or when it was recorded by hand. */
function saidAt(claim: Claim): string {
  return claim.metadata.timeRange?.end ?? claim.created;
}

/** Where and when: the channel when it came from one, and the day or days. */
function claimMeta(claim: Claim): string[] {
  const { channelId, channelName, timeRange } = claim.metadata;
  return [
    ...(channelId ? [channelLabel(channelName, channelId)] : []),
    timeRange ? formatTimeRange(timeRange) : formatShortDate(claim.created),
  ];
}

/** The most recent claims, what still holds first, newest first. */
export function claimListData(claims: readonly Claim[]): ClaimListData {
  const sorted = [...claims].sort((a, b) => {
    const statusDiff =
      statusOrder(a.metadata.status) - statusOrder(b.metadata.status);
    if (statusDiff !== 0) return statusDiff;
    return saidAt(b).localeCompare(saidAt(a));
  });
  return {
    items: sorted.slice(0, MAX_ITEMS).map((claim) => ({
      ...listItemOf(claim, claimMeta(claim)),
      status: claim.metadata.status,
    })),
  };
}

/**
 * Register a Dashboard widget listing the brain's recent decisions or
 * insights: one list, what still holds badged apart from what was
 * superseded.
 */
export function registerClaimListWidget(
  runtime: Pick<ServiceRuntime, "dashboardWidget">,
  widget: {
    id: string;
    title: string;
    priority: number;
    /** What the list says when there is nothing to list. */
    empty: string;
    load: (visibilityScope: ContentVisibility) => Promise<ClaimListData>;
  },
): void {
  runtime.dashboardWidget({
    definition: defineDashboardWidget({
      id: widget.id,
      title: widget.title,
      group: "knowledge",
      placement: "secondary",
      priority: widget.priority,
      permission: "public",
      data: claimListDataSchema,
      view: ({ data }) => ({
        blocks: [
          {
            type: "list",
            id: widget.id,
            empty: widget.empty,
            items: listBlockItems(data.items, (status) =>
              status === "active" ? "good" : "neutral",
            ),
          },
        ],
      }),
    }),
    load: ({ visibilityScope, signal }) => {
      signal.throwIfAborted();
      return widget.load(visibilityScope);
    },
  });
}

export interface ClaimReader {
  readonly entityService: Pick<MemoryEntityService, "listEntities">;
}
