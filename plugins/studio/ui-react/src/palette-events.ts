/** The event the chrome's command chip sends to open the palette. */
export const OPEN_STUDIO_PALETTE_EVENT = "studio:open-palette";

/** Open the palette from anywhere in Studio, as the chrome's chip does. */
export function openStudioPalette(): void {
  window.dispatchEvent(new Event(OPEN_STUDIO_PALETTE_EVENT));
}
