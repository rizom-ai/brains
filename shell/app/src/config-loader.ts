import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { fromYaml } from "@brains/utils";

export interface LoadedConfig {
  // The entire parsed config (flat structure with nested plugin sections)
  config: Record<string, unknown>;

  // Secrets from environment variables
  secrets: {
    anthropicApiKey?: string | undefined;
    matrixAccessToken?: string | undefined;
  };

  // Computed paths (all relative to cwd)
  paths: {
    dataDir: string;
    cacheDir: string;
    distDir: string;
  };
}

/**
 * Load configuration from brain.config.yaml and environment variables
 *
 * @param configPath Optional path to config file (defaults to ./brain.config.yaml)
 * @returns Loaded configuration with flat config, secrets, and paths
 */
export function loadConfig(configPath?: string): LoadedConfig {
  // Determine config file path
  const configFile = configPath ?? join(process.cwd(), "brain.config.yaml");

  // Load and parse config file if it exists
  let config: Record<string, unknown> = {};
  if (existsSync(configFile)) {
    try {
      const yamlContent = readFileSync(configFile, "utf-8");
      config = fromYaml(yamlContent) || {};
    } catch (error) {
      console.error(`Error loading config from ${configFile}:`, error);
      throw new Error(`Invalid configuration file: ${configFile}`);
    }
  }

  // Apply defaults for core settings if not specified
  if (config["aiModel"] === undefined) {
    config["aiModel"] = "claude-3-haiku-20240307";
  }
  if (config["logLevel"] === undefined) {
    config["logLevel"] = "info";
  }

  // Load secrets from environment
  const secrets = {
    anthropicApiKey: process.env["ANTHROPIC_API_KEY"],
    matrixAccessToken: process.env["MATRIX_ACCESS_TOKEN"],
  };

  // Validate required secrets
  if (!secrets.anthropicApiKey) {
    throw new Error("ANTHROPIC_API_KEY environment variable is required");
  }

  // Matrix token only required if matrix is configured
  if (config["matrix"] && !secrets.matrixAccessToken) {
    throw new Error(
      "MATRIX_ACCESS_TOKEN environment variable is required when matrix is configured in brain.config.yaml",
    );
  }

  // Compute paths (all relative to current working directory)
  const paths = {
    dataDir: "./data",
    cacheDir: "./cache",
    distDir: "./dist",
  };

  return {
    config,
    secrets,
    paths,
  };
}

/**
 * Get database URLs based on configuration paths
 */
export function getDatabaseUrls(paths: LoadedConfig["paths"]) {
  return {
    main: `file:${join(paths.dataDir, "brain.db")}`,
    jobQueue: `file:${join(paths.dataDir, "brain-jobs.db")}`,
    conversation: `file:${join(paths.dataDir, "conversations.db")}`,
  };
}

/**
 * Get cache directories based on configuration paths
 */
export function getCacheDirectories(paths: LoadedConfig["paths"]) {
  return {
    embeddings: join(paths.cacheDir, "embeddings"),
    siteBuilder: "/tmp/site-builder", // System temp for build artifacts
  };
}

/**
 * Get distribution directories based on configuration paths
 */
export function getDistDirectories(paths: LoadedConfig["paths"]) {
  return {
    websitePreview: join(paths.distDir, "preview"),
    websiteProduction: join(paths.distDir, "production"),
  };
}
