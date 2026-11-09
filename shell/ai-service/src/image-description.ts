import { createHash } from "node:crypto";
import { generateText, type FilePart, type LanguageModel } from "ai";
import { fileBytes } from "./file-part-bytes";

/** Describes an uploaded image as text; undefined when it cannot. */
export type ImageDescriber = (part: FilePart) => Promise<string | undefined>;

const describePrompt =
  "Describe this image for someone who cannot see it: what it shows, and any text in it, quoted. Use at most five sentences.";

/** Descriptions kept per image, so a reused upload is not described again. */
const cachedDescriptions = 100;

/**
 * An image describer for a model that reads only text: the vision model
 * describes each image once, by its bytes, and a failure leaves the image
 * undescribed.
 */
export function createImageDescriber(model: LanguageModel): ImageDescriber {
  const descriptions = new Map<string, Promise<string | undefined>>();
  return async (part) => {
    const bytes = fileBytes(part.data);
    if (!bytes) return undefined;
    const key = createHash("sha256").update(bytes).digest("hex");
    const known = descriptions.get(key);
    if (known) return known;
    const description = generateText({
      model,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: describePrompt },
            {
              type: "file",
              data: new Uint8Array(bytes),
              mediaType: part.mediaType,
              ...(part.filename !== undefined && { filename: part.filename }),
            },
          ],
        },
      ],
    }).then(
      (result) => result.text.trim() || undefined,
      () => undefined,
    );
    descriptions.set(key, description);
    const oldest = descriptions.keys().next().value;
    if (descriptions.size > cachedDescriptions && oldest !== undefined)
      descriptions.delete(oldest);
    // A failed description is not kept, so the next turn tries again.
    if ((await description) === undefined) descriptions.delete(key);
    return description;
  };
}
