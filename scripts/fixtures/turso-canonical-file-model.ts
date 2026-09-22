import assert from "node:assert/strict";
import { MockLanguageModelV3 } from "ai/test";
import { createFileModel, fileModelReference } from "@brains/ai-service";
import type { IEntityService } from "@brains/entity-service";
import type {
  RuntimeUploadRecord,
  IRuntimeUploadsNamespace,
} from "@brains/plugins";
import { createAgentUploadFiles } from "../../shell/core/src/initialization/agent-upload-files";

/** Production upload binding, inspection and model bridge with an explicit
 * actor-side provider substitute. Not installed/provider or peak-RSS acceptance. */
export async function consumeCanonicalUpload(
  entities: IEntityService,
  uploads: IRuntimeUploadsNamespace,
  record: RuntimeUploadRecord,
): Promise<void> {
  const model = createFileModel(
    new MockLanguageModelV3(),
    { model: "fixture" },
    createAgentUploadFiles(entities, uploads),
  );
  const response = await model.doStream({
    prompt: [
      {
        role: "user",
        content: [
          {
            type: "file",
            data: fileModelReference(record.ref),
            filename: record.filename,
            mediaType: record.mediaType,
          },
        ],
      },
    ],
  });
  const pid = Number(response.response?.headers?.["x-native-pid"]);
  assert.ok(Number.isSafeInteger(pid) && pid > 0 && pid !== process.pid);
  const reader = response.stream.getReader();
  let text = "";
  let finished = false;
  try {
    for (;;) {
      const item = await reader.read();
      if (item.done) break;
      if (item.value.type === "text-delta") text += item.value.delta;
      if (item.value.type === "finish") finished = true;
    }
  } finally {
    reader.releaseLock();
  }
  assert.equal(text, "Native stream");
  assert.equal(finished, true);
  assert.throws(() => process.kill(pid, 0), { code: "ESRCH" });
}
