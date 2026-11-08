import {
  defineEntity,
  defineEntityPackage,
  z,
  type EntitySlotBinding,
} from "@rizom/brain/entities";
import { bookmark } from "./index";

// Compile-only: checked by the fixture typecheck, never loaded by the brain.

// A binding names one of the package's entities and the config-dependent
// slots it has; the create route is typed by that entity's metadata.
const bookmarkEvals: EntitySlotBinding<typeof bookmark> = {
  entity: bookmark,
  evals: {
    shelf: async (_input, { entities }) => entities.count(bookmark),
  },
};
void bookmarkEvals;

const stranger = defineEntity({
  type: "stranger",
  purpose: "An entity of another package.",
  metadata: z.object({ title: z.string() }),
});

// The same binding of its own entity compiles, reading the parsed config.
export const ownCanary = defineEntityPackage({
  id: "own-canary",
  config: z.object({ greeting: z.string() }),
  entities: [bookmark],
  configure: ({ config }) => ({
    entities: [
      {
        entity: bookmark,
        evals: { greet: async (): Promise<string> => config.greeting },
      },
    ],
  }),
});

export const strangerCanary = defineEntityPackage({
  id: "stranger-canary",
  config: z.object({ greeting: z.string() }),
  entities: [bookmark],
  // @ts-expect-error a package configures only its own entities
  configure: ({ config }) => ({
    entities: [
      {
        entity: stranger,
        evals: { greet: async (): Promise<string> => config.greeting },
      },
    ],
  }),
});
