import type { ComponentChildren, JSX } from "preact";
import type { SiteLayoutInfo } from "@brains/site-composition";

/** Registration for a component contributed to a named layout slot. */
export interface SiteSlotRegistration {
  /** Plugin that registered this slot */
  pluginId: string;
  /** Pre-bound render function for this slot contribution */
  render: () => JSX.Element | null;
  /** Priority for ordering (higher = first, default 50) */
  priority?: number;
}

/** Minimal slot registry contract consumed by layouts. */
export interface LayoutSlots {
  getSlot(slotName: string): SiteSlotRegistration[];
  hasSlot(slotName: string): boolean;
}

/** Preact layout component contract used by site packages and site renderers. */
export type LayoutComponent = (props: {
  sections: ComponentChildren[];
  title: string;
  description: string;
  path: string;
  siteInfo: SiteLayoutInfo;
  /** Optional slots for plugin-registered UI components */
  slots?: LayoutSlots;
}) => JSX.Element;
