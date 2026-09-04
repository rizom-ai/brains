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

const onboardingConfigSchema: z.ZodObject<
  { enabled: z.ZodDefault<z.ZodBoolean> },
  z.core.$strict
> = z
  .object({
    enabled: z.boolean().default(false),
  })
  .strict();

export type OnboardingConfig = z.output<typeof onboardingConfigSchema>;
export type OnboardingConfigInput = z.input<typeof onboardingConfigSchema>;

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

    const markdown = await readBundledPlaybook(playbook.fileName);
    await context.entityService.createEntityFromMarkdown({
      input: {
        entityType: "playbook",
        id: playbook.id,
        markdown,
      },
    });
  }
}

async function readBundledPlaybook(fileName: string): Promise<string> {
  try {
    return await readFile(
      join(import.meta.dir, "..", "content", "playbook", fileName),
      "utf8",
    );
  } catch (error) {
    if (
      !(error instanceof Error) ||
      !("code" in error) ||
      error.code !== "ENOENT"
    ) {
      throw error;
    }
  }

  return readFile(join(import.meta.dir, "onboarding", fileName), "utf8");
}

export function onboardingPlugin(config: OnboardingConfigInput = {}): Plugin {
  return new OnboardingPlugin(config);
}
