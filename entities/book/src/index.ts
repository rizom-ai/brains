import {
  defineServicePlugin,
  type ServicePackageDefinition,
} from "@brains/sdk/services";
import { z } from "@brains/sdk/entities";
import { homepageChatAvailable } from "@brains/site-atlas";
import { book } from "./book-entity";
import { bookSection } from "./book-section-entity";
import { bookAskDataSource } from "./datasources/book-ask-datasource";

const configSchema: z.ZodObject<Record<string, never>> = z.object({}).strict();
const bookPackage: ServicePackageDefinition<typeof configSchema> =
  defineServicePlugin(
    {
      id: "reading",
      config: configSchema,
      entities: [book, bookSection],
      setup: ({ identity, interfaceAvailability }) => ({
        ask: bookAskDataSource({
          name: () => identity.getProfile().name,
          chatAvailable: (context) =>
            homepageChatAvailable(context, { interfaceAvailability }),
        }),
      }),
    },
    {
      dataSources: ({ state }) => [state.ask],
    },
  );
export default bookPackage;
export { book } from "./book-entity";
export { bookSection, bookSectionSlug } from "./book-section-entity";
export * from "./schemas/book";
export * from "./schemas/book-section";
