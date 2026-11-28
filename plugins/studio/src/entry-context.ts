import type { StudioEntryContext } from "@brains/contracts";
import type { StudioContext } from "./studio-context";
import {
  entityTypeLabels,
  isRawEntityType,
  zodFieldToStudioWidget,
} from "./config";
import { entityDisplayTitle } from "./editor-entities";

/** Widgets whose value is prose an answer could propose. */
const PROSE_WIDGETS: ReadonlySet<string> = new Set(["string", "text"]);

/**
 * One entry as Chat beside it reads it: its title, its stored document, and
 * the text fields an answer may propose a value for. Null when the asker
 * cannot read it or it does not exist; the two are not told apart.
 */
export async function studioEntryContext(
  context: StudioContext,
  request: {
    entityType: string;
    entityId: string;
    visibilityScope: "public" | "shared" | "restricted";
  },
  displayLabel?: string,
): Promise<StudioEntryContext> {
  if (!context.entityService.getEntityTypes().includes(request.entityType))
    return null;
  const entity = await context.entityService.getEntityRaw({
    entityType: request.entityType,
    id: request.entityId,
    visibilityScope: request.visibilityScope,
    source: true,
  });
  if (!entity) return null;
  const schema = isRawEntityType(request.entityType, context.entities)
    ? undefined
    : context.entities.getEffectiveFrontmatterSchema(request.entityType);
  const fields = Object.entries(schema?.shape ?? {}).flatMap(
    ([name, fieldSchema]) => {
      const field = zodFieldToStudioWidget(name, fieldSchema);
      return PROSE_WIDGETS.has(field.widget) && !field.secret
        ? [{ name, label: field.label }]
        : [];
    },
  );
  return {
    title: entityDisplayTitle(context, entity) ?? entity.id,
    typeLabel: entityTypeLabels(request.entityType, {
      ...(displayLabel ? { label: displayLabel } : {}),
    }).label.toLowerCase(),
    markdown: entity.content,
    fields: [...fields, { name: "body", label: "Body" }].slice(0, 40),
  };
}
