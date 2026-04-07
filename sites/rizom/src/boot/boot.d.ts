/**
 * Type declaration for text imports of boot scripts.
 *
 * Boot scripts use the `.boot.js` suffix so we can import them as text
 * via Bun's `with { type: "text" }` import attribute without shadowing
 * normal `.js` imports elsewhere in the project. Same pattern as
 * `*.canvas.js` in sites/rizom/src/canvases/.
 */
declare module "*.boot.js" {
  const content: string;
  export default content;
}
