/* eslint-disable @typescript-eslint/explicit-function-return-type, @typescript-eslint/explicit-module-boundary-types */
export async function resolve(specifier, context, nextResolve) {
  if (specifier === "typescript" || specifier.startsWith("typescript/")) {
    return nextResolve(
      specifier.replace(/^typescript/, "typescript-legacy"),
      context,
    );
  }
  return nextResolve(specifier, context);
}
