import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  lifecycleStarterRegistrationContract,
  playbookSeedContract,
  type LifecycleStarterRegistration,
} from "@brains/contracts";
import {
  defineServicePlugin,
  z,
  type ServicePackageDefinition,
} from "@brains/sdk/services";
import {
  SYSTEM_CHANNELS,
  serviceRuntime,
} from "@brains/sdk/internal/service-runtime";
import { isNotFoundError } from "@brains/utils/predicates";

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

async function readBundledPlaybook(fileName: string): Promise<string> {
  try {
    return await readFile(
      join(import.meta.dir, "..", "content", "playbook", fileName),
      "utf8",
    );
  } catch (error) {
    if (!isNotFoundError(error)) throw error;
  }

  return readFile(join(import.meta.dir, "onboarding", fileName), "utf8");
}

/**
 * Onboarding: the bundled playbooks that set a new brain up, and the
 * starter that offers the first one to the first admin in web chat.
 */
const onboardingPackage: ServicePackageDefinition<
  typeof onboardingConfigSchema
> = defineServicePlugin(
  { id: "onboarding", config: onboardingConfigSchema },
  {
    subscriptions: (context) => {
      if (!context.config.enabled) return [];
      const { messaging } = context;
      const runtime = serviceRuntime(context);

      // Seeded once startup content settles, so a content repo's own
      // playbooks are imported first and never preceded by the bundled ones.
      // The playbook type's steward writes each only where none exists.
      runtime.listen(SYSTEM_CHANNELS.startupContentSettled, async () => {
        for (const playbook of bundledPlaybooks) {
          const seeded = await messaging.request(playbookSeedContract, {
            id: playbook.id,
            markdown: await readBundledPlaybook(playbook.fileName),
          });
          if (seeded.status !== "answered") {
            throw new Error(
              `Bundled playbook "${playbook.id}" was not seeded: ${seeded.status === "failed" ? seeded.error.message : "no playbook plugin answers"}`,
            );
          }
        }
      });

      runtime.ready(async () => {
        for (const playbook of bundledPlaybooks) {
          if (!playbook.starter) continue;
          await messaging.request(
            lifecycleStarterRegistrationContract,
            playbook.starter,
          );
        }
      });
      return [];
    },
  },
);

export default onboardingPackage;
