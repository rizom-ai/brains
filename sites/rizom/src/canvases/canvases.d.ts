/**
 * Type declaration for text imports of canvas scripts.
 *
 * Canvas scripts use the `.canvas.js` suffix so we can import them as
 * text via Bun's `with { type: "text" }` import attribute without
 * shadowing normal `.js` imports elsewhere in the project.
 */
declare module "*.canvas.js" {
  const content: string;
  export default content;
}
