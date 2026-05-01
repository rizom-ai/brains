import type { AIModelConfig } from "@brains/ai-service";
import { Logger, LogLevel, type DbConfig } from "@brains/utils";
import type { ShellConfig } from "../config";

export function createServiceLogger(
  config: ShellConfig,
  providedLogger?: Logger,
): Logger {
  if (providedLogger) {
    return providedLogger;
  }

  const logLevel = {
    debug: LogLevel.DEBUG,
    info: LogLevel.INFO,
    warn: LogLevel.WARN,
    error: LogLevel.ERROR,
  }[config.logging.level];

  return Logger.createFresh({
    level: logLevel,
    context: config.logging.context,
    format: config.logging.format === "json" ? "json" : "text",
    ...(config.logging.file ? { logFile: config.logging.file } : {}),
  });
}

export function createAIModelConfig(config: ShellConfig): AIModelConfig {
  return {
    apiKey: config.ai.apiKey,
    model: config.ai.model,
    temperature: config.ai.temperature,
    maxTokens: config.ai.maxTokens,
    webSearch: config.ai.webSearch,
    ...(config.ai.imageApiKey ? { imageApiKey: config.ai.imageApiKey } : {}),
  };
}

export function createDatabaseConfig(config: DbConfig): DbConfig {
  return {
    url: config.url,
    ...(config.authToken ? { authToken: config.authToken } : {}),
  };
}
