import type { FieldDescriptor } from "./api";
import { emptyDraft } from "./ui-utils";
import {
  studioCreatePrefillStateSchema,
  type StudioCreatePrefill,
} from "../../src/create-prefill-contract";

export function withoutStudioCreatePrefill(
  state: Record<string, unknown>,
): Record<string, unknown> {
  const { studioCreatePrefill: _prefill, ...remaining } = state;
  return remaining;
}

/** Consume one destination-validated create handoff from browser history. */
export function consumeStudioCreatePrefill(
  state: unknown,
  entityType: string,
  clear: () => void,
): Omit<StudioCreatePrefill, "version" | "entityType"> | undefined {
  const parsed = studioCreatePrefillStateSchema.safeParse(state);
  if (
    !parsed.success ||
    parsed.data.studioCreatePrefill.entityType !== entityType
  ) {
    return undefined;
  }
  clear();
  return {
    title: parsed.data.studioCreatePrefill.title,
    ...(parsed.data.studioCreatePrefill.body
      ? { body: parsed.data.studioCreatePrefill.body }
      : {}),
    backlink: parsed.data.studioCreatePrefill.backlink,
  };
}

export function createPrefilledDraft(
  fields: FieldDescriptor[],
  prefill: Omit<StudioCreatePrefill, "version" | "entityType"> | undefined,
): { draft: Record<string, unknown>; body: string } {
  const draft = emptyDraft(fields);
  if (!prefill) return { draft, body: "" };
  if (fields.some((field) => field.name === "title")) {
    draft["title"] = prefill.title;
  }
  const sourceSection = `## Source\n\n[Open the Inbox item](${prefill.backlink})`;
  return {
    draft,
    body: prefill.body ? `${prefill.body}\n\n${sourceSection}` : sourceSection,
  };
}
