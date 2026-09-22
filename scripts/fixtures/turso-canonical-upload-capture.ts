import assert from "node:assert/strict";
import type { EntityFileAssets } from "@brains/entity-service";
import type {
  ScopedRuntimeUploadStore,
  RuntimeUploadRecord,
} from "@brains/plugins";
import { chatUploadResponseSchema } from "@brains/contracts/chat";
import { handleUploadRequest } from "../../interfaces/web-chat/src/upload-handlers";

/** Source-handler proof with App-owned native capture/inspection and runtime
 * retention. Authentication is an explicit fixture collaborator, not login or
 * installed/default artifact acceptance. Input bytes are fixture generation. */
export async function captureCanonicalUpload(
  files: EntityFileAssets,
  store: ScopedRuntimeUploadStore,
  bytes: Uint8Array,
): Promise<RuntimeUploadRecord> {
  const request = new Request("http://fixture/api/chat/uploads", {
    method: "POST",
    headers: {
      "Content-Type": "image/png",
      "X-Upload-Filename": "promoted.png",
    },
    body: new Uint8Array(bytes).buffer,
  });
  const forbidden = async (): Promise<never> => {
    throw new Error("Controller upload materialization forbidden");
  };
  request.arrayBuffer = forbidden;
  request.formData = forbidden;
  request.blob = forbidden;
  request.text = forbidden;
  const response = await handleUploadRequest(request, {
    fileTransfers: files,
    getUploadStore: () => store,
    resolveAuthSession: async () => true,
    onRetirementError: (error): never => {
      throw error;
    },
  });
  assert.equal(response.status, 201);
  const receipt = chatUploadResponseSchema.parse(await response.json());
  assert.equal(receipt.filename, "promoted.png");
  assert.equal(receipt.mediaType, "image/png");
  assert.equal(receipt.sizeBytes, bytes.byteLength);
  return store.readRecord(receipt.id);
}
