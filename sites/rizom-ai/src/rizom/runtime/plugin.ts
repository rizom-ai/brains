import { SITE_BUILDER_CHANNELS } from "@brains/contracts";
import { listCanonicalAtprotoLexicons } from "@brains/atproto-contracts";
import { SYSTEM_CHANNELS } from "@brains/plugins/system-channels";
import type {
  RizomPluginCapabilities,
  RizomRuntimeConfig,
  RizomSiteShell,
} from "../contracts";
import bootScript from "./boot/boot.boot.js" with { type: "text" };

export type { RizomRuntimeConfig } from "../contracts";

function parseRuntimeConfig(
  config: Record<string, unknown>,
): RizomRuntimeConfig {
  const theme = config["theme"];

  if (theme !== undefined && typeof theme !== "string") {
    throw new Error(
      `Invalid rizom site theme ${JSON.stringify(theme)}; expected a package name string`,
    );
  }

  return {
    ...(theme !== undefined ? { theme } : {}),
  };
}

export function buildRizomHeadScript(): string {
  return `<script src="/boot.js" defer></script>`;
}

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
    const messaging = shell.getMessageBus();

    messaging.subscribe(SYSTEM_CHANNELS.pluginsRegistered, async () => {
      await messaging.send({
        type: SITE_BUILDER_CHANNELS.headScriptRegister,
        sender: this.id,
        payload: {
          pluginId: this.id,
          script: buildRizomHeadScript(),
        },
      });
      return { success: true };
    });

    shell.getLogger().info("Rizom runtime plugin registered");
  }
}
