import type { FieldDescriptor } from "./api";
import { emptyDraft } from "./ui-utils";
import {
  cmsCreatePrefillStateSchema,
  type CmsCreatePrefill,
} from "../../src/create-prefill-contract";

export function withoutCmsCreatePrefill(
  state: Record<string, unknown>,
): Record<string, unknown> {
  const { cmsCreatePrefill: _prefill, ...remaining } = state;
  return remaining;
}

/** Consume one destination-validated create handoff from browser history. */
export function consumeCmsCreatePrefill(
  state: unknown,
  entityType: string,
  clear: () => void,
): Omit<CmsCreatePrefill, "version" | "entityType"> | undefined {
  const parsed = cmsCreatePrefillStateSchema.safeParse(state);
  if (
    !parsed.success ||
    parsed.data.cmsCreatePrefill.entityType !== entityType
  ) {
    return undefined;
  }
  clear();
  return {
    title: parsed.data.cmsCreatePrefill.title,
    ...(parsed.data.cmsCreatePrefill.body
      ? { body: parsed.data.cmsCreatePrefill.body }
      : {}),
    backlink: parsed.data.cmsCreatePrefill.backlink,
  };
}

export function createPrefilledDraft(
  fields: FieldDescriptor[],
  prefill: Omit<CmsCreatePrefill, "version" | "entityType"> | undefined,
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
