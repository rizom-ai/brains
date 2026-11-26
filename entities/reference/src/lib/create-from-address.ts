import type {
  EntityCreateContext,
  EntityCreateRoute,
} from "@brains/sdk/entities";
import type { referenceMetadataSchema } from "../schemas/reference";

const NO_ADDRESS =
  "A reference is created from the address of an entity on its author's brain. Give the address.";

const URL_PATTERN = /https:\/\/[^\s<>"')\]]+/;

/** The address a request names: its URL, else the first in its content, prompt or title. */
function requestedAddress(context: EntityCreateContext): string | undefined {
  const { input } = context;
  if (input.url) return input.url;
  return [input.content, input.prompt, input.title]
    .flatMap((text) => (text ? [URL_PATTERN.exec(text)?.[0]] : []))
    .find((address) => address !== undefined);
}

/**
 * A reference from an address: the capture is queued, and nothing is written
 * until it has found the record. A request naming no address is refused.
 */
export const referenceFromAddress: EntityCreateRoute<
  typeof referenceMetadataSchema
> = {
  resolve: async (context) => {
    const url = requestedAddress(context);
    return url
      ? { delegate: { job: "capture", input: { url } } }
      : { refuse: NO_ADDRESS };
  },
};
