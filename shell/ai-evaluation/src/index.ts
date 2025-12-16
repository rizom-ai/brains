// Schemas
export * from "./schemas";

// Types
export type * from "./types";

// Core services
export { EvaluationService } from "./evaluation-service";
export type { EvaluationServiceConfig } from "./evaluation-service";

export { TestRunner } from "./test-runner";
export { MetricCollector } from "./metric-collector";
export { LLMJudge } from "./llm-judge";

// Plugin evaluation support
export { EvalHandlerRegistry } from "./eval-handler-registry";
export { PluginRunner } from "./plugin-runner";
export type { PluginRunnerOptions } from "./plugin-runner";
export { PluginLLMJudge } from "./plugin-llm-judge";
export type { IPluginLLMJudge } from "./plugin-llm-judge";
export { OutputValidator } from "./output-validator";

// Remote agent service for connecting to running instances
export { RemoteAgentService } from "./remote-agent-service";
export type { RemoteAgentServiceConfig } from "./remote-agent-service";

// Loaders
export { YAMLLoader } from "./loaders";
export type { YAMLLoaderOptions } from "./loaders/yaml-loader";

// Reporters
export { ConsoleReporter, JSONReporter } from "./reporters";
export type { ConsoleReporterOptions } from "./reporters/console-reporter";
export type { JSONReporterOptions } from "./reporters/json-reporter";

// Runner
export { runEvaluations, main as runEvaluationsCLI } from "./run-evaluations";
export type { RunEvaluationsOptions } from "./run-evaluations";
