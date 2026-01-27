import { h, Fragment } from "preact";
import type { JSX } from "preact";
import type { UISlotRegistry } from "../lib/ui-slot-registry";

export interface SlotProps {
  /** The name of the slot to render */
  name: string;
  /** The slot registry containing registered components */
  slots?: UISlotRegistry | undefined;
}

/**
 * Declarative slot component for rendering plugin-registered UI components.
 *
 * Usage in layouts:
 * ```tsx
 * <Footer>
 *   <Slot name="footer-top" slots={slots} />
 * </Footer>
 * ```
 */
export function Slot({ name, slots }: SlotProps): JSX.Element | null {
  if (!slots?.hasSlot(name)) {
    return null;
  }

  const entries = slots.getSlot(name);
  const children = entries.map((entry) => entry.render());

  return h(Fragment, {}, ...children);
}
