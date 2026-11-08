import { promptPackage } from "./definition";

export default promptPackage;

export { prompt, promptPackage, type Prompt } from "./definition";

export {
  promptFrontmatterSchema,
  promptMetadataSchema,
  type PromptFrontmatter,
  type PromptMetadata,
} from "./schemas/prompt";
