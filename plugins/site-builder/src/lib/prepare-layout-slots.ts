import { createElement, isValidElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { LayoutSlots, SlotRegistration } from "@brains/site-engine";
import { SdkError } from "@brains/sdk/services";
import { toSdkError } from "@brains/contracts";
import { sha256Hex } from "@brains/utils/hash";

export interface SlotContent {
  readonly slotName: string;
  readonly pluginId: string;
  readonly priority: number;
  readonly html: string;
}

function renderSlot(entry: SlotRegistration, identifierPrefix: string): string {
  try {
    const node = entry.render();
    if (node !== null && !isValidElement(node))
      throw new SdkError("invalid_response");
    return renderToStaticMarkup(node, { identifierPrefix });
  } catch (cause) {
    throw toSdkError(cause);
  }
}

/** Render once: the fingerprint and the eventual pages use these exact bytes.
 * Slot HTML is trusted installed presentation, not a user-supplied HTML API.
 */
export function prepareLayoutSlots(
  source: LayoutSlots | undefined,
  signal: AbortSignal,
): {
  slots: LayoutSlots;
  content: readonly SlotContent[];
  dispose(): void;
} {
  const lifetime = new AbortController();
  const active = (): void => {
    if (signal.aborted || lifetime.signal.aborted)
      throw new SdkError("cancelled");
  };
  active();
  const content = Object.freeze(
    [...(source?.getSlotNames() ?? [])].sort().flatMap((slotName) =>
      (source?.getSlot(slotName) ?? []).map((entry, index) => {
        active();
        const html = renderSlot(
          entry,
          `slot-${sha256Hex(JSON.stringify([slotName, entry.pluginId, index]))}-`,
        );
        active();
        return Object.freeze({
          slotName,
          pluginId: entry.pluginId,
          priority: entry.priority ?? 50,
          html,
        });
      }),
    ),
  );
  const slots: LayoutSlots = Object.freeze({
    getSlotNames: (): string[] => [
      ...new Set(content.map((entry) => entry.slotName)),
    ],
    hasSlot: (slotName: string): boolean =>
      content.some((entry) => entry.slotName === slotName),
    getSlot: (slotName: string): SlotRegistration[] =>
      content
        .filter((entry) => entry.slotName === slotName)
        .map((entry) =>
          Object.freeze({
            pluginId: entry.pluginId,
            priority: entry.priority,
            render: () => {
              active();
              if (!entry.html) return null;
              return createElement("div", {
                "data-site-slot": entry.slotName,
                dangerouslySetInnerHTML: { __html: entry.html },
              });
            },
          }),
        ),
  });
  return {
    slots,
    content,
    dispose: (): void => {
      lifetime.abort();
    },
  };
}
