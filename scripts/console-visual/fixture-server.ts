import { readFile } from "node:fs/promises";
import path from "node:path";
import { getErrorMessage } from "@brains/utils/error";
import { studioAssetManifestSchema } from "../../plugins/studio/src/ui-assets";
import { createAdministrationFixture } from "../fixtures/studio-administration";
import { createDeliveryViewFixtures } from "../fixtures/studio-delivery-views";
import { createSyncViewFixture } from "../fixtures/studio-sync-view";
import { createWorkViewFixtures } from "../fixtures/studio-work-views";
import {
  pinConsoleFonts,
  servePinnedConsoleFont,
} from "../lib/pinned-console-fonts";
import {
  createFixtureRoutes,
  type FixtureServerState,
  type StudioAssets,
} from "./fixture-routes";
import { FIXED_NOW, ROOT, STUDY_STATE } from "./options";
import { solidPng } from "./png";

export interface FixtureServer {
  /** `http://127.0.0.1:<port>`. */
  origin: string;
  state: FixtureServerState;
  /** Releases held uploads, stops serving, and disposes the fixtures. */
  stop(): Promise<void>;
}

async function loadStudioAssets(): Promise<StudioAssets> {
  const directory = path.join(ROOT, "plugins/studio/dist/ui");
  const manifest = studioAssetManifestSchema.parse(
    JSON.parse(
      await readFile(
        path.join(directory, "studio-asset-manifest.json"),
        "utf8",
      ),
    ),
  );
  await readFile(path.join(directory, manifest.entrypoints.script)).catch(
    () => {
      throw new Error(
        "Build @brains/studio UI assets before visual regression.",
      );
    },
  );
  return { directory, manifest };
}

export async function startFixtureServer(): Promise<FixtureServer> {
  const studio = await loadStudioAssets();
  // Deterministic preview image for the attachment card: a flat verdigris
  // board rendered once at startup.
  const fixtureImage = solidPng(480, 270, [61, 107, 92, 255]);
  const administration = await createAdministrationFixture(
    FIXED_NOW,
    STUDY_STATE,
  );
  const workViews = await createWorkViewFixtures(STUDY_STATE);
  const deliveryViews = await createDeliveryViewFixtures(STUDY_STATE);
  const syncView = await createSyncViewFixture(STUDY_STATE);
  const state: FixtureServerState = {
    reviewingSystem: false,
    lastSystemSave: undefined,
  };
  const routes = createFixtureRoutes({
    studyState: STUDY_STATE,
    state,
    studio,
    fixtureImage,
    administration,
    workViews,
    deliveryViews,
    syncView,
  });
  const server = Bun.serve({
    port: 0,
    // Pages and stylesheets load the pinned fonts, never Google's: the
    // baselines are drawn with one exact build of each face.
    async fetch(request) {
      const font = await servePinnedConsoleFont(new URL(request.url).pathname);
      if (font) return font;
      const response = await routes.fetch(request);
      const type = response.headers.get("content-type") ?? "";
      if (!type.includes("text/html") && !type.includes("text/css"))
        return response;
      const headers = new Headers(response.headers);
      headers.delete("content-length");
      return new Response(await pinConsoleFonts(await response.text()), {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    },
    // A page the harness cannot serve as captured fails the run loudly, not
    // only inside a screenshot.
    error(error) {
      console.error(error);
      process.exitCode = 1;
      return new Response(getErrorMessage(error), { status: 500 });
    },
  });
  return {
    origin: `http://127.0.0.1:${server.port}`,
    state,
    async stop(): Promise<void> {
      routes.releasePendingUploads();
      await server.stop(true);
      await administration.dispose();
    },
  };
}
