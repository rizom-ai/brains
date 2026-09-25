import type { LinkedInUploadEvidence } from "@brains/contracts";
export function uploadEvidence(): LinkedInUploadEvidence {
  return {
    uploads: [
      {
        kind: "image",
        resourceUrn: "urn:li:digitalmediaAsset:image1",
        sha256: "a".repeat(64),
        sizeBytes: 17,
        stage: "post-attempted",
      },
    ],
    nodes: [
      { kind: "error", upload: 0, cause: 1 },
      { kind: "error", post: { id: "urn:li:share:known" } },
    ],
    truncated: false,
    invalid: false,
  };
}
