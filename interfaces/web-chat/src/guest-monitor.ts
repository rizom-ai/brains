import { createHash } from "node:crypto";
import type {
  BoundStudioWorkspace,
  AnyStudioWorkspaceDefinition,
} from "@brains/sdk/interfaces";
import {
  defineStudioWorkspace,
  defineWorkspaceAction,
  type OperatorBindingContext,
} from "@brains/sdk/interfaces";
import { z } from "@brains/utils/zod";
import {
  type NoteCaptureRequest,
  type NoteCaptureResponse,
} from "@brains/contracts";
import type { GuestAccessControl } from "./guest-access-control";
import type { GuestUsageBounds } from "./guest-policy";
import {
  guestUsageDenialReasonSchema,
  guestUsageStateSchema,
  type GuestUsageDenialReason,
  type GuestUsageEvent,
  type GuestUsageRecord,
} from "./guest-usage-record";

const RECENT = 20;
const VISITORS = 10;
const QUESTION_CELL = 280;
const count = z.number().int().nonnegative();

const periodSchema = z.object({
  questions: count,
  measuredMicroUsd: count,
  unknownCost: count,
  unresolved: count,
  unresolvedReservedMicroUsd: count,
});
type Period = z.output<typeof periodSchema>;

const monitorDataSchema = z.object({
  door: z.object({
    /** A runtime-activated door the owner switches here; otherwise configuration owns it. */
    switchable: z.boolean(),
    open: z.boolean(),
    ready: z.boolean(),
    /** The owner's monthly budget; zero until one is set. */
    budgetMicroUsd: count,
    /** This month's charge: quotes in flight and measured costs. */
    chargedMicroUsd: count,
    quoteMicroUsd: count,
  }),
  today: periodSchema,
  month: periodSchema,
  recent: z
    .array(
      z.object({
        id: z.string(),
        openedAt: count,
        state: guestUsageStateSchema,
        question: z.string().optional(),
        cost: z.string(),
      }),
    )
    .max(RECENT),
  visitors: z
    .array(z.object({ visitor: z.string(), questions: count }))
    .max(VISITORS),
  denials: z.array(
    z.object({
      reason: guestUsageDenialReasonSchema,
      detailed: count,
      counted: count,
    }),
  ),
  detailedDenials: count,
  maxDetailedDenials: count,
  recording: z.object({
    status: z.enum(["healthy", "degraded", "unhealthy"]),
    message: z.string(),
    records: count,
    maxRecords: count,
    storedBytes: count,
    maxStoredBytes: count,
    retentionDays: count,
  }),
  canSaveQuestions: z.boolean(),
});
type MonitorData = z.output<typeof monitorDataSchema>;

/** Opens guest chat with a monthly budget, or changes the budget while open. */
const switchOnAction = defineWorkspaceAction({
  name: "switch-on",
  label: "Open guest chat",
  permission: "admin",
  confirmation: { kind: "prepared" },
  input: z.object({ monthlyUsd: z.number().min(0.5).max(10_000) }),
  output: z.object({ open: z.boolean() }),
});
/** The kill switch: one step, never behind a confirmation. */
const switchOffAction = defineWorkspaceAction({
  name: "switch-off",
  label: "Close guest chat",
  permission: "admin",
  input: z.object({}),
  output: z.object({ open: z.boolean() }),
});
const saveQuestionAction = defineWorkspaceAction({
  name: "save-question",
  label: "Save as note",
  permission: "admin",
  confirmation: { kind: "prepared" },
  input: z.object({ recordId: z.string().regex(/^[a-f0-9]{64}$/) }),
  output: z.object({ noteId: z.string() }),
});

const denialLabels: Record<GuestUsageDenialReason, string> = {
  unavailable: "Guest chat unavailable",
  "invalid-input": "Invalid question",
  "conversation-unavailable": "Conversation gone",
  "submission-conflict": "Conflicting resend",
  "visitor-busy": "Visitor already waiting",
  "deployment-busy": "Guest chat busy",
  "visitor-rate-limit": "Visitor over their limit",
  "deployment-rate-limit": "Guest chat over its limit",
  "conversation-limit": "Conversation too long",
  "budget-exhausted": "Allowance used up",
  forbidden: "Refused origin",
  method: "Wrong method",
  "media-type": "Not JSON",
  "invalid-request": "Malformed request",
  oversized: "Too large",
  "not-found": "Unknown conversation",
  closed: "Guest chat closed",
  "record-full": "Record full",
  "record-unavailable": "Record unavailable",
};

const outcomeLabels: Record<GuestUsageEvent["state"], string> = {
  pending: "Not admitted",
  unresolved: "Unresolved",
  completed: "Answered",
  failed: "Failed",
};

function money(microUsd: number): string {
  return `$${(microUsd / 1_000_000).toFixed(4)}`;
}

/** A budget in whole cents. */
function dollars(microUsd: number): string {
  return `$${(microUsd / 1_000_000).toFixed(2)}`;
}

/** The budget form, prefilled with the budget already set. */
function budgetForm(door: MonitorData["door"]): {
  input: { monthlyUsd: number };
  form: {
    presentation: "disclosure";
    submitLabel: string;
    fields: { monthlyUsd: { label: string; control: "number" } };
  };
} {
  return {
    input: {
      monthlyUsd:
        door.budgetMicroUsd > 0 ? door.budgetMicroUsd / 1_000_000 : 10,
    },
    form: {
      presentation: "disclosure",
      submitLabel: door.open ? "Change budget" : "Open guest chat",
      fields: {
        monthlyUsd: { label: "Monthly budget (USD)", control: "number" },
      },
    },
  };
}

function period(events: GuestUsageEvent[], since: number): Period {
  const admitted = events.filter(
    (event) => event.state !== "pending" && event.openedAt >= since,
  );
  const unresolved = admitted.filter((event) => event.state === "unresolved");
  return {
    questions: admitted.length,
    measuredMicroUsd: admitted.reduce(
      (sum, event) =>
        sum + (event.cost?.state === "known" ? event.cost.microUsd : 0),
      0,
    ),
    unknownCost: admitted.filter((event) => event.cost?.state === "unknown")
      .length,
    unresolved: unresolved.length,
    unresolvedReservedMicroUsd: unresolved.reduce(
      (sum, event) => sum + (event.reservedMicroUsd ?? 0),
      0,
    ),
  };
}

const guestMonitor = defineStudioWorkspace({
  id: "guest-chat",
  label: "Guest chat",
  priority: 80,
  permission: "admin",
  data: monitorDataSchema,
  actions: [switchOnAction, switchOffAction, saveQuestionAction],
  view: ({ data }) => {
    const door = data.door;
    const month = data.month;
    return {
      kicker: "Public questions",
      title: "Guest chat",
      description:
        "What visitors asked, what it cost, and the switch that stops it.",
      status: {
        label: door.open ? "Guest chat is on" : "Guest chat is off",
        tone: door.open ? "good" : "neutral",
      },
      blocks: [
        {
          type: "stats",
          id: "guest-numbers",
          items: [
            {
              label: "Questions today",
              value: data.today.questions,
              caption: `${month.questions} this month`,
            },
            {
              label: "Measured cost today",
              value: money(data.today.measuredMicroUsd),
              caption: `Measured from provider usage; ${money(month.measuredMicroUsd)} this month`,
            },
            {
              label: "Cost unknown",
              value: month.unknownCost,
              caption: "This month, settled without usable provider usage",
            },
            {
              label: "Unresolved",
              value: month.unresolved,
              caption: `${money(month.unresolvedReservedMicroUsd)} reserved, outcome not known`,
              tone: month.unresolved > 0 ? "warn" : "neutral",
            },
          ],
        },
        ...(door.switchable
          ? [
              ...(door.budgetMicroUsd > 0
                ? [
                    {
                      type: "meters" as const,
                      id: "guest-budget",
                      items: [
                        {
                          id: "month",
                          label: "This month",
                          value:
                            Math.min(
                              door.chargedMicroUsd,
                              door.budgetMicroUsd,
                            ) / 1_000_000,
                          max: door.budgetMicroUsd / 1_000_000,
                          unit: "USD",
                        },
                      ],
                    },
                  ]
                : []),
              {
                type: "notice" as const,
                id: "guest-budget-note",
                text: `Each question reserves ${dollars(door.quoteMicroUsd)} until its cost is measured; the rest returns to the budget. The budget starts over on the 1st of each month (UTC).`,
              },
              {
                type: "actions" as const,
                id: "guest-switch",
                items: door.open
                  ? [
                      { action: switchOffAction, input: {} },
                      {
                        action: switchOnAction,
                        label: "Change budget",
                        ...budgetForm(door),
                      },
                    ]
                  : [
                      {
                        action: switchOnAction,
                        ...budgetForm(door),
                        disabled: !door.ready,
                      },
                    ],
              },
            ]
          : []),
        {
          type: "key-values",
          id: "guest-recording",
          items: [
            { label: "Recording", value: data.recording.message },
            {
              label: "Kept for",
              value: `${data.recording.retentionDays} days`,
            },
            {
              label: "Records",
              value: `${data.recording.records} of ${data.recording.maxRecords}`,
            },
            {
              label: "Question text",
              value: `${data.recording.storedBytes} of ${data.recording.maxStoredBytes} bytes`,
            },
          ],
        },
        {
          type: "table",
          id: "guest-recent",
          empty: "No guest questions yet.",
          columns: [
            { key: "when", label: "When" },
            { key: "question", label: "Question" },
            { key: "outcome", label: "Outcome" },
            { key: "cost", label: "Cost" },
          ],
          rows: data.recent.map((event) => ({
            id: event.id,
            cells: {
              when: new Date(event.openedAt).toISOString(),
              question: event.question ?? "Not recorded",
              outcome: outcomeLabels[event.state],
              cost: event.cost,
            },
            ...(data.canSaveQuestions && event.question
              ? {
                  actions: [
                    {
                      action: saveQuestionAction,
                      input: { recordId: event.id },
                    },
                  ],
                }
              : {}),
          })),
        },
        {
          type: "table",
          id: "guest-denials",
          empty: "No refusals recorded.",
          columns: [
            { key: "reason", label: "Refused because" },
            { key: "detailed", label: "Kept in detail" },
            { key: "counted", label: "Counted by day" },
          ],
          rows: data.denials.map((denial) => ({
            id: denial.reason,
            cells: {
              reason: denialLabels[denial.reason],
              detailed: denial.detailed,
              counted: denial.counted,
            },
          })),
        },
        ...(data.detailedDenials >= data.maxDetailedDenials
          ? [
              {
                type: "notice" as const,
                id: "guest-denials-aggregated",
                tone: "warn" as const,
                text: `Detailed refusals are full (${data.detailedDenials} kept); further refusals are only counted, by day and reason.`,
              },
            ]
          : []),
        {
          type: "table",
          id: "guest-visitors",
          empty: "No visitors in the record.",
          columns: [
            { key: "visitor", label: "Visitor" },
            { key: "questions", label: "Questions" },
          ],
          rows: data.visitors.map((visitor) => ({
            id: visitor.visitor,
            cells: visitor,
          })),
        },
        {
          type: "text",
          id: "guest-window",
          text: `Recent questions and visitors cover only what the record still keeps: the last ${data.recording.retentionDays} days.`,
        },
      ],
    };
  },
});

export interface GuestMonitorDeps {
  record: GuestUsageRecord;
  bounds: GuestUsageBounds;
  /** Present when the door is switched at runtime rather than configured. */
  control: GuestAccessControl | undefined;
  /** Whether configured guest chat is open when there is no switch. */
  configuredOpen: () => boolean;
  /** Keeps the Ask box's availability in step after a switch. */
  afterSwitch: () => Promise<void>;
  canSaveQuestions: () => boolean;
  capture: (request: NoteCaptureRequest) => Promise<NoteCaptureResponse>;
}

async function load(deps: GuestMonitorDeps): Promise<MonitorData> {
  const { record, bounds, control } = deps;
  const now = new Date();
  const today = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );
  const month = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
  const [events, denials, days, health, status] = await Promise.all([
    record.list(bounds.maxRecords),
    record.denials(bounds.maxDenialRecords),
    record.denialCounts(),
    record.health(),
    control?.status(),
  ]);
  const reasons = [
    ...new Set<GuestUsageDenialReason>([
      ...denials.map((denial) => denial.reason),
      ...days.flatMap((day) =>
        Object.keys(day.counts).flatMap((key) => {
          const reason = guestUsageDenialReasonSchema.safeParse(key);
          return reason.success ? [reason.data] : [];
        }),
      ),
    ]),
  ];
  const visitors = Object.entries(
    events.reduce<Record<string, number>>((tally, event) => {
      if (!event.visitor || event.state === "pending") return tally;
      const short = event.visitor.slice(0, 8);
      return { ...tally, [short]: (tally[short] ?? 0) + 1 };
    }, {}),
  )
    .sort(([a, x], [b, y]) => y - x || a.localeCompare(b))
    .slice(0, VISITORS)
    .map(([visitor, questions]) => ({ visitor, questions }));
  return {
    door: {
      switchable: status !== undefined,
      open: status ? status.enabled : deps.configuredOpen(),
      ready: status?.ready ?? true,
      budgetMicroUsd: status?.budgetMicroUsd ?? 0,
      chargedMicroUsd: status?.chargedMicroUsd ?? 0,
      quoteMicroUsd: status?.quoteMicroUsd ?? 0,
    },
    today: period(events, today),
    month: period(events, month),
    recent: events
      .filter((event) => event.state !== "pending")
      .slice(0, RECENT)
      .map((event) => ({
        id: event.id,
        openedAt: event.openedAt,
        state: event.state,
        ...(event.question
          ? {
              question:
                event.question.length > QUESTION_CELL
                  ? `${event.question.slice(0, QUESTION_CELL)}…`
                  : event.question,
            }
          : {}),
        cost:
          event.cost?.state === "known"
            ? money(event.cost.microUsd)
            : event.state === "unresolved"
              ? "Not settled"
              : "Unknown",
      })),
    visitors,
    denials: reasons.map((reason) => ({
      reason,
      detailed: denials.filter((denial) => denial.reason === reason).length,
      counted: days.reduce((sum, day) => sum + (day.counts[reason] ?? 0), 0),
    })),
    detailedDenials: denials.length,
    maxDetailedDenials: bounds.maxDenialRecords,
    recording: {
      status: health.status,
      message: health.message,
      records: health.details?.["records"] ?? 0,
      maxRecords: bounds.maxRecords,
      storedBytes: health.details?.["storedBytes"] ?? 0,
      maxStoredBytes: bounds.maxStoredBytes,
      retentionDays: Math.ceil(bounds.retentionSeconds / 86_400),
    },
    canSaveQuestions: deps.canSaveQuestions(),
  };
}

function digest(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

/**
 * The owner's view of the public endpoint: what visitors asked and what it
 * cost, refusals by reason, the record's health, and the switch beside them.
 * Admin only. Reading it never saves anything; a question becomes a note only
 * through its own confirmed action.
 */
export function bindGuestMonitor<TConfig, TState extends object>(
  binding: OperatorBindingContext<TConfig, TState, undefined>,
  deps: GuestMonitorDeps,
): BoundStudioWorkspace<
  AnyStudioWorkspaceDefinition,
  TConfig,
  TState,
  undefined
> {
  return guestMonitor.bind(binding, {
    load: () => load(deps),
    actions: [
      switchOnAction.bind(
        binding,
        async ({ input }) => {
          const switched = await deps.control?.switchOn(
            Math.round(input.monthlyUsd * 1_000_000),
          );
          if (switched !== "on")
            throw new Error(
              switched === "not-ready"
                ? "Guest profile unavailable"
                : "Guest chat cannot be switched here",
            );
          await deps.afterSwitch();
          return { open: true };
        },
        async ({ input }) => {
          const status = await deps.control?.status();
          if (!status) throw new Error("Guest chat cannot be switched here");
          const budget = Math.round(input.monthlyUsd * 1_000_000);
          return {
            summary: `Open guest chat on ${status.origin} with a monthly budget of ${dollars(budget)}? Each question reserves ${dollars(status.quoteMicroUsd)} until its cost is measured, and the rest returns to the budget. ${dollars(status.chargedMicroUsd)} is already charged this month; the budget starts over on the 1st (UTC).`,
            revision: `${status.enabled}:${status.budgetMicroUsd}:${status.chargedMicroUsd}`,
          };
        },
      ),
      switchOffAction.bind(binding, async () => {
        if ((await deps.control?.switchOff()) !== "off")
          throw new Error("Guest chat cannot be switched here");
        await deps.afterSwitch();
        return { open: false };
      }),
      saveQuestionAction.bind(
        binding,
        async ({ input }) => {
          const event = await deps.record.get(input.recordId);
          if (!event?.question)
            throw new Error("This record kept no question text");
          // Notes are the note plugin's to write; it keeps them private.
          const response = await deps.capture({
            id: `visitor-question-${input.recordId.slice(0, 16)}`,
            title: "Visitor question",
            body: event.question,
          });
          return { noteId: response.noteId };
        },
        async ({ input }) => {
          const event = await deps.record.get(input.recordId);
          if (!event?.question)
            throw new Error("This record kept no question text");
          const shown =
            event.question.length > 300
              ? `${event.question.slice(0, 300)}…`
              : event.question;
          return {
            summary: `Save this visitor question as a private note? “${shown}”`,
            revision: digest(event.question),
          };
        },
      ),
    ],
  });
}
