import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  PLAYBOOKS_REGISTER_LIFECYCLE_STARTER,
  type LifecycleStarterRegistration,
} from "@brains/contracts";
import type { Plugin, ServicePluginContext } from "@brains/plugins";
import { ServicePlugin } from "@brains/plugins";
import { z } from "@brains/utils/zod";
import packageJson from "../package.json";

const roverOnboardingConfigSchema = z
  .object({
    enabled: z.boolean().default(false),
  })
  .strict();

export type RoverOnboardingConfig = z.infer<typeof roverOnboardingConfigSchema>;

interface BundledPlaybook {
  id: string;
  fileName: string;
  starter?: LifecycleStarterRegistration | undefined;
}

const bundledPlaybooks: BundledPlaybook[] = [
  {
    id: "rover-onboarding",
    fileName: "rover-onboarding.md",
    starter: {
      id: "onboarding",
      trigger: "first-anchor-web-chat",
      playbookId: "rover-onboarding",
      once: true,
      starterText: "Set up Rover",
      description:
        "Tune Rover's identity and anchor profile before using the knowledge loop.",
      starterPrompt: "Start playbook rover-onboarding.",
    },
  },
  {
    id: "rover-first-knowledge-loop",
    fileName: "rover-first-knowledge-loop.md",
  },
];

export class RoverOnboardingPlugin extends ServicePlugin<RoverOnboardingConfig> {
  readonly dependencies = ["playbook", "playbooks"];

  constructor(config: Partial<RoverOnboardingConfig> = {}) {
    super("rover-onboarding", packageJson, config, roverOnboardingConfigSchema);
  }

  protected override async onReady(
    context: ServicePluginContext,
  ): Promise<void> {
    if (!this.config.enabled) return;

    for (const playbook of bundledPlaybooks) {
      await this.seedPlaybookIfMissing(context, playbook);
    }

    for (const playbook of bundledPlaybooks) {
      if (!playbook.starter) continue;
      await context.messaging.send({
        type: PLAYBOOKS_REGISTER_LIFECYCLE_STARTER,
        payload: playbook.starter,
      });
    }
  }

  private async seedPlaybookIfMissing(
    context: ServicePluginContext,
    playbook: BundledPlaybook,
  ): Promise<void> {
    const existing = await context.entityService.getEntity({
      entityType: "playbook",
      id: playbook.id,
      visibilityScope: "restricted",
    });
    if (existing) return;

    const markdown = await readFile(
      join(import.meta.dir, "..", "content", "playbook", playbook.fileName),
      "utf8",
    );
    await context.entityService.createEntityFromMarkdown({
      input: {
        entityType: "playbook",
        id: playbook.id,
        markdown,
      },
    });
  }
}

export function roverOnboardingPlugin(
  config: Partial<RoverOnboardingConfig> = {},
): Plugin {
  return new RoverOnboardingPlugin(config);
}
