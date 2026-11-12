export { newsletterEntityPackage } from "./package";
export { newsletterEntity } from "./newsletter-entity";
export {
  newsletterGeneration,
  generationJobSchema,
  generatedNewsletterSchema,
  type GenerationJobData,
} from "./generation";

export type {
  Newsletter,
  NewsletterMetadata,
  NewsletterStatus,
  CreateNewsletterInput,
} from "./schemas/newsletter";
export {
  newsletterSchema,
  newsletterMetadataSchema,
  newsletterStatusSchema,
  createNewsletter,
} from "./schemas/newsletter";
