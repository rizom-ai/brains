// Bun's production bundle inlines direct `process.env.NODE_ENV` reads at build
// time. Keep the key dynamic so deployed images read the container runtime env.
const NODE_ENV_KEY = "NODE" + "_ENV";

export function getRuntimeNodeEnv(): string | undefined {
  return process.env[NODE_ENV_KEY];
}

export function preferLocalUrlsForRuntime(): boolean {
  return getRuntimeNodeEnv() !== "production";
}
