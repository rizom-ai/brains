import {
  defineServicePlugin,
  type ServicePackageDefinition,
} from "@brains/sdk/services";
import type { WebRouteDefinition } from "@brains/sdk/internal/interface-runtime";
import {
  serviceRuntime,
  withWebRoutes,
} from "@brains/sdk/internal/service-runtime";
import {
  a2aPeerTrustChangedChannel,
  BRAIN_BOT_LOCALPART,
  matrixBotCredentialsContract,
} from "@brains/contracts";
import { z } from "@brains/utils/zod";
import { ensureBotAccount, type MatrixFetch } from "./bot-account";
import {
  HOMESERVER_CLIENT_ID,
  homeserverCallbackUrl,
} from "./homeserver-config";
import {
  ensureHomeserverConfig,
  readHomeserverSecrets,
  type HomeserverSecrets,
} from "./homeserver-secrets";
import { PeerRooms } from "./peer-rooms";
import { forwardingRoutes, wellKnownRoutes } from "./routes";

/** How long to wait before asking a homeserver that is still starting again. */
const BOT_RETRY_DELAY_MS = 15_000;

export const matrixServerConfigSchema: z.ZodObject<{
  homeserverUrl: z.ZodURL;
  serverName: z.ZodString;
  publicBaseUrl: z.ZodOptional<z.ZodURL>;
  dataDir: z.ZodString;
}> = z.strictObject({
  homeserverUrl: z
    .url()
    .describe("Where the brain reaches its homeserver, inside the deploy"),
  serverName: z
    .string()
    .min(1)
    .describe("The Matrix server name: the brain's domain"),
  publicBaseUrl: z
    .url()
    .optional()
    .describe("The brain's public origin; https://<serverName> by default"),
  dataDir: z
    .string()
    .min(1)
    .describe(
      "The directory the brain shares with the homeserver, where the brain writes its configuration",
    ),
});

export type MatrixServerConfig = z.output<typeof matrixServerConfigSchema>;

export interface MatrixServerState {
  routes: WebRouteDefinition[];
}

export interface MatrixServerDeps {
  fetch?: MatrixFetch | undefined;
}

/**
 * The brain's Matrix homeserver, which runs beside it: the brain fronts its
 * traffic at the brain's own origin, publishes the discovery documents that
 * send federation and clients there, makes sure its bot account exists, and
 * registers the homeserver as the OAuth client people sign in through.
 */
export function createMatrixServerPackage(
  deps: MatrixServerDeps = {},
): ServicePackageDefinition<typeof matrixServerConfigSchema> {
  const service = defineServicePlugin({
    id: "matrix-server",
    config: matrixServerConfigSchema,
    setup: (context): MatrixServerState => {
      const runtime = serviceRuntime(context);
      const config = context.config;
      const publicBaseUrl = (
        config.publicBaseUrl ?? `https://${config.serverName}`
      ).replace(/\/+$/, "");
      const botUserId = `@${BRAIN_BOT_LOCALPART}:${config.serverName}`;

      // The main process writes the homeserver's configuration, keeping the
      // secrets it already holds; a job worker only reads them.
      const secrets: Promise<HomeserverSecrets | undefined> =
        runtime.executionOnly
          ? readHomeserverSecrets(config.dataDir)
          : ensureHomeserverConfig({
              dataDir: config.dataDir,
              serverName: config.serverName,
              publicBaseUrl,
            }).then(({ secrets: held, changed }) => {
              if (changed) {
                runtime.logger.info(
                  "Wrote the homeserver configuration; the homeserver reads it when it starts",
                );
              }
              return held;
            });
      // Keep a failed read from going unhandled until someone asks.
      secrets.catch((error: unknown) =>
        runtime.logger.error("Homeserver configuration unavailable", { error }),
      );
      const requireSecrets = async (): Promise<HomeserverSecrets> => {
        const held = await secrets;
        if (!held)
          throw new Error("The homeserver configuration is not written yet");
        return held;
      };

      runtime.answer(
        matrixBotCredentialsContract,
        async () => ({
          userId: botUserId,
          password: (await requireSecrets()).botPassword,
        }),
        { everyProcess: true },
      );

      // A job worker serves no HTTP and leaves the homeserver alone.
      if (runtime.executionOnly) return { routes: [] };

      // A room per trusted peer, opened and closed as trust changes.
      const peerRooms = secrets.then(
        (held) =>
          held &&
          new PeerRooms({
            homeserverUrl: config.homeserverUrl,
            serverName: config.serverName,
            botUserId,
            botPassword: held.botPassword,
            ...(deps.fetch ? { fetch: deps.fetch } : {}),
          }),
      );
      runtime.listen(
        a2aPeerTrustChangedChannel,
        async ({ payload }) => {
          try {
            const rooms = await peerRooms;
            if (!rooms) return;
            await (payload.level === "trusted"
              ? rooms.trusted(payload.domain)
              : rooms.revoked(payload.domain));
          } catch (error) {
            runtime.logger.warn("Could not update the peer's Matrix room", {
              error,
              domain: payload.domain,
              level: payload.level,
            });
          }
        },
        { mode: "observe" },
      );

      runtime.ready(async () => {
        const held = await requireSecrets();
        // Provisioning again on each start keeps the secret in step with
        // the one the homeserver's configuration was written with.
        await runtime.auth()?.provisionOAuthClient({
          clientId: HOMESERVER_CLIENT_ID,
          clientSecret: held.oidcClientSecret,
          clientName: "Matrix homeserver",
          redirectUris: [homeserverCallbackUrl(publicBaseUrl)],
          // A sign-in through the homeserver proves the person's Matrix id,
          // which the brain then records as theirs.
          identityClaim: {
            type: "matrix",
            subjectPrefix: "@",
            subjectSuffix: `:${config.serverName}`,
          },
        });

        const ensureBot = async (): Promise<void> => {
          try {
            const outcome = await ensureBotAccount({
              homeserverUrl: config.homeserverUrl,
              userId: botUserId,
              password: held.botPassword,
              registrationToken: held.registrationToken,
              ...(deps.fetch ? { fetch: deps.fetch } : {}),
            });
            if (outcome === "registered") {
              runtime.logger.info("Registered the Matrix bot account", {
                userId: botUserId,
              });
            }
          } catch (error) {
            // The homeserver may still be starting; the chat adapter retries
            // its own login, and this asks again until the bot exists.
            runtime.logger.warn("Matrix bot account not ready yet", { error });
            setTimeout(() => void ensureBot(), BOT_RETRY_DELAY_MS).unref();
          }
        };
        await ensureBot();
      });

      return {
        routes: [
          ...wellKnownRoutes({ serverName: config.serverName, publicBaseUrl }),
          ...forwardingRoutes({
            homeserverUrl: config.homeserverUrl,
            ...(deps.fetch ? { fetch: deps.fetch } : {}),
            onUnreachable: (error, path): void =>
              runtime.logger.warn("The homeserver did not answer", {
                error,
                path,
              }),
          }),
        ],
      };
    },
  });

  return withWebRoutes<typeof matrixServerConfigSchema, MatrixServerState>(
    service,
    ({ state }) => state.routes,
  );
}

export const matrixServerPackage: ServicePackageDefinition<
  typeof matrixServerConfigSchema
> = createMatrixServerPackage();
