import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  PLAYBOOKS_REGISTER_LIFECYCLE_STARTER,
  type LifecycleStarterRegistration,
} from "@brains/contracts";
import {
  defineServicePlugin,
  z,
  type ServicePackageDefinition,
} from "@brains/sdk/services";

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

const onboardingPackage: ServicePackageDefinition<
  typeof onboardingConfigSchema
> = defineServicePlugin({
  id: "onboarding",
  config: onboardingConfigSchema,

  // Seeding waits for the packages whose types it writes.
  dependsOn: ["playbook", "playbooks"],

  // The playbooks themselves: written by the runtime, only where nothing with
  // that id exists at any visibility, so a seed never overwrites authored
  // content — and never at all when onboarding is disabled.
  seeds: ({ config }) =>
    config.enabled
      ? bundledPlaybooks.map((playbook) => ({
          entityType: "playbook",
          id: playbook.id,
          markdown: () => readBundledPlaybook(playbook.fileName),
        }))
      : [],

  // The lifecycle starters, announced once every plugin is registered.
  ready: async ({ config, messaging }) => {
    if (!config.enabled) return;
    for (const playbook of bundledPlaybooks) {
      if (!playbook.starter) continue;
      await messaging.send({
        type: PLAYBOOKS_REGISTER_LIFECYCLE_STARTER,
        payload: playbook.starter,
      });
    }
  },
});

export default onboardingPackage;
