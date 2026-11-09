import { afterEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import chatInterface from "@brains/chat";
import {
  instantiatePluginPackageDefinition,
  type Plugin,
} from "@brains/plugins";
import { createMockShell } from "@brains/plugins/test";
import { createSilentLogger } from "@brains/test-utils";
import { refuseNetwork } from "./helpers/refuse-network";
import { ServerManager, type ServerManagerOptions } from "@brains/webserver";

type RegisteredHttpRoute = ReturnType<
  NonNullable<ServerManagerOptions["getRoutes"]>
>[number];

type Dispatch = (request: Request) => Response | Promise<Response>;

/**
 * Chat's platform upload routes retired with its conversion: nothing has
 * written their stores since chat moved its uploads to the shared one, and
 * the shared host answers their old URLs as it answers any path no plugin
 * serves.
 */
describe("chat's retired platform upload URLs on the shared host", () => {
  refuseNetwork();
  const dirs: string[] = [];

  afterEach(() => {
    for (const dir of dirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  async function sharedHost(): Promise<Dispatch> {
    const dir = mkdtempSync(join(tmpdir(), "chat-retired-routes-"));
    dirs.push(dir);
    const plugins: Plugin[] = instantiatePluginPackageDefinition(
      chatInterface,
      {
        adapters: {
          discord: {
            applicationId: "fixture-application",
            botToken: "fixture-token",
            publicKey: "a".repeat(64),
          },
        },
      },
      { name: "@brains/chat", version: "0.0.0-test" },
      { pluginId: "chat" },
    );
    for (const plugin of plugins) {
      await plugin.register(createMockShell({ dataDir: dir }));
    }
    const routes: RegisteredHttpRoute[] = plugins.flatMap((plugin) =>
      (plugin.getWebRoutes?.() ?? []).map((route): RegisteredHttpRoute => ({
        kind: "handler",
        ownerPluginId: plugin.id,
        fullPath: route.path,
        method: route.method ?? "GET",
        match: route.match ?? "exact",
        sharedHostAdmission: "admit",
        handler: route.handler,
      })),
    );
    let dispatch: Dispatch | undefined;
    const manager = new ServerManager({
      logger: createSilentLogger("chat-retired-routes"),
      productionDistDir: dir,
      sharedImagesDir: dir,
      productionPort: 0,
      getRoutes: (): RegisteredHttpRoute[] => routes,
      serve: (
        options,
      ): ReturnType<NonNullable<ServerManagerOptions["serve"]>> => {
        dispatch = (request): Response | Promise<Response> =>
          options.fetch(request, { requestIP: () => null });
        return { port: 0, stop: (): void => {} };
      },
    });
    await manager.start();
    if (!dispatch) throw new Error("The shared host served nothing");
    return dispatch;
  }

  it.each(["discord", "slack"])(
    "answers 404 for the old %s upload URL",
    async (platform) => {
      const dispatch = await sharedHost();

      const response = await dispatch(
        new Request(
          `http://127.0.0.1/api/webhooks/chat/${platform}/uploads?id=upload-00000000-0000-4000-8000-000000000000`,
        ),
      );

      expect(response.status).toBe(404);
    },
  );

  it("still routes the webhooks beside them", async () => {
    const dispatch = await sharedHost();

    const response = await dispatch(
      new Request("http://127.0.0.1/api/webhooks/chat/discord", {
        method: "POST",
        body: "{}",
      }),
    );

    expect(response.status).not.toBe(404);
  });
});
