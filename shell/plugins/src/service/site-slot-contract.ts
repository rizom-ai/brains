import type { ComponentType } from "@brains/templates";

/** Trusted site presentation, not an operator widget or a delivery action. */
export interface ServiceLayoutSlot {
  readonly slotName: string;
  readonly priority?: number;
  readonly render: () => ReturnType<ComponentType> | null;
}

/** The host supplies ownership; a declaration cannot choose another owner. */
export interface InstalledLayoutSlot extends ServiceLayoutSlot {
  readonly pluginId: string;
  readonly priority: number;
}
