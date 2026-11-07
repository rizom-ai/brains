import {
  defineEntity,
  z,
  type EntityAttachmentDeclaration,
  type EntityPublishAssetDeclaration,
  type EntityPublishDeclaration,
  type PublishImageData,
  type PublishMediaData,
  type PublishProvider,
  type PublishResult,
} from "@rizom/brain/entities";

// Compile-only: checked by the fixture typecheck, never loaded by the brain.
const reviewMetadata = z.object({
  title: z.string(),
  status: z.enum(["draft", "published"]).default("draft"),
  sharedAt: z.string().optional(),
  feedPostId: z.string().optional(),
});

function describeMedia(
  image: PublishImageData | undefined,
  documents: readonly PublishMediaData[] | undefined,
): string {
  const files = (documents ?? []).map(
    ({ filename, data }) => `${filename} (${data.byteLength} bytes)`,
  );
  return [image ? `image ${image.mimeType}` : "no image", ...files].join(", ");
}

const readerFeed: PublishProvider = {
  name: "reader-feed",
  publish: async (
    content,
    metadata,
    imageData,
    documentData,
  ): Promise<PublishResult> => ({
    id: `${String(metadata["title"])}:${content.length}`,
    metadata: { media: describeMedia(imageData, documentData) },
  }),
  validateCredentials: async () => true,
};

const publishing: EntityPublishDeclaration<typeof reviewMetadata> = {
  provider: readerFeed,
  resultIdField: "feedPostId",
  timestampField: "sharedAt",
};

const reviewCard: EntityAttachmentDeclaration = {
  type: "review-card",
  provider: () => ({
    metadata: { outputEntityType: "image" },
    resolve: async (): Promise<undefined> => undefined,
  }),
};

const socialCard: EntityPublishAssetDeclaration = {
  attachmentType: "review-card",
  field: "ogImageId",
  requiredWhen: { status: "published", visibility: "public" },
};

export const review = defineEntity({
  type: "review",
  purpose: "A review the reader publishes to their feed.",
  metadata: reviewMetadata,
  coverImage: true,
  attachments: [reviewCard],
  publish: publishing,
  publishAssets: [
    socialCard,
    { attachmentType: "review-card", field: "coverImageId" },
  ],
});

export const invalidResultField = defineEntity({
  type: "invalid-result-field",
  purpose: "Compile-only rejection",
  metadata: reviewMetadata,
  publish: {
    provider: readerFeed,
    // @ts-expect-error The result id is recorded in a metadata field.
    resultIdField: "remoteId",
  },
});

export const invalidAssetField: EntityPublishAssetDeclaration = {
  attachmentType: "review-card",
  // @ts-expect-error The image job records covers and social cards only.
  field: "bannerImageId",
};

export const invalidRequirement: EntityPublishAssetDeclaration = {
  attachmentType: "review-card",
  field: "ogImageId",
  // @ts-expect-error Visibility is one of the entity visibilities.
  requiredWhen: { visibility: "everyone" },
};
