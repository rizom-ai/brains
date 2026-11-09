import {
  defineEntity,
  z,
  type EntitySeedDefinition,
  type EntitySeedTrigger,
} from "@rizom/brain/entities";

// Compile-only: checked by the fixture typecheck, never loaded by the brain.
const announcementMetadata = z.object({
  title: z.string(),
  coverImageId: z.string().optional(),
});

export const announcement = defineEntity({
  type: "announcement",
  purpose: "A public notice with an optional cover image.",
  metadata: announcementMetadata,
  // Records written before `title` existed still parse.
  metadataFrom: (stored) =>
    typeof stored === "object" &&
    stored !== null &&
    "headline" in stored &&
    typeof stored.headline === "string"
      ? { title: stored.headline }
      : stored,
  displayTitle: ({ metadata }) => metadata.title,
  coverImage: true,
  actions: { delete: "admin", publish: "trusted" },
  validatePersist: ({ visibility }) => {
    if (visibility !== "public") {
      throw new Error("Announcements are public");
    }
  },
});

const welcomeMetadata = z.object({ greeting: z.string().default("Hello") });
const settled: EntitySeedTrigger = "startup-content-settled";
const welcomeSeed: EntitySeedDefinition<typeof welcomeMetadata> = {
  on: settled,
  id: "welcome",
  content: () => "Welcome to the reading library.",
  metadata: { greeting: "Welcome" },
};

export const welcome = defineEntity({
  type: "welcome",
  purpose: "The one welcome the reading library shows.",
  metadata: welcomeMetadata,
  singleton: true,
  hasBody: false,
  seed: welcomeSeed,
});

export const invalidSeedMetadata = defineEntity({
  type: "invalid-seed-metadata",
  purpose: "Compile-only rejection",
  metadata: welcomeMetadata,
  seed: {
    on: "startup-content-settled",
    id: "invalid-seed-metadata",
    content: () => "",
    // @ts-expect-error Seed metadata is the metadata schema's input.
    metadata: { greeting: 1 },
  },
});

// @ts-expect-error Seed triggers are named lifecycle moments, not channel names.
export const invalidTrigger: EntitySeedTrigger = "sync:initial:completed";

export const invalidDisplayTitle = defineEntity({
  type: "invalid-display-title",
  purpose: "Compile-only rejection",
  metadata: announcementMetadata,
  // @ts-expect-error A display title reads the validated metadata it declared.
  displayTitle: ({ metadata }) => metadata.subtitle,
});

export const invalidActions = defineEntity({
  type: "invalid-actions",
  purpose: "Compile-only rejection",
  metadata: z.object({}),
  // @ts-expect-error Action levels are a closed vocabulary.
  actions: { delete: "owner" },
});

export const invalidSingleton = defineEntity({
  type: "invalid-singleton",
  purpose: "Compile-only rejection",
  metadata: z.object({}),
  // @ts-expect-error Shape flags are booleans.
  singleton: "yes",
});
