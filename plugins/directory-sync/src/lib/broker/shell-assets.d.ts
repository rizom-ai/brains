/**
 * The Git wrapper is imported as text so the bundler inlines it. Without this
 * declaration TypeScript cannot resolve a `.sh` import specifier.
 */
declare module "*.sh" {
  const source: string;
  export default source;
}
