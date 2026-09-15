import { Window } from "happy-dom";

// ReactDOM detects native input-event support at module load, before a test's
// beforeEach can install its own isolated window. Initialize that detection in
// a browser environment; mounted tests still own and dispose their windows.
const window = new Window({ url: "http://brain.test/studio" });
Object.assign(globalThis, {
  window,
  document: window.document,
  navigator: window.navigator,
});
