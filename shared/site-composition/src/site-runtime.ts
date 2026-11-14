/**
 * What a first-party site carries for the brain's runtime beside its
 * structural definition: the templates and data sources its sections are
 * drawn from. It travels on the site under a key no field names, so the site
 * still validates as the public definition it is, and the runtime reads it
 * back with `siteRuntimeOf`. Internal: a public site declares `dataSources`.
 *
 * Tracked in docs/legacy-code-inventory.json (first-party-site-runtime).
 */
const siteRuntimeKey = Symbol.for("@brains/site-composition:site-runtime");

/** A copy of the site carrying `runtime`. */
export function attachSiteRuntime<TSite extends object>(
  site: TSite,
  runtime: unknown,
): TSite {
  const carrying = { ...site };
  Object.defineProperty(carrying, siteRuntimeKey, {
    value: runtime,
    enumerable: false,
  });
  return carrying;
}

/** The runtime a site carries, or undefined. */
export function siteRuntimeOf(site: object): unknown {
  return Reflect.get(site, siteRuntimeKey);
}
