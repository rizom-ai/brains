import {
  encodeEntityIdPath,
  type IEntityService,
} from "@brains/entity-service";
import { throwGenerationParseError } from "./generation-limits";
import type { Template, TemplateRegistry } from "@brains/templates";
import { TemplateCapabilities } from "@brains/templates";
import {
  GenerationAuthorizationError,
  type GenerationAuthorizer,
} from "./generation-authorization";
import {
  contentGenerationRequestSchema,
  contentGenerationJobDataSchema,
  destinationKey,
  type ContentGenerationPlan,
  type ContentGenerationJobData,
  type ContentGenerationRequestInput,
  type PlannedContentGeneration,
  type SkippedContentGeneration,
} from "./generation-contracts";
import { scopeTemplateName } from "./template-scope";

export interface ContentGenerationPlannerDependencies {
  entityService: Pick<
    IEntityService,
    "getEntityWriteSnapshot" | "hasEntityType" | "getEntityTypeConfig"
  >;
  authorizer: GenerationAuthorizer;
  templateRegistry: Pick<TemplateRegistry, "get">;
}

const canGenerate = (template: Template | undefined): template is Template =>
  template !== undefined && TemplateCapabilities.canGenerate(template);

export async function planContentGeneration(
  dependencies: ContentGenerationPlannerDependencies,
  request: ContentGenerationRequestInput,
  signal?: AbortSignal,
): Promise<ContentGenerationPlan> {
  signal?.throwIfAborted();
  // One parse owns the admission limits; a limit failure surfaces as its typed error.
  const parsed = contentGenerationRequestSchema.safeParse({
    targets: request.targets.map((target) => ({
      ...target,
      templateName: scopeTemplateName(target.templateName, request.pluginId),
    })),
    options: request.options,
  });
  if (!parsed.success) throwGenerationParseError(parsed.error);
  const { targets, options } = parsed.data;

  // Validate every destination and usable template before reading existing
  // output. Missing domain-discovered templates remain compatibility skips.
  const keys = new Set<string>();
  const normalized = targets.map((target, index) => {
    const key = destinationKey(target.destination);
    if (keys.has(key)) {
      throw new Error(`Duplicate content generation destination: ${key}`);
    }
    keys.add(key);
    if (
      !dependencies.entityService.hasEntityType(target.destination.entityType)
    ) {
      throw new Error(
        `Unknown generation destination entity type: ${target.destination.entityType}`,
      );
    }
    const template = dependencies.templateRegistry.get(target.templateName);
    if (canGenerate(template) && !template.formatter) {
      throw new Error(
        `Generation template ${target.templateName} requires a formatter`,
      );
    }
    return {
      index,
      target,
      template,
      entityId: encodeEntityIdPath(target.destination.idPath),
    };
  });

  const { authority, access } = await dependencies.authorizer.admit(
    request.caller,
  );
  signal?.throwIfAborted();
  // Check the whole request before any existence results or skip decisions.
  for (const { target, template } of normalized) {
    dependencies.authorizer.assertTarget(
      access,
      template,
      target.destination.entityType,
      options.force,
      target.destination.visibility,
    );
  }

  const snapshots = new Map(
    await Promise.all(
      normalized
        .filter(({ template }) => canGenerate(template))
        .map(
          async ({ index, target, entityId }) =>
            [
              index,
              await dependencies.entityService.getEntityWriteSnapshot({
                entityType: target.destination.entityType,
                id: entityId,
                visibilityScope: access.visibilityScope,
              }),
            ] as const,
        ),
    ),
  );
  signal?.throwIfAborted();

  const planned: PlannedContentGeneration[] = [];
  const skipped: SkippedContentGeneration[] = [];
  for (const { index, target, template, entityId } of normalized) {
    if (!template) {
      skipped.push({ index, target, entityId, reason: "template-not-found" });
      continue;
    }
    if (!canGenerate(template)) {
      skipped.push({
        index,
        target,
        entityId,
        reason: "template-cannot-generate",
      });
      continue;
    }
    const existing = snapshots.get(index) ?? null;
    if (
      existing &&
      target.destination.visibility !== undefined &&
      target.destination.visibility !== existing.entity.visibility
    ) {
      throw new GenerationAuthorizationError();
    }
    const destination = {
      entityType: target.destination.entityType,
      entityId,
      metadata: target.destination.metadata,
      visibility:
        existing?.entity.visibility ??
        target.destination.visibility ??
        "public",
    };
    if (existing && !options.force) {
      skipped.push({ index, target, entityId, reason: "content-exists" });
      continue;
    }
    dependencies.authorizer.assertWrite(
      access,
      destination,
      existing !== null,
      dependencies.entityService,
    );
    const jobData: ContentGenerationJobData = {
      authority,
      templateName: target.templateName,
      context: target.context,
      destination,
      expectedRevision: existing?.revision ?? null,
    };
    // The recorded authority and write precondition add bytes beyond the input.
    // Validate every payload before admission, including during a dry run.
    const payload = contentGenerationJobDataSchema.safeParse(jobData);
    if (!payload.success) throwGenerationParseError(payload.error);
    planned.push({ index, target, entityId, jobData: payload.data });
  }

  // Planning may await many reads. Do not return decisions obtained under
  // authority that was revoked while those reads were in flight.
  const currentAccess = await dependencies.authorizer.resolve(authority);
  signal?.throwIfAborted();
  if (currentAccess.permissionLevel !== access.permissionLevel) {
    throw new GenerationAuthorizationError();
  }
  return { planned, skipped, totalTargets: targets.length };
}
