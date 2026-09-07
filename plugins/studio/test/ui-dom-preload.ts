import { afterAll } from "bun:test";
import { Window } from "happy-dom";

// Radix selects its layout-effect implementation when imported. Initialize the
// browser environment before any test imports UI; each suite owns its test DOM.
const bootstrapWindow = new Window({ url: "http://brain.test/studio" });
Object.assign(globalThis, {
  window: bootstrapWindow,
  document: bootstrapWindow.document,
});
afterAll(async () => {
  await bootstrapWindow.happyDOM.close();
});
