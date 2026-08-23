import type { BaseEntity, ServicePluginContext } from "@brains/plugins";
import { A2A_CHANNELS } from "@brains/contracts";
import { z } from "@brains/utils/zod";
import type { StudioRequestAccess } from "./editor-contracts";
import { requireEntityAction } from "./editor-access";
import { zodFieldToStudioWidget } from "./config";
import { splitEntityContent } from "./editor-content";
import { jsonResponse } from "./editor-response";

const assistContextShape = {
  entityType: z.string(),
  id: z.string(),
};

const assistPayloadSchema = z.union([
  z.object({
    ...assistContextShape,
    variant: z.literal("rewrite").optional(),
    instruction: z.string().trim().min(1),
    selection: z.string().min(1).max(8_000),
  }),
  z.object({
    ...assistContextShape,
    variant: z.literal("summarise"),
    targetField: z.string().trim().min(1),
  }),
  z.object({
    ...assistContextShape,
    variant: z.literal("tag-suggest"),
    targetField: z.string().trim().min(1),
  }),
]);

const assistResponseSchema = z.object({
  suggestion: z.string(),
});

const tagAssistResponseSchema = z.object({
  suggestions: z.array(z.string().trim().min(1)).max(12),
});

const askAgentPayloadSchema = z.object({
  entityType: z.string(),
  id: z.string(),
  selection: z.string().min(1).max(8_000),
  instruction: z.string().trim().min(1).max(2_000),
  agent: z.string().trim().min(1).max(253),
});

const a2aCallResultSchema = z.looseObject({
  response: z.string(),
});

const a2aAgentListSchema = z.object({
  agents: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
    }),
  ),
});

interface StudioAssistEntityContext {
  entity: BaseEntity;
  frontmatter: Record<string, unknown>;
  body: string;
}

async function resolveStudioAssistEntity(
  context: ServicePluginContext,
  entityType: string,
  id: string,
  access: StudioRequestAccess,
): Promise<StudioAssistEntityContext | Response> {
  if (!context.entities.getEffectiveFrontmatterSchema(entityType)) {
    return jsonResponse({ error: `Unknown entity type: ${entityType}` }, 404);
  }
  const entity = await context.entityService.getEntity({
    entityType,
    id,
    visibilityScope: access.visibilityScope,
  });
  if (!entity) {
    return jsonResponse({ error: `Entity not found: ${id}` }, 404);
  }
  const denied = requireEntityAction(context, entityType, "update", access);
  if (denied) return denied;
  const content = splitEntityContent(entityType, entity.content);
  return { entity, ...content };
}

function requireStoredSelection(
  context: StudioAssistEntityContext,
  selection: string,
): Response | null {
  return context.body.includes(selection)
    ? null
    : jsonResponse(
        { error: "Selection no longer matches the stored entity" },
        409,
      );
}

export async function handleAssist(
  context: ServicePluginContext,
  request: Request,
  access: StudioRequestAccess,
): Promise<Response> {
  let payload: z.infer<typeof assistPayloadSchema>;
  try {
    payload = assistPayloadSchema.parse(await request.json());
  } catch {
    return jsonResponse(
      { error: "Invalid assist payload or selection length" },
      400,
    );
  }

  const entityContext = await resolveStudioAssistEntity(
    context,
    payload.entityType,
    payload.id,
    access,
  );
  if (entityContext instanceof Response) return entityContext;

  const frontmatterSchema = context.entities.getEffectiveFrontmatterSchema(
    payload.entityType,
  );
  if (!frontmatterSchema) {
    return jsonResponse(
      { error: `Unknown entity type: ${payload.entityType}` },
      404,
    );
  }

  if (payload.variant === "summarise" || payload.variant === "tag-suggest") {
    const fieldSchema = frontmatterSchema.shape[payload.targetField];
    if (!fieldSchema) {
      return jsonResponse(
        { error: `Unknown frontmatter field: ${payload.targetField}` },
        400,
      );
    }
    const descriptor = zodFieldToStudioWidget(payload.targetField, fieldSchema);
    const compatible =
      payload.variant === "summarise"
        ? descriptor.widget === "string" || descriptor.widget === "text"
        : descriptor.widget === "list" && descriptor.field?.widget === "string";
    if (!compatible) {
      return jsonResponse(
        {
          error: `Field ${payload.targetField} is incompatible with ${payload.variant}`,
        },
        400,
      );
    }

    const contextLines = [
      "You are editing Studio frontmatter from an existing markdown body.",
      `Entity type: ${payload.entityType}`,
      `Target field: ${payload.targetField}`,
      `Existing frontmatter JSON: ${JSON.stringify(entityContext.frontmatter)}`,
      "",
      "Full markdown body:",
      entityContext.body,
    ];

    if (payload.variant === "summarise") {
      const { object } = await context.ai.generateObject(
        [
          "Summarise the body for the target frontmatter field.",
          "Return only the field value in the suggestion field.",
          ...contextLines,
        ].join("\n"),
        assistResponseSchema,
      );
      return jsonResponse({
        variant: payload.variant,
        targetField: payload.targetField,
        suggestion: object.suggestion,
      });
    }

    const { object } = await context.ai.generateObject(
      [
        "Suggest tags for the target frontmatter field.",
        "Return concise tag strings in the suggestions field without duplicates.",
        ...contextLines,
      ].join("\n"),
      tagAssistResponseSchema,
    );
    return jsonResponse({
      variant: payload.variant,
      targetField: payload.targetField,
      suggestions: [...new Set(object.suggestions)],
    });
  }

  const selectionError = requireStoredSelection(
    entityContext,
    payload.selection,
  );
  if (selectionError) return selectionError;
  const prompt = [
    "You are editing markdown for the Studio.",
    "Rewrite only the selected text according to the instruction.",
    "Return only replacement markdown in the suggestion field.",
    "Do not include commentary, code fences, or unchanged surrounding body text.",
    "",
    `Entity type: ${payload.entityType}`,
    `Frontmatter JSON: ${JSON.stringify(entityContext.frontmatter)}`,
    `Instruction: ${payload.instruction}`,
    "",
    "Selected markdown:",
    payload.selection,
    "",
    "Full body for context:",
    entityContext.body,
  ].join("\n");

  const { object } = await context.ai.generateObject(
    prompt,
    assistResponseSchema,
  );
  return jsonResponse({ suggestion: object.suggestion });
}

export async function handleListAgents(
  context: ServicePluginContext,
  request: Request,
  access: StudioRequestAccess,
): Promise<Response> {
  const params = new URL(request.url).searchParams;
  const entityType = params.get("type");
  const id = params.get("id");
  if (!entityType || !id) {
    return jsonResponse(
      { error: "type and id query parameters are required" },
      400,
    );
  }
  const entityContext = await resolveStudioAssistEntity(
    context,
    entityType,
    id,
    access,
  );
  if (entityContext instanceof Response) return entityContext;

  const response = await context.messaging.send({
    type: A2A_CHANNELS.callAgents,
    payload: {
      entityType,
      entityId: entityContext.entity.id,
      actor: access.actor,
      interfaceType: "studio",
    },
  });
  if (!("success" in response) || !response.success) {
    // No a2a interface (or no directory) means the client keeps the existing
    // model-only assist bar.
    return jsonResponse({ agents: [] });
  }

  const parsed = a2aAgentListSchema.safeParse(response.data);
  return jsonResponse(parsed.success ? parsed.data : { agents: [] });
}

export async function handleAskAgent(
  context: ServicePluginContext,
  request: Request,
  access: StudioRequestAccess,
): Promise<Response> {
  let payload: z.infer<typeof askAgentPayloadSchema>;
  try {
    payload = askAgentPayloadSchema.parse(await request.json());
  } catch {
    return jsonResponse(
      { error: "Invalid agent ask payload or selection length" },
      400,
    );
  }

  const entityContext = await resolveStudioAssistEntity(
    context,
    payload.entityType,
    payload.id,
    access,
  );
  if (entityContext instanceof Response) return entityContext;
  const selectionError = requireStoredSelection(
    entityContext,
    payload.selection,
  );
  if (selectionError) return selectionError;

  const result = await context.messaging.send({
    type: A2A_CHANNELS.callRequest,
    payload: {
      agent: payload.agent,
      instruction: payload.instruction,
      selection: payload.selection,
      entityType: payload.entityType,
      entityId: entityContext.entity.id,
      actor: access.actor,
      interfaceType: "studio",
    },
  });
  if (!("success" in result) || !result.success) {
    const error =
      "error" in result && typeof result.error === "string"
        ? result.error
        : "Agent call failed";
    const unavailable = error.startsWith("No handler found");
    return jsonResponse(
      { error: unavailable ? "Agent asking is unavailable" : error },
      unavailable ? 503 : 400,
    );
  }

  if (result.data === undefined) {
    return jsonResponse({ error: "Agent asking is unavailable" }, 503);
  }
  const parsed = a2aCallResultSchema.safeParse(result.data);
  if (!parsed.success) {
    return jsonResponse({ error: "Invalid response from agent" }, 502);
  }

  return jsonResponse({
    agentId: payload.agent,
    response: parsed.data.response,
  });
}

/**
 * Store the uploaded bytes in the shared runtime upload store, then promote
 * them through the upload-save handler the owning entity plugin registered
 * (images: the `image` plugin's promotion pipeline). The editor never
 * writes media entities itself — the pipeline stays the single owner.
 */
