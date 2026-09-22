import type {
  FileModelDependencies,
  FileModelBinding,
  FileModelReference,
} from "@brains/ai-service";
import type { IEntityService } from "@brains/entity-service";
import type { IRuntimeUploadsNamespace } from "@brains/plugins";
import {
  normalizeMessageUploadMediaType,
  isUploadableBinaryFile,
  messageTextUploadMaxBytes,
} from "@brains/plugins/message-interface/upload-policy";
import { uploadInspectionDetailsSchema } from "@brains/plugins/message-interface/upload-inspection";

/** The model URL selects a ref, never a filesystem capability. Resolve and
 * inspect inside nested authorized upload loans, held through native model exit. */
export function createAgentUploadFiles(
  entityService: IEntityService,
  uploads: IRuntimeUploadsNamespace,
): FileModelDependencies {
  return {
    getFiles: () => entityService.fileAssets,
    async withFiles<T>(
      references: FileModelReference[],
      signal: AbortSignal,
      use: (bindings: FileModelBinding[]) => Promise<T>,
    ): Promise<T> {
      const bindings: FileModelBinding[] = [];
      const files = entityService.fileAssets;
      if (!files) throw new Error("AI upload inspection is not provisioned");
      const borrow = async (index: number): Promise<T> => {
        signal.throwIfAborted();
        const reference = references[index];
        if (!reference) return use(bindings);
        if (reference.source.kind !== "upload")
          throw new Error("Unsupported AI upload namespace");
        const store = uploads.scoped({
          namespace: "upload",
          refKind: "upload",
          routePath: "",
        });
        return store.withFile(
          reference.source.id,
          async ({ record, sourceFile }) => {
            if (
              record.filename !== reference.filename ||
              record.mediaType !== reference.mediaType
            )
              throw new Error("AI upload metadata changed before consumption");
            const facts = await files.inspect(
              { sourceFile, sizeBytes: record.sizeBytes },
              { inspector: "message-upload", signal },
            );
            signal.throwIfAborted();
            const details = uploadInspectionDetailsSchema.parse(facts.details);
            const mediaType = normalizeMessageUploadMediaType(
              record.filename,
              record.mediaType,
            );
            const text =
              mediaType.startsWith("text/") || mediaType === "application/json";
            // Ingress owns its size/type policy. Declarative interfaces can have
            // larger sources; the model actor validates their full UTF-8 text.
            if (
              facts.sizeBytes !== record.sizeBytes ||
              (text &&
                record.sizeBytes <= messageTextUploadMaxBytes &&
                !details.validText) ||
              (!text &&
                isUploadableBinaryFile(record.filename, mediaType) &&
                details.binaryMediaType !== mediaType)
            )
              throw new Error(
                "AI upload inspection does not match its metadata",
              );
            bindings.push({
              reference: reference.reference,
              sourceFile,
              sizeBytes: facts.sizeBytes,
              sha256: facts.sha256,
              filename: record.filename,
              mediaType: record.mediaType,
            });
            return borrow(index + 1);
          },
        );
      };
      return borrow(0);
    },
  };
}
