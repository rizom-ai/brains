export { GIT_BROKER_SOCKET_ENV } from "./lib/broker/connect";
export { gitBrokerRuntimeDir } from "./lib/broker/paths";
export {
  startGitBrokerHost,
  type GitBrokerHostOptions,
} from "./lib/broker/host";
// The RPC endpoints load Effect's RPC stack; they stay off the package index
// so the Brain bundle never evaluates it eagerly.
export { GitBrokerServer } from "./lib/broker/server";
export { BrokerConnection } from "./lib/broker/client";
