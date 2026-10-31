import {
  AttachmentCardDataSchema,
  StructuredChatCardSchema,
  type AgentContextItem,
  type AssistantTurn,
} from "@brains/contracts";
import { z } from "@brains/utils/zod";
import { markdownBody } from "@brains/entity-service";
import {
  entitySourceCitation,
  entityTitle,
  metadataString,
  type EntityLinks,
} from "./entity-citation";
import { definedFields } from "@brains/utils/strip-undefined";
import { getErrorMessage } from "@brains/utils/error";
import { SourceCitationSchema } from "@brains/contracts";
import {
  toolConfirmationSchema,
  toolErrorSchema,
  toolResponseSchema,
  toolSuccessSchema,
} from "@brains/mcp-service";
import type {
  BrainAgentResult,
  PendingConfirmation,
  SourceCitation,
  StructuredChatCard,
  ToolResultData,
} from "./agent-types";

const toolCallArgsSchema = z.record(z.string(), z.unknown());
const sdkToolErrorSchema = z.object({
  type: z.literal("tool-error"),
  toolCallId: z.string(),
  toolName: z.string(),
  input: z.unknown(),
  error: z.unknown(),
});
const jobIdSchema = z.looseObject({ jobId: z.string() });
const sourceEntitySchema = z.looseObject({
  id: z.string().min(1),
  entityType: z.string().min(1),
  content: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
});
const entitySearchResultSchema = z.looseObject({
  entity: sourceEntitySchema,
  score: z.number().finite().optional(),
  excerpt: z.string().optional(),
});
const searchToolDataSchema = z.object({
  results: z.array(entitySearchResultSchema),
});
const getToolDataSchema = z.object({
  entity: sourceEntitySchema,
});
/** A tool that attributes its own sources, such as the network's answers. */
const toolSourcesDataSchema = z.object({
  sources: z.array(z.unknown()),
});
const structuredChatCardParserSchema = z.custom<StructuredChatCard>(
  (value) => StructuredChatCardSchema.safeParse(value).success,
  "expected structured chat card",
);
const toolDataCardsSchema = z.object({
  cards: z.array(structuredChatCardParserSchema),
});
const toolStatePromptDataSchema = z.object({
  currentState: z.object({
    prompt: z.string().min(1).optional(),
  }),
});
const listToolDataSchema = z.object({
  entities: z.array(sourceEntitySchema),
});
const attachmentToolDataSchema = z
  .object({
    documentId: z.string().min(1).optional(),
    entityId: z.string().min(1).optional(),
    attachment: AttachmentCardDataSchema,
  })
  .transform((data, ctx) => {
    // A card is addressed by whichever id the tool supplied. Resolving it here
    // makes "no id" a parse failure and gives the parsed value a non-optional
    // attachmentId, so callers need no second check.
    const attachmentId = data.documentId ?? data.entityId;
    if (attachmentId === undefined) {
      ctx.addIssue({
        code: "custom",
        message: "attachment needs a documentId or entityId",
      });
      return z.NEVER;
    }
    return { attachmentId, attachment: data.attachment };
  });

/** Human-readable noun for an attachment's media type, for card copy. */
function describeAttachmentMedia(mediaType: string): string {
  if (mediaType === "application/pdf") return "PDF";
  const [type, subtype] = mediaType.split("/");
  if (type === "image") return "image";
  if (subtype) return subtype.toUpperCase();
  return "artifact";
}

function buildQueuedAttachmentDescription(
  mediaLabel: string,
  attachmentType?: string,
): string {
  if (attachmentType === "uploaded") {
    return `Uploaded ${mediaLabel} save has been queued. This artifact will open once the job completes.`;
  }
  return `${mediaLabel} generation has been queued. This artifact will open once the job completes.`;
}

export function buildToolResultPromptFallback(
  toolResults: ToolResultData[],
): string | undefined {
  for (const toolResult of toolResults) {
    const parsed = toolStatePromptDataSchema.safeParse(toolResult.data);
    if (parsed.success && parsed.data.currentState.prompt) {
      return parsed.data.currentState.prompt;
    }
  }
  return undefined;
}

/**
 * The reply for a turn whose model text is empty after a failed tool call:
 * the latest tool error, so the caller is not left with a blank answer.
 */
export function buildToolErrorFallback(
  toolResults: ToolResultData[],
): string | undefined {
  const failed = [...toolResults].reverse().find((result) => result.error);
  return failed?.error
    ? `I couldn't complete that: ${failed.error.message}`
    : undefined;
}

export function buildAttachmentCardFromToolData(
  data: unknown,
): StructuredChatCard | undefined {
  const jobIdParsed = jobIdSchema.safeParse(data);
  const attachmentParsed = attachmentToolDataSchema.safeParse(data);
  if (!attachmentParsed.success) return undefined;

  const { attachmentId, attachment } = attachmentParsed.data;
  const source = attachment.source;
  const mediaLabel = describeAttachmentMedia(attachment.mediaType);
  const queuedDescription = buildQueuedAttachmentDescription(
    mediaLabel,
    source?.attachmentType,
  );
  return {
    kind: "attachment",
    id: `attachment:${attachmentId}`,
    title: attachment.filename ?? `Generated ${mediaLabel}`,
    // Only describe the work as queued when there is a job backing it;
    // an already-materialized attachment arrives without a jobId.
    ...definedFields({
      jobId: jobIdParsed.success ? jobIdParsed.data.jobId : undefined,
      description: jobIdParsed.success ? queuedDescription : undefined,
    }),
    attachment: {
      mediaType: attachment.mediaType,
      url: attachment.url,
      ...definedFields({
        downloadUrl: attachment.downloadUrl,
        previewUrl: attachment.previewUrl,
        filename: attachment.filename,
        sizeBytes: attachment.sizeBytes,
        source: source && definedFields(source),
      }),
    },
  };
}

const MAX_SOURCE_EXCERPT_LENGTH = 500;
const MAX_SEARCH_SOURCES = 3;

function truncateSourceExcerpt(content: string): string {
  const trimmed = content.trim();
  if (trimmed.length <= MAX_SOURCE_EXCERPT_LENGTH) return trimmed;
  return `${trimmed.slice(0, MAX_SOURCE_EXCERPT_LENGTH - 1).trimEnd()}…`;
}

function getStringProvenanceValue(
  provenance: AgentContextItem["provenance"],
  key: string,
): string | undefined {
  const value = provenance?.[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function buildSourcesCardFromContextItems(
  contextItems: AgentContextItem[] | undefined,
): StructuredChatCard | undefined {
  if (!contextItems || contextItems.length === 0) return undefined;

  return {
    kind: "sources",
    id: "sources:agent-context",
    title: "Retrieved context",
    sources: contextItems.map((item) => ({
      id: item.id,
      source: item.source,
      excerpt: truncateSourceExcerpt(item.content),
      ...definedFields({
        title: item.title,
        url: getStringProvenanceValue(item.provenance, "url"),
        entityType: getStringProvenanceValue(item.provenance, "entityType"),
        entityId: getStringProvenanceValue(item.provenance, "entityId"),
        provenance: item.provenance,
      }),
    })),
  };
}

function buildSourceCitationFromEntity(params: {
  toolName: string;
  entity: z.infer<typeof sourceEntitySchema>;
  excerpt?: string | undefined;
  score?: number | undefined;
  links: EntityLinks | undefined;
}): SourceCitation {
  const { entity, toolName, score } = params;
  const excerpt =
    params.excerpt !== undefined
      ? truncateSourceExcerpt(params.excerpt)
      : entity.content !== undefined
        ? truncateSourceExcerpt(markdownBody(entity.content))
        : undefined;
  return {
    ...entitySourceCitation(entity, params.links),
    ...definedFields({ excerpt }),
    provenance: {
      toolName,
      ...definedFields({ score }),
    },
  };
}

/** A source the turn saw; a search result keeps its rank within its search. */
interface SourceCandidate {
  citation: SourceCitation;
  rank?: number;
}

function buildToolSourceCitations(params: {
  toolName: string;
  data: unknown;
  links: EntityLinks | undefined;
}): SourceCandidate[] {
  if (params.toolName === "system_search") {
    const parsed = searchToolDataSchema.safeParse(params.data);
    if (!parsed.success) return [];
    return [...parsed.data.results]
      .sort(
        (a, b) =>
          (b.score ?? Number.NEGATIVE_INFINITY) -
          (a.score ?? Number.NEGATIVE_INFINITY),
      )
      .map((result, rank) => ({
        rank,
        citation: buildSourceCitationFromEntity({
          toolName: params.toolName,
          entity: result.entity,
          excerpt: result.excerpt,
          score: result.score,
          links: params.links,
        }),
      }));
  }

  if (params.toolName === "system_get") {
    const parsed = getToolDataSchema.safeParse(params.data);
    if (!parsed.success) return [];
    return [
      {
        citation: buildSourceCitationFromEntity({
          toolName: params.toolName,
          entity: parsed.data.entity,
          links: params.links,
        }),
      },
    ];
  }

  // A tool's own citations count like a direct read: kept whatever the answer names.
  const own = toolSourcesDataSchema.safeParse(params.data);
  if (own.success) {
    return own.data.sources.flatMap((source) => {
      const citation = SourceCitationSchema.safeParse(source);
      return citation.success ? [{ citation: citation.data }] : [];
    });
  }

  return [];
}

function comparable(text: string): string {
  return ` ${text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()} `;
}

/** Whether the answer links the page at this address, by path or in full. */
function linksTo(answer: string, url: string | undefined): boolean {
  if (url === undefined) return false;
  const { pathname } = new URL(url);
  if (pathname.length < 2) return false;
  const path = pathname
    .replace(/\/+$/, "")
    .replace(/[.*+?^${}()|[\]\\]/g, (char) => `\\${char}`);
  return new RegExp(`${path}(?![\\w-])`).test(answer);
}

/**
 * What an answer drew on: the search results it names by title or links,
 * however they scored, and what it read directly. An answer that names none
 * keeps each search's best results.
 */
function selectAnswerSources(
  candidates: SourceCandidate[],
  answer: string | undefined,
): SourceCitation[] {
  const text = answer === undefined ? "" : comparable(answer);
  const searched = candidates.filter(
    (candidate) => candidate.rank !== undefined,
  );
  const named = searched.filter((candidate) => {
    if (linksTo(answer ?? "", candidate.citation.url)) return true;
    // Optional where the citation type is read through its public contract.
    const cited: string | undefined = candidate.citation.title;
    if (cited === undefined) return false;
    const title = comparable(cited);
    return title.trim().length >= 4 && text.includes(title);
  });
  const chosen =
    named.length > 0
      ? named
      : searched.filter(
          (candidate) => (candidate.rank ?? 0) < MAX_SEARCH_SOURCES,
        );
  return [
    ...chosen,
    ...candidates.filter((candidate) => candidate.rank === undefined),
  ].map((candidate) => candidate.citation);
}

function buildToolSourcesCard(
  sources: SourceCitation[],
): StructuredChatCard | undefined {
  if (sources.length === 0) return undefined;

  const uniqueSources: SourceCitation[] = [];
  const seen = new Set<string>();
  for (const source of sources) {
    if (seen.has(source.id)) continue;
    seen.add(source.id);
    uniqueSources.push(source);
  }

  return {
    kind: "sources",
    id: "sources:tool-results",
    title: "Retrieved sources",
    sources: uniqueSources,
  };
}

/**
 * Cards whose sources are the given ones in place of what the tools returned;
 * without any, the tools' sources stay.
 */
export function withAnswerSources(
  cards: StructuredChatCard[],
  sources: SourceCitation[],
): StructuredChatCard[] {
  const card = buildToolSourcesCard(sources);
  if (!card) return cards;
  return [
    ...cards.filter(
      (existing) => existing.kind !== "sources" || existing.id !== card.id,
    ),
    card,
  ];
}

export interface ExtractedResults {
  toolResults: ToolResultData[];
  pendingConfirmations: PendingConfirmation[];
  cards: StructuredChatCard[];
  totalToolCalls: number;
}

type AgentStep = BrainAgentResult["steps"][number];
type StepToolResult = AgentStep["toolResults"][number];
type ToolCallArgs = Map<string, Record<string, unknown>>;

/** A step's record-shaped call arguments, by the id of the call that sent them. */
export function toolCallArgs(step: AgentStep): ToolCallArgs {
  return new Map(
    step.toolCalls.flatMap((call) => {
      if (!call.toolCallId) return [];
      const parsed = toolCallArgsSchema.safeParse(call.input);
      return parsed.success ? [[call.toolCallId, parsed.data] as const] : [];
    }),
  );
}

export interface StepFailures {
  results: ToolResultData[];
  /** The calls that failed, whose results are not counted again. */
  callIds: Set<string>;
}

/**
 * SDK validation can reject a call before our handler runs; execution
 * exceptions likewise appear in content rather than toolResults. Keep
 * both as attempted calls so retries cannot turn failures invisible.
 */
export function stepFailures(
  step: AgentStep,
  args: ToolCallArgs,
): StepFailures {
  const rejected = step.toolCalls.filter(
    (call) => call.invalid === true || call.error !== undefined,
  );
  const callIds = new Set(rejected.map((call) => call.toolCallId));
  const results: ToolResultData[] = rejected.map((call) => ({
    toolName: call.toolName,
    ...definedFields({ args: args.get(call.toolCallId) }),
    error: {
      code: "invalid_tool_call",
      message: getErrorMessage(call.error, "SDK rejected the tool call"),
    },
  }));
  for (const part of step.content ?? []) {
    const parsed = sdkToolErrorSchema.safeParse(part);
    if (!parsed.success || callIds.has(parsed.data.toolCallId)) continue;
    const failure = parsed.data;
    callIds.add(failure.toolCallId);
    const input = toolCallArgsSchema.safeParse(failure.input);
    results.push({
      toolName: failure.toolName,
      ...definedFields({
        args: input.success ? input.data : args.get(failure.toolCallId),
      }),
      error: {
        code: "tool_execution_failed",
        message: getErrorMessage(failure.error, "Tool execution failed"),
      },
    });
  }
  return { results, callIds };
}

export interface RequestedConfirmation {
  confirmation: PendingConfirmation;
  card: StructuredChatCard;
}

/**
 * A tool's request for approval, as the confirmation the turn holds and the
 * card that shows it; both carry the same id and copy.
 */
export function confirmationFrom(params: {
  toolResult: StepToolResult;
  /** What the call sent, shown on the card. */
  args: Record<string, unknown> | undefined;
  /** Names the approval when its call has no id. */
  toolCallsSoFar: number;
}): RequestedConfirmation | undefined {
  const { toolResult } = params;
  const parsed = toolConfirmationSchema.safeParse(toolResult.output);
  if (!parsed.success) return undefined;
  const request = parsed.data;
  const shared = {
    id: toolResult.toolCallId
      ? `approval:${toolResult.toolCallId}`
      : `approval:${toolResult.toolName}:${params.toolCallsSoFar}`,
    toolName: request.toolName,
    summary: request.summary,
    ...definedFields({
      toolCallId: toolResult.toolCallId,
      completionSummary: request.completionSummary,
      preview: request.preview,
    }),
  };
  return {
    confirmation: { ...shared, args: request.args },
    card: {
      kind: "tool-approval",
      ...shared,
      state: "approval-requested",
      ...definedFields({ input: params.args }),
    },
  };
}

export interface ToolOutcome {
  result: ToolResultData;
  cards: StructuredChatCard[];
  sources: SourceCandidate[];
}

/**
 * A tool's output as the turn records it: its result, the cards it shows and
 * the sources it read. A cached repeat records nothing.
 */
export function toolResultFrom(params: {
  toolResult: StepToolResult;
  args: Record<string, unknown> | undefined;
  links: EntityLinks | undefined;
}): ToolOutcome | undefined {
  const { toolName, output } = params.toolResult;
  const parsed = toolResponseSchema.safeParse(output);
  if (!parsed.success) return { result: { toolName }, cards: [], sources: [] };

  const success = toolSuccessSchema.safeParse(parsed.data);
  if (success.success && success.data.cached === true) return undefined;

  const failure = toolErrorSchema.safeParse(parsed.data);
  const data =
    success.success && success.data.data != null
      ? success.data.data
      : undefined;
  const job = jobIdSchema.safeParse(data);
  const result: ToolResultData = {
    toolName,
    ...definedFields({
      args: params.args,
      error: failure.success
        ? {
            message: failure.data.error,
            ...definedFields({ code: failure.data.code }),
          }
        : undefined,
      data,
      jobId: job.success ? job.data.jobId : undefined,
    }),
  };
  if (data === undefined) return { result, cards: [], sources: [] };

  const structuredCards = toolDataCardsSchema.safeParse(data);
  const attachmentCard = buildAttachmentCardFromToolData(data);
  return {
    result,
    cards: [
      ...(structuredCards.success ? structuredCards.data.cards : []),
      ...(attachmentCard ? [attachmentCard] : []),
    ],
    sources: buildToolSourceCitations({ toolName, data, links: params.links }),
  };
}

export function extractToolResults(
  steps: BrainAgentResult["steps"],
  /** The answer, when known: its sources are the results it names. */
  answer?: string,
  /** Where the site shows entities, so a source links to its page. */
  links?: EntityLinks,
): ExtractedResults {
  const toolResults: ToolResultData[] = [];
  const cards: StructuredChatCard[] = [];
  const sourceCandidates: SourceCandidate[] = [];
  const pendingConfirmations: PendingConfirmation[] = [];
  let totalToolCalls = 0;

  for (const step of steps) {
    totalToolCalls += step.toolCalls.length;
    const args = toolCallArgs(step);
    const failures = stepFailures(step, args);
    toolResults.push(...failures.results);

    // A step asks once per tool, however many of its calls want approval.
    const confirmedToolNames = new Set<string>();
    for (const toolResult of step.toolResults) {
      if (failures.callIds.has(toolResult.toolCallId)) continue;
      if (toolResult.output === null) continue;
      const callArgs = args.get(toolResult.toolCallId);

      const requested = confirmationFrom({
        toolResult,
        args: callArgs,
        toolCallsSoFar: totalToolCalls,
      });
      if (requested) {
        const { toolName } = requested.confirmation;
        if (confirmedToolNames.has(toolName)) continue;
        confirmedToolNames.add(toolName);
        pendingConfirmations.push(requested.confirmation);
        cards.push(requested.card);
        continue;
      }

      const outcome = toolResultFrom({ toolResult, args: callArgs, links });
      if (!outcome) continue;
      cards.push(...outcome.cards);
      sourceCandidates.push(...outcome.sources);
      toolResults.push(outcome.result);
    }

    // The record ends at the step that asked for approval.
    if (confirmedToolNames.size > 0) break;
  }

  const sourcesCard = buildToolSourcesCard(
    selectAnswerSources(sourceCandidates, answer),
  );
  if (sourcesCard) cards.push(sourcesCard);

  return {
    toolResults,
    pendingConfirmations,
    cards,
    totalToolCalls,
  };
}

const entityRefDataSchema = z.object({
  entityId: z.string().min(1).optional(),
  updated: z.string().min(1).optional(),
  deleted: z.string().min(1).optional(),
  status: z.string().optional(),
});
/** Treat a blank string as absent, as an omitted field. */
function nonEmpty(value: string | undefined): string | undefined {
  return value === undefined || value === "" ? undefined : value;
}

const entityRefArgsSchema = z.object({
  entityType: z.string().optional(),
  id: z.string().optional(),
  title: z.string().optional(),
});

export const entityMemoryRefSchema: z.ZodObject<{
  entityType: z.ZodOptional<z.ZodString>;
  entityId: z.ZodString;
  operation: z.ZodOptional<z.ZodString>;
  title: z.ZodOptional<z.ZodString>;
  status: z.ZodOptional<z.ZodString>;
  listIndex: z.ZodOptional<z.ZodNumber>;
}> = z.object({
  entityType: z.string().min(1).optional(),
  entityId: z.string().min(1),
  operation: z.string().min(1).optional(),
  title: z.string().min(1).optional(),
  status: z.string().min(1).optional(),
  listIndex: z.number().int().positive().optional(),
});

export type EntityMemoryRef = z.infer<typeof entityMemoryRefSchema>;

export const agentContactCandidateSchema: z.ZodObject<{
  source: z.ZodObject<{
    kind: z.ZodLiteral<"url">;
    url: z.ZodString;
  }>;
}> = z.object({
  source: z.object({
    kind: z.literal("url"),
    url: z.string().min(1),
  }),
});

export type AgentContactCandidate = z.infer<typeof agentContactCandidateSchema>;

const a2aCallArgsSchema = z.object({
  agent: z.string().min(1),
});

const agentContactCandidateDataSchema = z.object({
  agentContactCandidate: agentContactCandidateSchema,
});

export function buildAgentContactCandidates(
  toolResults: ToolResultData[],
): AgentContactCandidate[] {
  const seen = new Set<string>();
  const candidates: AgentContactCandidate[] = [];
  for (const tr of toolResults) {
    if (tr.toolName !== "agent_call") continue;

    const dataCandidate = agentContactCandidateDataSchema.safeParse(tr.data);
    if (dataCandidate.success) {
      const { url } = dataCandidate.data.agentContactCandidate.source;
      if (seen.has(url)) continue;
      seen.add(url);
      candidates.push(dataCandidate.data.agentContactCandidate);
      continue;
    }

    if (
      tr.error?.code !== "agent_not_saved" &&
      tr.error?.code !== "agent_card_unavailable"
    )
      continue;
    const args = a2aCallArgsSchema.safeParse(tr.args ?? {});
    if (!args.success) continue;
    const url = args.data.agent;
    if (seen.has(url)) continue;
    seen.add(url);
    candidates.push({ source: { kind: "url", url } });
  }
  return candidates;
}

export function buildAgentContactCandidateContext(
  candidates: AgentContactCandidate[],
): string {
  if (candidates.length === 0) return "";
  const lines = candidates.map(
    (candidate) =>
      `- agent_connect candidate args: { source: { kind: "url", url: "${candidate.source.url}" } }`,
  );
  return `\n\nInternal agent contact candidates from previous assistant turns for follow-up resolution. These are typed runtime candidates, not visible user text. If the user confirms saving/adding/connecting one of these contacts, call agent_connect without confirmed using the exact candidate args. Do not auto-save from an agent_call; saving/connecting is explicit through agent_connect.\n${lines.join("\n")}`;
}

/**
 * Extract structured entity references from tool results so follow-up turns can
 * resolve phrases like "that post" without searching. These refs are stored in
 * message metadata, never appended to user-visible assistant text.
 */
export function buildEntityMemoryRefs(
  toolResults: ToolResultData[],
): EntityMemoryRef[] {
  const seen = new Set<string>();
  const refs: EntityMemoryRef[] = [];
  for (const tr of toolResults) {
    const data = entityRefDataSchema.safeParse(tr.data);
    const entityId = data.success
      ? (data.data.entityId ?? data.data.updated ?? data.data.deleted)
      : undefined;
    if (data.success && entityId !== undefined) {
      const { status } = data.data;
      if (seen.has(entityId)) continue;
      seen.add(entityId);

      const args = entityRefArgsSchema.safeParse(tr.args ?? {});
      const entityType = args.success ? args.data.entityType : undefined;
      const title = args.success ? args.data.title : undefined;
      const operation = data.data.updated
        ? "updated"
        : data.data.deleted
          ? "deleted"
          : "created";
      refs.push({
        entityId,
        operation,
        ...definedFields({
          entityType: nonEmpty(entityType),
          title: nonEmpty(title),
          status: nonEmpty(status),
        }),
      });
      continue;
    }

    if (tr.toolName !== "system_list") continue;
    const listData = listToolDataSchema.safeParse(tr.data);
    if (!listData.success) continue;
    for (const entity of listData.data.entities) {
      if (seen.has(entity.id)) continue;
      seen.add(entity.id);
      const title = entityTitle(entity);
      const status = metadataString(entity.metadata, "status");
      refs.push({
        entityType: entity.entityType,
        entityId: entity.id,
        operation: "listed",
        listIndex: refs.filter((ref) => ref.operation === "listed").length + 1,
        ...definedFields({
          title: title !== entity.id ? title : undefined,
          status,
        }),
      });
    }
  }
  return refs;
}

export function buildEntityMemoryContext(refs: EntityMemoryRef[]): string {
  if (refs.length === 0) return "";
  const lines = refs.map((ref) => {
    const details = [
      ref.entityType !== undefined
        ? `entityType: ${ref.entityType}`
        : undefined,
      `entityId: ${ref.entityId}`,
      ref.operation !== undefined ? `operation: ${ref.operation}` : undefined,
      ref.listIndex !== undefined ? `item ${ref.listIndex}` : undefined,
      ref.title !== undefined ? `title: ${ref.title}` : undefined,
      ref.status !== undefined ? `status: ${ref.status}` : undefined,
    ].filter(
      (value): value is string => value !== undefined && value.length > 0,
    );
    return `- ${details.join("; ")}`;
  });
  return `\n\nInternal entity refs from previous assistant turns for follow-up resolution. These are typed runtime references, not visible user text. Use the canonical entityId when a follow-up refers to the same item (for example “it”, “that”, “that post”, “the draft”, “publish it”, or “a cover image to go with that”). Do not derive or rewrite IDs from titles; copy the exact entityId value from the matching ref. A ref with operation created and status generating/draft is already a valid target for follow-up operations such as cover-image generation; do not ask the user for its slug again.\n${lines.join("\n")}`;
}

const readEntitySchema = z.object({
  id: z.string().min(1),
  entityType: z.string().min(1),
});
const getReadSchema = z.object({ entity: readEntitySchema });
const searchReadSchema = z.object({
  results: z.array(z.object({ entity: readEntitySchema })),
});

/** Entities a turn's reads actually returned, once each, in read order. */
export function buildRetrievedEntityRefs(
  toolResults: ToolResultData[],
): AssistantTurn["retrieved"] {
  const entities = toolResults.flatMap((result) => {
    if (result.error) return [];
    if (result.toolName === "system_get") {
      const read = getReadSchema.safeParse(result.data);
      return read.success ? [read.data.entity] : [];
    }
    if (result.toolName === "system_search") {
      const read = searchReadSchema.safeParse(result.data);
      return read.success ? read.data.results.map((hit) => hit.entity) : [];
    }
    return [];
  });
  const refs = new Map(
    entities.map((entity) => [
      `${entity.entityType}/${entity.id}`,
      { entityType: entity.entityType, entityId: entity.id },
    ]),
  );
  return [...refs.values()].slice(0, 50);
}
