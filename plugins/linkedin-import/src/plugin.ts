import type { Tool } from "@brains/plugins";
import { ServicePlugin } from "@brains/plugins";
import { z } from "@brains/utils/zod";
import { LinkedInDistillationJobHandler } from "./handlers/linkedin-distillation-handler";
import { LinkedInImportJobHandler } from "./handlers/linkedin-import-handler";
import { LinkedInClient, type LinkedInFetch } from "./lib/linkedin-client";
import { createLinkedInImportTools } from "./tools";
import { createLinkedInDistillationTools } from "./tools/distillation";
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
  private cachedClient: LinkedInClient | null = null;
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

    const context = this.getContext();
    this.cachedTools = [
      ...createLinkedInImportTools(this.id, {
        client: this.getClient(),
        entityService: context.entityService,
        jobs: context.jobs,
      }),
      ...createLinkedInDistillationTools(this.id, {
        ai: context.ai,
        entityService: context.entityService,
        jobs: context.jobs,
      }),
    ];
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
          client: this.getClient(),
          entityService: context.entityService,
        },
      ),
    );
    context.jobs.registerHandler(
      "linkedin-profile-distill",
      new LinkedInDistillationJobHandler(
        this.logger.child("LinkedInDistillationJobHandler"),
        context.entityService,
      ),
    );
  }

  private getClient(): LinkedInClient {
    this.cachedClient ??= new LinkedInClient(
      this.config.accessToken ?? "",
      this.deps.fetch ?? globalThis.fetch,
    );
    return this.cachedClient;
  }
}

export function linkedinImportPlugin(
  config: LinkedInImportConfigInput = {},
  deps: LinkedInImportDeps = {},
): LinkedInImportPlugin {
  return new LinkedInImportPlugin(config, deps);
}
