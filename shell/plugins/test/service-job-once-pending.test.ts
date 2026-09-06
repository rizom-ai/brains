import { afterEach, describe, expect, it } from "bun:test";
import { createSilentLogger } from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import {
  defineJob,
  defineServicePlugin,
  instantiatePluginPackageDefinition,
  type ServiceJobs,
} from "../src";
import { createPluginHarness } from "../src/test/harness";

const buildInput = z.object({ environment: z.enum(["preview", "production"]) });
const buildOutput = z.object({ built: z.boolean() });

/**
 * A rebuild that is already waiting will render whatever the brain says when
 * it runs, so queueing a second one adds a duplicate build and nothing else.
 * The declaration says what "the same work" means; the queue does the rest.
 * Named consumer: @brains/site-builder.
 */
describe("work that should only wait once", () => {
  const harness = createPluginHarness({
    logger: createSilentLogger("service-once-pending-test"),
  });

  afterEach(async () => {
    await harness.reset();
  });

  const siteBuild = defineJob({
    name: "site-build",
    input: buildInput,
    output: buildOutput,
    oncePending: (input) => `site-build:${input.environment}`,
  });

  const plainBuild = defineJob({
    name: "plain-build",
    input: buildInput,
    output: buildOutput,
  });

  async function install(): Promise<ServiceJobs> {
    let captured: ServiceJobs | undefined;
    const [plugin] = instantiatePluginPackageDefinition(
      defineServicePlugin({
        id: "site-builder",
        config: z.object({}),
        setup: ({ jobs }) => {
          captured = jobs;
          return {};
        },
        jobs: () => [
          siteBuild.handle(async () => ({ built: true })),
          plainBuild.handle(async () => ({ built: true })),
        ],
      }),
      {},
      { name: "@fixture/site-builder", version: "0.1.0" },
    );
    if (!plugin) throw new Error("Service plugin was not created");
    await harness.installPlugin(plugin);
    if (!captured) throw new Error("setup did not run");
    return captured;
  }

  it("hands back the waiting job rather than queueing a second", async () => {
    const jobs = await install();

    const first = await jobs.enqueue(siteBuild, { environment: "preview" });
    const second = await jobs.enqueue(siteBuild, { environment: "preview" });

    expect(second.id).toBe(first.id);
    expect(await jobs.recent({ types: ["site-build"] })).toHaveLength(1);
  });

  it("keeps different keys apart", async () => {
    const jobs = await install();

    const preview = await jobs.enqueue(siteBuild, { environment: "preview" });
    const production = await jobs.enqueue(siteBuild, {
      environment: "production",
    });

    expect(production.id).not.toBe(preview.id);
  });

  it("leaves work that declared no key alone", async () => {
    const jobs = await install();

    const first = await jobs.enqueue(plainBuild, { environment: "preview" });
    const second = await jobs.enqueue(plainBuild, { environment: "preview" });

    expect(second.id).not.toBe(first.id);
  });
});
