import type { BrainDefinition } from "@brains/app";
import type { PluginCapabilities } from "@brains/plugins";
import { timingSafeEqual } from "node:crypto";
import { mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "@brains/utils/zod";
import { ImportClaimHold } from "./import-claim-hold";

const descriptorSchema = z.strictObject({
  pid: z.number().int().positive(),
  port: z.number().int().min(1).max(65535),
});
const commandSchema = z.strictObject({
  operation: z.enum(["hold", "release"]),
});
const responseSchema = z.strictObject({ ready: z.boolean() });
const secretSchema = z.string().regex(/^[a-f0-9]{64}$/);

async function retire(
  actions: Array<() => void | Promise<void>>,
): Promise<void> {
  const failures: unknown[] = [];
  for (const action of actions) {
    try {
      await action();
    } catch (error) {
      failures.push(error);
    }
  }
  if (failures.length)
    throw new AggregateError(failures, "Import hold retirement failed", {
      cause: failures[0],
    });
}

/** Test control only; loopback, bounded commands, no SQL or owner capability exposure. */
export async function startImportHoldControl(
  hold: ImportClaimHold,
  directory: string,
  secret: string,
): Promise<{ close(): Promise<void> }> {
  const authorization = Buffer.from(`Bearer ${secret}`);
  const path = join(directory, `${process.pid}.json`);
  let accepting = true;
  const createServer = (): Bun.Server<undefined> =>
    Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      maxRequestBodySize: 256,
      fetch: async (request): Promise<Response> => {
        if (!accepting) return new Response(null, { status: 503 });
        const supplied = Buffer.from(
          request.headers.get("authorization") ?? "",
        );
        if (
          supplied.length !== authorization.length ||
          !timingSafeEqual(supplied, authorization)
        )
          return new Response(null, { status: 403 });
        if (request.method !== "POST" || new URL(request.url).pathname !== "/")
          return new Response(null, { status: 404 });
        const command = commandSchema.safeParse(await request.json());
        if (!command.success) return new Response(null, { status: 400 });
        if (command.data.operation === "release") {
          hold.release();
          return Response.json({ ready: true });
        }
        return Response.json({ ready: await hold.hold() });
      },
      // Never serialize credentials, stacks or private owner errors to control clients.
      error: (): Response => new Response(null, { status: 500 }),
    });
  let server: Bun.Server<undefined> | undefined;
  let closing: Promise<void> | undefined;
  const close = (): Promise<void> => {
    accepting = false;
    if (!closing) {
      // Begin both before joining: an admitted hold must observe retirement.
      const stopped = server?.stop(false) ?? Promise.resolve();
      const retired = hold.close();
      closing = retire([
        (): Promise<void> =>
          Promise.allSettled([stopped, retired]).then((results): void => {
            const errors = results
              .filter((result) => result.status === "rejected")
              .map((result) => result.reason);
            if (errors.length)
              throw new AggregateError(
                errors,
                "Import control did not retire",
                { cause: errors[0] },
              );
          }),
        (): Promise<void> => rm(path, { force: true }),
      ]);
    }
    return closing;
  };
  try {
    secretSchema.parse(secret);
    server = createServer();
    await mkdir(directory, { recursive: true });
    await writeFile(
      path,
      JSON.stringify(
        descriptorSchema.parse({ pid: process.pid, port: server.port }),
      ),
      { mode: 0o600 },
    );
    return { close };
  } catch (error) {
    const [cleanup] = await Promise.allSettled([close()]);
    if (cleanup.status === "rejected")
      throw new AggregateError(
        [error, cleanup.reason],
        "Import control setup and retirement failed",
        { cause: error },
      );
    throw error;
  }
}

/** Decorate the canonical instance, not a prototype or production registry. */
export function withImportHold(
  definition: BrainDefinition,
  options: { directory: string; secret: string; worker: boolean },
): BrainDefinition {
  return {
    ...definition,
    capabilities: definition.capabilities.map(
      (entry): BrainDefinition["capabilities"][number] => {
        const [id, factory, config] = entry;
        if (id !== "directory-sync" || !options.worker) return entry;
        return [
          id,
          (input): ReturnType<typeof factory> => {
            const result = factory(input);
            for (const plugin of Array.isArray(result) ? result : [result]) {
              const register = plugin.register.bind(plugin);
              const shutdown = plugin.shutdown?.bind(plugin);
              let control:
                Awaited<ReturnType<typeof startImportHoldControl>> | undefined;
              plugin.register = async (shell): Promise<PluginCapabilities> => {
                const capabilities = await register(shell);
                control = await startImportHoldControl(
                  new ImportClaimHold(shell.getJobQueueService()),
                  options.directory,
                  options.secret,
                );
                return capabilities;
              };
              plugin.shutdown = (): Promise<void> =>
                retire([
                  (): void | Promise<void> => control?.close(),
                  (): void | Promise<void> => shutdown?.(),
                ]);
            }
            return result;
          },
          config,
        ];
      },
    ),
  };
}

export class ImportHoldController {
  private readonly directory: string;
  private readonly secret: string;
  private readonly workers: readonly number[];
  private readonly timeoutMs: number;
  public constructor(
    directory: string,
    secret: string,
    workers: readonly number[],
    timeoutMs: number,
  ) {
    if (!workers.length)
      throw new Error("Import hold requires execution borrowers");
    this.directory = directory;
    this.secret = secretSchema.parse(secret);
    this.workers = [...workers];
    this.timeoutMs = timeoutMs;
  }
  public async arm(): Promise<boolean> {
    return (
      await Promise.all(this.workers.map((pid) => this.command(pid, "hold")))
    ).every(Boolean);
  }
  public async release(): Promise<void> {
    if (
      !(
        await Promise.all(
          this.workers.map((pid) => this.command(pid, "release")),
        )
      ).every(Boolean)
    )
      throw new Error("Import release was not acknowledged");
  }
  private async command(
    pid: number,
    operation: "hold" | "release",
  ): Promise<boolean> {
    const descriptor = descriptorSchema.parse(
      JSON.parse(await readFile(join(this.directory, `${pid}.json`), "utf8")),
    );
    if (descriptor.pid !== pid)
      throw new Error("Import control worker identity changed");
    const response = await fetch(`http://127.0.0.1:${descriptor.port}/`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.secret}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ operation }),
      signal: AbortSignal.timeout(this.timeoutMs),
      redirect: "error",
    });
    if (!response.ok)
      throw new Error(
        `Import control ${operation} refused (${response.status})`,
      );
    return responseSchema.parse(await response.json()).ready;
  }
}

/** Normal packaged CLI start loads this explicitly scoped, test-only package. */
export async function writeImportHoldPackage(
  appDirectory: string,
  cliDirectory: string,
): Promise<void> {
  const directory = join(appDirectory, "node_modules", "@test", "import-hold");
  await mkdir(directory, { recursive: true });
  // Package metadata resolution uses the application's dependency tree, not
  // NODE_PATH. Link the same built CLI artifact this fixture starts.
  await mkdir(join(appDirectory, "node_modules", "@rizom"), {
    recursive: true,
  });
  await symlink(
    cliDirectory,
    join(appDirectory, "node_modules", "@rizom", "brain"),
    "dir",
  );
  const metadata = z
    .object({ version: z.string() })
    .parse(
      JSON.parse(await readFile(join(cliDirectory, "package.json"), "utf8")),
    );
  await writeFile(
    join(directory, "package.json"),
    JSON.stringify({
      name: "@test/import-hold",
      version: "1.0.0",
      type: "module",
      exports: "./index.ts",
      peerDependencies: { "@rizom/brain": metadata.version },
    }),
  );
  await writeFile(
    join(directory, "index.ts"),
    `import definition from ${JSON.stringify(join(cliDirectory, "dist", "model.js"))};\nimport { withImportHold } from ${JSON.stringify(import.meta.path)};\nexport default withImportHold(definition, { directory: ${JSON.stringify(join(appDirectory, ".import-hold"))}, secret: process.env.IMPORT_HOLD_SECRET, worker: process.argv.includes("--child=worker") });\n`,
  );
}
