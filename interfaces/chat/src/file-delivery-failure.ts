import { z } from "@brains/utils/zod";
import { AcknowledgedFileDeliveryError } from "./file-delivery";
import { ReceivedDiscordFileDeliveryError } from "./discord-file-delivery";
import {
  PartialSlackFileDeliveryError,
  type SlackFileDeliveryStage,
} from "./slack-file-delivery";

const slackId = z
  .string()
  .max(128)
  .regex(/^F[A-Z0-9]+$/)
  .refine((value) => value.trim() === value);
const discordId = z
  .string()
  .min(1)
  .max(20)
  .regex(/^[0-9]+$/)
  .refine((value) => value.trim() === value);
const slackReceipt = z.object({ fileId: slackId });
const discordReceipt = z.object({
  messageId: discordId,
  channelId: discordId,
  attachmentId: discordId,
});
const slackRecovery = z.object({
  fileId: slackId,
  channelId: z
    .string()
    .min(1)
    .max(128)
    .regex(/^[A-Za-z0-9]+$/)
    .refine((value) => value.trim() === value),
  threadTs: z
    .string()
    .max(64)
    .regex(/^\d+\.\d+$/)
    .refine((value) => value.trim() === value)
    .optional(),
  sha256: z
    .string()
    .length(64)
    .regex(/^[a-f0-9]{64}$/),
  stage: z.enum([
    "initialized",
    "upload-received",
    "uploaded",
    "share-attempted",
    "share-response-received",
  ]),
  completedFileId: slackId.optional(),
});
const cardId = z.string().min(1).max(128);

/** A response-level failure retains its completed prefix without retrying it. */
export class ChatArtifactDeliveryError extends Error {
  public readonly deliveredCardIds: readonly string[];
  public readonly truncated: boolean;
  public readonly invalid: boolean;
  constructor(delivered: ReadonlySet<string>, cause: unknown) {
    super("Chat artifact delivery did not finish cleanly", { cause });
    const ids: string[] = [];
    let invalid = false;
    let visited = 0;
    for (const id of delivered) {
      if (++visited > 4) break;
      const parsed = cardId.safeParse(id);
      if (parsed.success) ids.push(parsed.data);
      else invalid = true;
    }
    this.deliveredCardIds = Object.freeze(ids);
    this.truncated = delivered.size > 4;
    this.invalid = invalid;
  }
}
interface FailureNode {
  kind: "error" | "aggregate" | "opaque";
  outcome?: {
    platform: "slack" | "discord";
    stage: "received" | "acknowledged" | SlackFileDeliveryStage;
    [key: string]: string | undefined;
  };
  deliveredCardIds?: string[];
  cause?: number;
  errors?: number[];
}
export interface ChatFileFailureEvidence {
  nodes: FailureNode[];
  truncated: boolean;
  invalid: boolean;
}
export const CHAT_FILE_FAILURE_NOTICE =
  "File delivery did not finish cleanly. Some files may already be on the platform; check before retrying.";

/** Selected diagnostics only: no URLs, paths, headers, messages or retry authority. */
export function collectChatFileFailure(
  error: unknown,
): ChatFileFailureEvidence | undefined {
  const result: ChatFileFailureEvidence = {
    nodes: [],
    truncated: false,
    invalid: false,
  };
  const queue: object[] = [];
  const seen = new WeakMap<object, number>();
  let marked = false;
  let bytes = 0;
  const enqueue = (value: unknown): number | undefined => {
    if (
      value === null ||
      (typeof value !== "object" && typeof value !== "function")
    )
      return;
    const previous = seen.get(value);
    if (previous !== undefined) return previous;
    if (queue.length === 16) {
      result.truncated = true;
      return;
    }
    const index = queue.length;
    seen.set(value, index);
    queue.push(value);
    result.nodes.push({ kind: "opaque" });
    return index;
  };
  const project = (
    node: FailureNode,
    fields: Pick<FailureNode, "outcome" | "deliveredCardIds">,
  ): void => {
    const size = new TextEncoder().encode(JSON.stringify(fields)).byteLength;
    // Reserve 4 KiB for graph edges, node kinds and envelope framing.
    if (bytes + size > 12 * 1024) {
      result.truncated = true;
      return;
    }
    bytes += size;
    Object.assign(node, fields);
  };
  enqueue(error);
  for (let index = 0; index < queue.length; index++) {
    const current = queue[index];
    const node = result.nodes[index];
    if (!current || !node) continue;
    try {
      if (current instanceof Error) node.kind = "error";
      if (current instanceof ChatArtifactDeliveryError) {
        marked = true;
        const prefix = z
          .object({
            deliveredCardIds: z.array(cardId).max(4),
            truncated: z.boolean(),
            invalid: z.boolean(),
          })
          .parse(current);
        result.truncated ||= prefix.truncated;
        result.invalid ||= prefix.invalid;
        project(node, { deliveredCardIds: prefix.deliveredCardIds });
      } else if (current instanceof ReceivedDiscordFileDeliveryError) {
        marked = true;
        project(node, {
          outcome: {
            ...discordReceipt.parse(current.receipt),
            platform: "discord",
            stage: "received",
          },
        });
      } else if (current instanceof PartialSlackFileDeliveryError) {
        marked = true;
        project(node, {
          outcome: {
            ...slackRecovery.parse(current.recovery),
            platform: "slack",
          },
        });
      } else if (current instanceof AcknowledgedFileDeliveryError) {
        marked = true;
        const discord = discordReceipt.safeParse(current.receipt);
        project(node, {
          outcome: discord.success
            ? { ...discord.data, platform: "discord", stage: "acknowledged" }
            : {
                ...slackReceipt.parse(current.receipt),
                platform: "slack",
                stage: "acknowledged",
              },
        });
      }
    } catch {
      // Malformed/hostile markers cannot hide independent branches or leak diagnostics.
      result.invalid = true;
    }
    try {
      const cause = enqueue(Reflect.get(current, "cause"));
      if (cause !== undefined) node.cause = cause;
    } catch {
      result.invalid = true;
    }
    try {
      if (current instanceof AggregateError) {
        node.kind = "aggregate";
        const children: unknown = current.errors;
        if (!Array.isArray(children)) result.invalid = true;
        else {
          node.errors = [];
          if (children.length > 8) result.truncated = true;
          for (let child = 0; child < Math.min(children.length, 8); child++) {
            try {
              const edge = enqueue(children[child]);
              if (edge !== undefined) node.errors.push(edge);
            } catch {
              result.invalid = true;
            }
          }
        }
      }
    } catch {
      // Unsafe aggregate metadata is explicitly incomplete, never successful evidence.
      result.invalid = true;
    }
  }
  if (!marked && !result.truncated && !result.invalid) return undefined;
  for (const node of result.nodes) {
    if (node.outcome) Object.freeze(node.outcome);
    if (node.deliveredCardIds) Object.freeze(node.deliveredCardIds);
    if (node.errors) Object.freeze(node.errors);
    Object.freeze(node);
  }
  Object.freeze(result.nodes);
  return Object.freeze(result);
}

/** Both reporting attempts settle; failures retain the original delivery cause. */
export async function reportChatFileFailure(
  error: unknown,
  log: (diagnostic: {
    error: unknown;
    recovery?: ChatFileFailureEvidence;
  }) => void,
  notice?: (error: unknown) => Promise<void>,
): Promise<void> {
  const recovery = collectChatFileFailure(error);
  const safeError = recovery ? CHAT_FILE_FAILURE_NOTICE : error;
  const failures: unknown[] = [error];
  try {
    log({ error: safeError, ...(recovery && { recovery }) });
  } catch (logError) {
    failures.push(logError);
  }
  try {
    await notice?.(safeError);
  } catch (noticeError) {
    failures.push(noticeError);
  }
  if (failures.length > 1)
    throw new AggregateError(
      [...new Set(failures)],
      "Chat delivery and failure reporting failed",
      { cause: error },
    );
}
