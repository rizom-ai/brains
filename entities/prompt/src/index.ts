// Plugin exports
export { PromptPlugin, promptPlugin } from "./plugin";

// Schema exports
export {
  promptSchema,
  promptFrontmatterSchema,
  promptMetadataSchema,
  type Prompt,
  type PromptFrontmatter,
  type PromptMetadata,
} from "./schemas/prompt";

// Adapter exports
export { PromptAdapter, promptAdapter } from "./adapters/prompt-adapter";
