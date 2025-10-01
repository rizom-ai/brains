import { appConfigSchema, type AppConfig } from "./types";

/**
 * Define configuration for a Brain app
 * This validates the config and returns it - execution is handled by the config file itself
 */
export function defineConfig(config: AppConfig): AppConfig {
  // Validate config at definition time
  const validated = appConfigSchema.parse({
    ...config,
    // Ensure plugins array is preserved (not validated by schema)
    plugins: config.plugins ?? [],
  });

  const finalConfig: AppConfig = {
    ...validated,
    plugins: config.plugins ?? [],
  };

  // Only add optional properties if they're defined
  if (config.permissions) finalConfig.permissions = config.permissions;
  if (config.cliConfig) finalConfig.cliConfig = config.cliConfig;
  if (config.shellConfig) finalConfig.shellConfig = config.shellConfig;
  if (config.identity) finalConfig.identity = config.identity;

  return finalConfig;
}
