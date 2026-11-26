import { matrixServerPackage } from "./plugin";

export {
  createMatrixServerPackage,
  matrixServerConfigSchema,
  matrixServerPackage,
  type MatrixServerConfig,
  type MatrixServerDeps,
  type MatrixServerState,
} from "./plugin";
export { ensureBotAccount, type BotAccountOptions } from "./bot-account";
export {
  HOMESERVER_CLIENT_ID,
  homeserverCallbackUrl,
  renderHomeserverConfig,
  type HomeserverConfigInput,
} from "./homeserver-config";

export default matrixServerPackage;
export { matrixServerConfigFromEnv, matrixServerEnvSchema } from "./env-schema";
