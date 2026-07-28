import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  PLAYBOOKS_REGISTER_LIFECYCLE_STARTER,
  type LifecycleStarterRegistration,
} from "@brains/playbooks";
import type { Plugin, ServicePluginContext } from "@brains/plugins";
import { ServicePlugin } from "@brains/plugins";
import { z } from "@brains/utils/zod";
import packageJson from "../package.json";

export interface OnboardingConfig {
  enabled: boolean;
}

export interface OnboardingConfigInput {
  enabled?: boolean | undefined;
}

const onboardingConfigSchema: z.ZodType<
  OnboardingConfig,
  OnboardingConfigInput
> = z
  .object({
    enabled: z.boolean().default(false),
  })
  .strict();

interface BundledPlaybook {
  id: string;
  fileName: string;
  starter?: LifecycleStarterRegistration | undefined;
}

const bundledPlaybooks: BundledPlaybook[] = [
  {
    id: "onboarding",
    fileName: "onboarding.md",
    starter: {
      id: "onboarding",
      trigger: "first-admin-web-chat",
      playbookId: "onboarding",
      once: true,
      starterText: "Set up your brain",
      description:
        "Tune the brain identity and anchor profile before using the knowledge loop.",
      starterPrompt: "Start playbook onboarding.",
    },
  },
  {
    id: "first-knowledge-loop",
    fileName: "first-knowledge-loop.md",
  },
];

export class OnboardingPlugin extends ServicePlugin<
  OnboardingConfig,
  OnboardingConfigInput
> {
  readonly dependencies: string[] = ["playbook", "playbooks"];

  constructor(config: OnboardingConfigInput = {}) {
    super("onboarding", packageJson, config, onboardingConfigSchema);
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

export function onboardingPlugin(config: OnboardingConfigInput = {}): Plugin {
  return new OnboardingPlugin(config);
}
