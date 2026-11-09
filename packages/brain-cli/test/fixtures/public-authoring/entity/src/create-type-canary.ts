import {
  defineEntity,
  z,
  type AttachmentProvider,
  type EntityAttachmentDeclaration,
  type EntityCreateAttachment,
  type EntityCreateCheck,
  type EntityCreateContext,
  type EntityCreateResolution,
  type EntityCreateRoute,
  type EntityCreateRouting,
  type EntityCreateUploadReader,
  type MediaAttachmentContext,
} from "@rizom/brain/entities";
import { bookmark } from "./index";

// Compile-only: checked by the fixture typecheck, never loaded by the brain.
const clippingMetadata = z.object({
  title: z.string(),
  source: z.enum(["upload", "text"]),
  bookmarked: z.boolean().default(false),
});

const clippingLink: EntityCreateAttachment = ({ entityId }) => ({
  mediaType: "text/markdown",
  url: `/clippings/${entityId}`,
});

async function uploadedText(
  uploads: EntityCreateUploadReader,
  uploadId: string,
): Promise<string | undefined> {
  const record = await uploads.readRecord(uploadId);
  if (!record.mediaType.startsWith("text/")) return undefined;
  const upload = await uploads.read(uploadId);
  return new TextDecoder().decode(upload.content);
}

async function checkClipping({
  input,
}: EntityCreateContext): Promise<EntityCreateCheck> {
  return input.title
    ? { kind: "ready", title: input.title }
    : {
        kind: "question",
        asks: "fields",
        question: "What is the clipping called?",
        answerWith: "Pass the answer as title.",
      };
}

async function clipUpload(
  context: EntityCreateContext,
): Promise<EntityCreateResolution<typeof clippingMetadata>> {
  const from = context.input.from;
  if (from?.kind !== "upload") return { refuse: "Clippings import a file" };
  const text = await uploadedText(context.uploads, from.id);
  if (text === undefined) return { refuse: "Clippings import text files" };
  const title = context.input.title ?? "clipping";
  return {
    create: {
      id: title,
      content: text,
      metadata: {
        title,
        source: "upload",
        bookmarked: (await context.entities.get(bookmark, title)) !== null,
      },
    },
    attachment: clippingLink,
  };
}

const fromContent: EntityCreateRoute<typeof clippingMetadata> = {
  check: checkClipping,
  resolve: async ({ input }) =>
    input.content
      ? {
          create: {
            id: input.title ?? "clipping",
            content: input.content,
            metadata: { title: input.title ?? "clipping", source: "text" },
          },
        }
      : { refuse: "A clipping needs text" },
};

const createRouting: EntityCreateRouting<typeof clippingMetadata> = {
  fromUpload: {
    mediaTypes: ["text/plain", "text/markdown"],
    check: checkClipping,
    resolve: clipUpload,
  },
  fromContent,
  fromPrompt: { reject: "Clippings are saved from text, not written" },
};

function printableClipping(
  context: MediaAttachmentContext,
): AttachmentProvider {
  return {
    metadata: { outputEntityType: "document" },
    resolve: async (request): Promise<undefined> => {
      const clipping = await context.entityService.getEntity({
        entityType: "clipping",
        id: request.sourceEntityId,
      });
      const template = context.views.get("clipping-printable");
      const brand = context.domain ?? context.identity.getProfile().name;
      void (clipping && template && brand && context.themeCSS);
      return undefined;
    },
  };
}

const attachments: readonly EntityAttachmentDeclaration[] = [
  { type: "printable", provider: printableClipping },
];

export const clipping = defineEntity({
  type: "clipping",
  purpose: "A passage saved from a file or pasted text.",
  metadata: clippingMetadata,
  create: createRouting,
  attachments,
});

export const invalidCreateMetadata: EntityCreateResolution<
  typeof clippingMetadata
> = {
  create: {
    id: "invalid",
    content: "",
    // @ts-expect-error Created metadata is the type's own schema input.
    metadata: { title: "invalid" },
  },
};

export const invalidCheck: EntityCreateRoute<typeof clippingMetadata> = {
  // @ts-expect-error A check answers ready, question or error.
  check: async () => ({ kind: "maybe" }),
  resolve: async () => ({ refuse: "unused" }),
};

export async function invalidCreateContext(
  context: EntityCreateContext,
): Promise<void> {
  // @ts-expect-error The request a route is given is read-only.
  context.input.title = "renamed";
  // @ts-expect-error A route reads uploads; it never stores them.
  await context.uploads.save;
}

export function invalidMediaContext(context: MediaAttachmentContext): void {
  // @ts-expect-error An attachment provider reads entities; it never writes them.
  void context.entityService.updateEntity;
}
