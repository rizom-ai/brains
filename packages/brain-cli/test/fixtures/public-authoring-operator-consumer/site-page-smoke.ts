import { strictEqual } from "node:assert";
import {
  SitePageResponse,
  SITE_SLOT_ATTRIBUTE,
  type SitePageSlot,
} from "@rizom/brain/interfaces";
import type { Template, ViewTemplate } from "@rizom/brain/templates";

const slot = {
  name: "form",
  html: "<form>Private draft</form>",
} satisfies SitePageSlot;
const page = new SitePageResponse("Fallback", {
  status: 422,
  headers: { "cache-control": "no-store" },
  slot,
});
slot.html = "Mutated";
strictEqual(SITE_SLOT_ATTRIBUTE, "data-site-slot");
if (
  !SitePageResponse.is(page) ||
  page.slot?.html !== "<form>Private draft</form>" ||
  !Object.isFrozen(page.slot) ||
  Reflect.set(page, "slot", slot) ||
  page.status !== 422 ||
  (await page.text()) !== "Fallback"
)
  throw new Error("Invalid detached site-slot response contract");
let refused = false;
try {
  Reflect.construct(SitePageResponse, [
    "Fallback",
    { slot: { name: 'bad"name', html: "PRIVATE_MARKER" } },
  ]);
} catch (error) {
  refused =
    error !== null &&
    typeof error === "object" &&
    "code" in error &&
    error.code === "invalid_input" &&
    !JSON.stringify(error).includes("PRIVATE_MARKER");
}
if (!refused) throw new Error("Malformed slot was not rejected safely");

function unsupported(): void {
  if (page.slot) {
    // @ts-expect-error Issued slot metadata is immutable.
    page.slot.html = "Mutated";
  }
  // @ts-expect-error Slot content must be HTML text.
  const invalid: SitePageSlot = { name: "form", html: 123 };
  void invalid;
}
void unsupported;
// @ts-expect-error Render-version fields are no longer part of author templates.
export type RemovedTemplateVersion = Template["renderVersion"];
// @ts-expect-error Renderer identity is owned by the host, not a view declaration.
export type RemovedViewVersion = ViewTemplate["renderVersion"];
