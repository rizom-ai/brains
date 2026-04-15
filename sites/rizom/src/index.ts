import type { Plugin } from "@brains/plugins";
import type { SitePackage } from "@brains/site-composition";
import canvasPrelude from "./canvases/prelude.canvas.js" with { type: "text" };
import treeCanvas from "./canvases/tree.canvas.js" with { type: "text" };
import constellationCanvas from "./canvases/constellation.canvas.js" with { type: "text" };
import rootsCanvas from "./canvases/roots.canvas.js" with { type: "text" };
import productsCanvas from "./canvases/products.canvas.js" with { type: "text" };
import bootScript from "./boot/boot.boot.js" with { type: "text" };
import { DefaultLayout } from "./layouts/default";
import { createRizomLayout } from "./layouts/create-rizom-layout";
import { routes } from "./routes";
import { RizomSitePlugin } from "./plugin";

// Variant + products canvases reference shared helpers (createRand,
// drawGlowBezier, dpr, isLightMode, C, rgba, ...) from prelude.canvas.js
// as globals. The prelude loads ONCE as its own static asset before any
// canvas script (see RizomSitePlugin.buildHeadScript); top-level consts
// in classic <script> mode are visible to subsequent scripts in the
// same document via the global lexical environment, so we don't need
// to concatenate or wrap anything.

/**
 * Rizom site package — shared by rizom.ai, rizom.foundation,
 * and rizom.work.
 *
 * This package now acts primarily as the shared Rizom base.
 * App wrappers own final composition, while direct consumers of the
 * shared package can still use the legacy `site.variant` fallback.
 *
 * Static assets (canvas scripts) are shipped via the SitePackage's
 * `staticAssets` map — text-imported at package load time and written
 * to the build output by site-builder. The site plugin's head script
 * loads them via `<script src="/canvases/*.canvas.js" defer>`.
 *
 * All three canvases still ship in the shared package so wrappers can
 * reuse the same static assets: tree (ai), constellation (work),
 * roots (foundation).
 */
export { routes, createRizomLayout };
export { RizomSitePlugin } from "./plugin";
export { Section } from "./components/Section";
export { Button } from "./components/Button";
export { Badge } from "./components/Badge";
export { Divider } from "./components/Divider";
export { ProductCard } from "./components/ProductCard";
export { createEcosystemContent } from "./compositions/ecosystem";
export type { RizomShellModel } from "./compositions/types";

const site: SitePackage = {
  layouts: {
    default: DefaultLayout,
  },
  routes,
  plugin: (config?: Record<string, unknown>): Plugin =>
    new RizomSitePlugin(config ?? {}),
  entityDisplay: {},
  staticAssets: {
    "/canvases/prelude.canvas.js": canvasPrelude,
    "/canvases/tree.canvas.js": treeCanvas,
    "/canvases/constellation.canvas.js": constellationCanvas,
    "/canvases/roots.canvas.js": rootsCanvas,
    "/canvases/products.canvas.js": productsCanvas,
    "/boot.js": bootScript,
  },
};

export default site;
