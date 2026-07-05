import { listCanonicalAtprotoLexicons } from "@brains/atproto-contracts";
import type {
  RizomPluginCapabilities,
  RizomRuntimeConfig,
  RizomSiteShell,
  RizomThemeProfile,
} from "../contracts";
import canvasPrelude from "./canvases/prelude.canvas.js" with { type: "text" };
import treeCanvas from "./canvases/tree.canvas.js" with { type: "text" };
import constellationCanvas from "./canvases/constellation.canvas.js" with { type: "text" };
import rootsCanvas from "./canvases/roots.canvas.js" with { type: "text" };
import bootScript from "./boot/boot.boot.js" with { type: "text" };

export type { RizomRuntimeConfig, RizomThemeProfile } from "../contracts";

const THEME_PROFILES = new Set<string>(["product", "editorial", "studio"]);

function isRizomThemeProfile(value: unknown): value is RizomThemeProfile {
  return typeof value === "string" && THEME_PROFILES.has(value);
}

function parseRuntimeConfig(
  config: Record<string, unknown>,
): RizomRuntimeConfig {
  const themeProfile = config["themeProfile"];
  const theme = config["theme"];

  return {
    ...(isRizomThemeProfile(themeProfile) ? { themeProfile } : {}),
    ...(typeof theme === "string" ? { theme } : {}),
  };
}

const CANVAS_BY_THEME_PROFILE: Record<RizomThemeProfile, string> = {
  product: "/canvases/tree.canvas.js",
  editorial: "/canvases/roots.canvas.js",
  studio: "/canvases/constellation.canvas.js",
};

export const RIZOM_ATPROTO_LEXICON_BASE_PATH = "/atproto/lexicons";

function formatLexiconJson(lexicon: unknown): string {
  return `${JSON.stringify(lexicon, null, 2)}\n`;
}

export const rizomAtprotoLexiconStaticAssets: Record<string, string> =
  Object.fromEntries(
    listCanonicalAtprotoLexicons().map((lexicon) => [
      `${RIZOM_ATPROTO_LEXICON_BASE_PATH}/${lexicon.id}.json`,
      formatLexiconJson(lexicon),
    ]),
  );

export const rizomRuntimeStaticAssets: Record<string, string> = {
  ...rizomAtprotoLexiconStaticAssets,
  "/canvases/prelude.canvas.js": canvasPrelude,
  "/canvases/tree.canvas.js": treeCanvas,
  "/canvases/constellation.canvas.js": constellationCanvas,
  "/canvases/roots.canvas.js": rootsCanvas,
  "/boot.js": bootScript,
};

export class RizomRuntimePlugin {
  public readonly id = "rizom-site";
  public readonly version = "0.1.0";
  public readonly type = "service" as const;
  public readonly packageName: string;
  public readonly description: string;
  public readonly config: RizomRuntimeConfig;

  constructor(packageName: string, config: Record<string, unknown> = {}) {
    this.packageName = packageName;
    this.description = `${packageName} plugin`;
    this.config = parseRuntimeConfig(config);
  }

  async register(
    shell: RizomSiteShell,
    _context?: unknown,
  ): Promise<RizomPluginCapabilities> {
    await this.onRegister(shell);
    return { tools: [], resources: [] };
  }

  protected async onRegister(shell: RizomSiteShell): Promise<void> {
    const themeProfile = this.getThemeProfile();
    const canvasPath = this.getCanvasPath(themeProfile);
    const messaging = shell.getMessageBus();

    messaging.subscribe("system:plugins:ready", async () => {
      await messaging.send({
        type: "plugin:site-builder:head-script:register",
        sender: this.id,
        payload: {
          pluginId: this.id,
          script: this.buildHeadScript(themeProfile, canvasPath),
        },
      });
      return { success: true };
    });

    shell
      .getLogger()
      .info(
        `Rizom runtime plugin registered${themeProfile ? ` (theme profile: ${themeProfile})` : ""}`,
      );
  }

  protected getThemeProfile(): RizomThemeProfile | undefined {
    return this.config.themeProfile;
  }

  protected getCanvasPath(
    themeProfile?: RizomThemeProfile,
  ): string | undefined {
    return themeProfile ? CANVAS_BY_THEME_PROFILE[themeProfile] : undefined;
  }

  protected buildHeadScript(
    themeProfile?: string,
    canvasPath?: string,
  ): string {
    const scripts = [`<script src="/boot.js" defer></script>`];

    if (themeProfile) {
      const themeProfileJson = JSON.stringify(themeProfile);
      scripts.unshift(
        `<script>document.documentElement.setAttribute("data-theme-profile", ${themeProfileJson});</script>`,
      );
    }

    if (canvasPath) {
      scripts.push(`<script src="/canvases/prelude.canvas.js" defer></script>`);
      scripts.push(`<script src="${canvasPath}" defer></script>`);
    }

    return scripts.join("");
  }
}
