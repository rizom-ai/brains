export { Shell } from "./shell";
export type { ShellDependencies } from "./shell";

export {
  createShellConfig,
  getStandardConfig,
  getStandardConfigWithDirectories,
  shellConfigSchema,
  STANDARD_PATHS,
} from "./config";
export type { ShellConfig, StandardConfig } from "./config";

export type { IEmbeddingService } from "@brains/embedding-service";
export type { SerializableEntity, SerializableQueryResult } from "./types";

export {
  SHELL_DATASOURCE_IDS,
  SHELL_ENTITY_TYPES,
  SHELL_TEMPLATE_NAMES,
} from "./constants";
