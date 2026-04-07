import type { Plugin } from "@brains/plugins";
import type { SitePackage } from "@brains/app";
import themeCSS from "@brains/theme-rizom";
import canvasPrelude from "./canvases/prelude.canvas.js" with { type: "text" };
import treeCanvas from "./canvases/tree.canvas.js" with { type: "text" };
import constellationCanvas from "./canvases/constellation.canvas.js" with { type: "text" };
import rootsCanvas from "./canvases/roots.canvas.js" with { type: "text" };
import bootScript from "./boot/boot.boot.js" with { type: "text" };
import { DefaultLayout } from "./layouts/default";
import { routes } from "./routes";
import { RizomSitePlugin } from "./plugin";

// Variant canvases reference shared helpers (createRand, drawGlowBezier, …)
// from prelude.canvas.js as globals — in the design mock these live in an
// inline <script> before the canvas <script src>. We replicate that by
// concatenating prelude + variant, which keeps the variant files byte-
// equivalent to docs/design/canvases/ for easy re-syncs.
const withPrelude = (variant: string): string =>
  `${canvasPrelude}\n\n${variant}`;

/**
 * Rizom site package — shared by rizom.ai, rizom.foundation,
 * and rizom.work.
 *
 * A single package serves all three variants. Each brain instance
 * selects its variant via `site.variant` in brain.yaml, which the
 * resolver spreads into the site plugin's factory config.
 *
 * Static assets (canvas scripts) are shipped via the SitePackage's
 * `staticAssets` map — text-imported at package load time and written
 * to the build output by site-builder. The site plugin's head script
 * loads them via `<script src="/canvases/*.canvas.js" defer>`.
 *
 * All three variant canvases ship in the package so any brain can
 * switch variant via `site.variant` in brain.yaml without touching
 * the package: tree (ai), constellation (work), roots (foundation).
 */
const site: SitePackage = {
  theme: themeCSS,
  layouts: {
    default: DefaultLayout,
  },
  routes,
  plugin: (config?: Record<string, unknown>): Plugin =>
    new RizomSitePlugin(config ?? {}),
  entityDisplay: {},
  staticAssets: {
    "/canvases/tree.canvas.js": withPrelude(treeCanvas),
    "/canvases/constellation.canvas.js": withPrelude(constellationCanvas),
    "/canvases/roots.canvas.js": withPrelude(rootsCanvas),
    "/boot.js": bootScript,
  },
};

export default site;
