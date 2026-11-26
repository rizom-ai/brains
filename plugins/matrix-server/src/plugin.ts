import {
  defineServicePlugin,
  type ServicePackageDefinition,
} from "@brains/sdk/services";
import type { WebRouteDefinition } from "@brains/sdk/internal/interface-runtime";
import {
  serviceRuntime,
  withWebRoutes,
} from "@brains/sdk/internal/service-runtime";
import { z } from "@brains/utils/zod";
import { ensureBotAccount, type MatrixFetch } from "./bot-account";
import {
  HOMESERVER_CLIENT_ID,
  homeserverCallbackUrl,
} from "./homeserver-config";
import { forwardingRoutes, wellKnownRoutes } from "./routes";

/** How long to wait before asking a homeserver that is still starting again. */
const BOT_RETRY_DELAY_MS = 15_000;

export const matrixServerConfigSchema: z.ZodObject<{
  homeserverUrl: z.ZodURL;
  serverName: z.ZodString;
  publicBaseUrl: z.ZodOptional<z.ZodURL>;
  botUserId: z.ZodString;
  botPassword: z.ZodString;
  registrationToken: z.ZodString;
  oidcClientSecret: z.ZodString;
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
  botUserId: z
    .string()
    .regex(/^@[a-z0-9._=/+-]+:[A-Za-z0-9.-]+(:[0-9]+)?$/)
    .describe("The bot's full Matrix user id"),
  botPassword: z.string().min(16).describe("The bot's Matrix password"),
  registrationToken: z
    .string()
    .min(16)
    .describe("The token that alone opens registration on the homeserver"),
  oidcClientSecret: z
    .string()
    .min(32)
    .describe("The secret the homeserver signs people in to the brain with"),
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
      // A job worker serves no HTTP and leaves the homeserver alone.
      if (runtime.executionOnly) return { routes: [] };

      const config = context.config;
      const publicBaseUrl = (
        config.publicBaseUrl ?? `https://${config.serverName}`
      ).replace(/\/+$/, "");

      runtime.ready(async () => {
        // Provisioning again on each start keeps the secret in step with
        // the one the homeserver's configuration was written with.
        await runtime.auth()?.provisionOAuthClient({
          clientId: HOMESERVER_CLIENT_ID,
          clientSecret: config.oidcClientSecret,
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
              userId: config.botUserId,
              password: config.botPassword,
              registrationToken: config.registrationToken,
              ...(deps.fetch ? { fetch: deps.fetch } : {}),
            });
            if (outcome === "registered") {
              runtime.logger.info("Registered the Matrix bot account", {
                userId: config.botUserId,
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
