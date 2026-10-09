import { afterEach, describe, expect, it, mock } from "bun:test";
import { createSilentLogger, createTestDirectory } from "@brains/test-utils";
import { migrateEntities } from "@brains/entity-service/migrate";
import { migrateJobQueue } from "@brains/job-queue/migrate";
import { migrateRuntimeState } from "@brains/runtime-state/migrate";
import { createEntityPluginContext } from "@brains/plugins";
import { z } from "@brains/utils/zod";
import { deferred } from "@brains/utils/deferred";
import { Shell } from "../src/shell";
import { createTestShellConfig } from "./helpers/test-config";

describe("shell template generation cancellation", () => {
  let shell: Shell | undefined;
  let directory: Awaited<ReturnType<typeof createTestDirectory>> | undefined;
  afterEach(async () => {
    await shell?.shutdown();
    await directory?.cleanup();
  });

  it("propagates a job deadline through the content service to the provider", async () => {
    directory = await createTestDirectory();
    await migrateEntities({ url: `file:${directory.dir}/test.db` });
    await migrateJobQueue({ url: `file:${directory.dir}/test-jobs.db` });
    await migrateRuntimeState({
      url: `file:${directory.dir}/test-runtime-state.db`,
    });
    const started = deferred();
    let receivedSignal: AbortSignal | undefined;
    const generate = mock(
      (
        _system: string,
        _user: string,
        _schema: unknown,
        signal?: AbortSignal,
      ): Promise<never> => {
        receivedSignal = signal;
        started.resolve();
        return new Promise((_, reject) => {
          signal?.addEventListener("abort", () => reject(signal.reason), {
            once: true,
          });
        });
      },
    );
    shell = Shell.createFresh(createTestShellConfig(directory.dir), {
      logger: createSilentLogger(),
    });
    shell.getAIService().generateObject = generate;
    await shell.initialize({ mode: "startup-check" });
    shell.registerTemplates(
      {
        cancellable: {
          name: "test:cancellable",
          description: "Cancellation probe",
          requiredPermission: "public",
          dataSourceId: "shell:ai-content",
          schema: z.string(),
          basePrompt: "Generate a result",
        },
      },
      "test",
    );
    const controller = new AbortController();
    const result = createEntityPluginContext(shell, "test").ai.generate(
      {
        templateName: "test:cancellable",
        prompt: "source",
        representedIdentity: "none",
      },
      z.string(),
      controller.signal,
    );
    const settled = result.catch((error: unknown) => error);
    await started.promise;
    expect(receivedSignal).toBe(controller.signal);
    const reason = new Error("job deadline");
    controller.abort(reason);
    expect(await settled).toBe(reason);
    expect(generate).toHaveBeenCalledTimes(1);
  });
});
