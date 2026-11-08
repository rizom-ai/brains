import { imageMetadataFor, imageMetadataSchema } from "@brains/image";
import { defineEntity, type EntityDefinition } from "@brains/sdk/entities";
import { imageCreateRouting } from "./create-routes";
import { generateImageJob } from "./jobs/generate-image";
import { promoteUploadJob } from "./jobs/promote-upload";
import { renderSourceImageJob } from "./jobs/render-source-image";

const IMAGE_INSTRUCTIONS =
  "Image entities store durable images. system_generate standalone-image or cover-image makes a new image; never use it to describe, analyze, or discuss an existing uploaded image. Answer that from the attachment/context, and if the user later asks to save the discussion, create entityType note from prior-response or exact text.";

/**
 * An image: its bytes as a data URL, its title, alt text and provenance
 * beside them. One is generated from a prompt, rendered from another
 * entity's attachment, or promoted from an upload, each by a job other
 * packages may also queue by contract; a create writes the pending image
 * the job fills.
 */
export const image: EntityDefinition<"image", typeof imageMetadataSchema> =
  defineEntity({
    type: "image",
    purpose:
      "Image assets such as generated covers, social previews, and uploaded images.",
    metadata: imageMetadataSchema,
    config: {
      embeddable: false,
      binaryStorage: "data-url",
      projectionSource: false,
      projectionSourceRole: "excluded",
    },
    // The bytes say their format and size; the rest arrives beside them.
    markdown: {
      decode: ({ content }) => ({
        content,
        metadata: imageMetadataFor(content),
      }),
    },
    instructions: IMAGE_INSTRUCTIONS,
    create: imageCreateRouting,
    // The jobs write the type they are declared on, once it is defined.
    jobs: {
      "image-generate": generateImageJob(() => image),
      "image-render-source": renderSourceImageJob(() => image),
      "upload-promote": promoteUploadJob(() => image),
    },
  });
