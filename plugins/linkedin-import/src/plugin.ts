import type { Tool } from "@brains/plugins";
import { ServicePlugin } from "@brains/plugins";
import { z } from "@brains/utils/zod";
import { LinkedInImportJobHandler } from "./handlers/linkedin-import-handler";
import { LinkedInClient, type LinkedInFetch } from "./lib/linkedin-client";
import { createLinkedInImportTools } from "./tools";
import packageJson from "../package.json" with { type: "json" };

export interface LinkedInImportConfig {
  accessToken?: string | undefined;
}

export type LinkedInImportConfigInput = LinkedInImportConfig;

const linkedinImportConfigSchema: z.ZodType<
  LinkedInImportConfig,
  LinkedInImportConfigInput
> = z.object({
  accessToken: z
    .string()
    .optional()
    .describe("LinkedIn member data portability access token"),
});

export interface LinkedInImportDeps {
  fetch?: LinkedInFetch | undefined;
}

export class LinkedInImportPlugin extends ServicePlugin<
  LinkedInImportConfig,
  LinkedInImportConfigInput
> {
  private readonly deps: LinkedInImportDeps;
  private cachedTools: Tool[] | null = null;

  constructor(
    config: LinkedInImportConfigInput = {},
    deps: LinkedInImportDeps = {},
  ) {
    super("linkedin-import", packageJson, config, linkedinImportConfigSchema);
    this.deps = deps;
  }

  protected override async getTools(): Promise<Tool[]> {
    if (!this.config.accessToken) return [];
    if (this.cachedTools) return this.cachedTools;

    this.cachedTools = createLinkedInImportTools(this.id, {
      jobs: this.getContext().jobs,
    });
    return this.cachedTools;
  }

  protected override async registerJobHandlers(): Promise<void> {
    if (!this.config.accessToken) return;

    const context = this.getContext();
    context.jobs.registerHandler(
      "linkedin-import",
      new LinkedInImportJobHandler(
        this.logger.child("LinkedInImportJobHandler"),
        {
          client: new LinkedInClient(
            this.config.accessToken,
            this.deps.fetch ?? globalThis.fetch,
          ),
          entityService: context.entityService,
        },
      ),
    );
  }
}

export function linkedinImportPlugin(
  config: LinkedInImportConfigInput = {},
  deps: LinkedInImportDeps = {},
): LinkedInImportPlugin {
  return new LinkedInImportPlugin(config, deps);
}
