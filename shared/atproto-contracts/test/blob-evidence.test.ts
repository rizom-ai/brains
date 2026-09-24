import { expect, test } from "bun:test";
import {
  AtprotoBlobEvidenceError,
  collectAtprotoBlobEvidence,
  atprotoBlobEvidenceSchema,
} from "../src/blob-evidence";
const blob = {
  ref: { $link: "acknowledged-cid" },
  mimeType: "image/png",
  size: 70,
};

test("snapshots explicit outcomes without reading URLs, binary backings or raw responses", () => {
  const source = {
    blob: { ...blob, ref: { ...blob.ref } },
    imageId: "public-image",
    sha256: "a".repeat(64),
    get url(): never {
      throw new Error("Do not inspect credentials");
    },
    get bytes(): never {
      throw new Error("Do not inspect bytes");
    },
    response: { accessJwt: "private-token" },
  };
  const error = new AtprotoBlobEvidenceError("failed", "body-images", [source]);
  source.blob.ref.$link = "changed";
  const evidence = collectAtprotoBlobEvidence(error);
  expect(evidence?.nodes[0]?.receipts?.[0]?.blob.ref.$link).toBe(
    "acknowledged-cid",
  );
  expect(evidence?.nodes[0]?.status).toBe("acknowledged");
  expect(JSON.stringify(evidence)).not.toContain("private-token");
  expect(JSON.stringify(evidence)).not.toContain("url");
});

test("retains distinct received/acknowledged stages and shared cause/aggregate edges", () => {
  const received = new AtprotoBlobEvidenceError(
    "provider mismatch",
    "blob-receipt",
    [{ blob }],
  );
  const retirement = new Error("private SDK diagnostics");
  const graph = new AggregateError([received, retirement], "both failed", {
    cause: retirement,
  });
  const error = new AtprotoBlobEvidenceError(
    "prefix acknowledged",
    "body-images",
    [{ blob, imageId: "a" }],
    { cause: graph },
  );
  const result = collectAtprotoBlobEvidence(error);
  expect(result?.nodes[0]?.cause).toBe(1);
  expect(result?.nodes[1]).toEqual({
    kind: "aggregate",
    cause: 2,
    errors: [3, 2],
  });
  expect(result?.nodes[3]?.status).toBe("received");
  expect(result?.nodes[0]?.status).toBe("acknowledged");
  expect(result?.truncated).toBe(false);
  expect(JSON.stringify(result)).not.toContain("SDK");
});

test("cycles terminate and opaque provider errors cannot invent evidence", () => {
  const error = new AtprotoBlobEvidenceError("cover", "cover", [{ blob }]);
  error.cause = error;
  expect(collectAtprotoBlobEvidence(error)?.nodes[0]?.cause).toBe(0);
  expect(
    collectAtprotoBlobEvidence(
      Object.assign(new Error("unknown"), { receipts: [{ blob }] }),
    ),
  ).toBeUndefined();
});

test("limits traversal and receipt budgets with explicit truncation", () => {
  const errors = Array.from(
    { length: 40 },
    () => new AtprotoBlobEvidenceError("cover", "cover", [{ blob }]),
  );
  const result = collectAtprotoBlobEvidence(new AggregateError(errors, "many"));
  expect(result?.nodes.length).toBe(16);
  expect(result?.truncated).toBe(true);
  const overflow = collectAtprotoBlobEvidence(
    new AtprotoBlobEvidenceError(
      "many",
      "body-images",
      Array.from({ length: 17 }, () => ({ blob })),
    ),
  );
  expect(overflow?.nodes[0]?.receipts?.length).toBe(16);
  expect(overflow?.truncated).toBe(true);
});

test("bounds escaped/multibyte metadata without claiming complete evidence", () => {
  const large = {
    blob: { ...blob, ref: { $link: "\u0001".repeat(1024) } },
    imageId: "😀".repeat(128),
  };
  const errors = Array.from(
    { length: 16 },
    () =>
      new AtprotoBlobEvidenceError(
        "large",
        "body-images",
        Array.from({ length: 16 }, () => large),
      ),
  );
  const evidence = collectAtprotoBlobEvidence(
    new AggregateError(errors, "large"),
  );
  expect(evidence?.truncated).toBe(true);
  expect(Buffer.byteLength(JSON.stringify(evidence))).toBeLessThanOrEqual(
    40 * 1024,
  );
  expect(atprotoBlobEvidenceSchema.safeParse(evidence).success).toBe(true);
});

test("malformed evidence never replaces the original failure or its cause", () => {
  const cause = new AtprotoBlobEvidenceError("cover", "cover", [{ blob }]);
  const error = new AtprotoBlobEvidenceError(
    "malformed",
    "blob-receipt",
    [
      { blob: { ...blob, size: NaN } },
      {
        get blob(): never {
          throw new Error("getter");
        },
      },
    ],
    { cause },
  );
  expect(error.cause).toBe(cause);
  const result = collectAtprotoBlobEvidence(error);
  expect(result?.invalid).toBe(true);
  expect(result?.nodes[1]?.stage).toBe("cover");
  expect(result?.nodes[1]?.receipts).toHaveLength(1);
});

test("a hostile cause accessor does not hide independent aggregate receipts", () => {
  const error = new AggregateError(
    [new AtprotoBlobEvidenceError("cover", "cover", [{ blob }])],
    "private",
  );
  Object.defineProperty(error, "cause", {
    get: (): never => {
      throw new Error("private accessor");
    },
  });
  const evidence = collectAtprotoBlobEvidence(error);
  expect(evidence?.invalid).toBe(true);
  expect(evidence?.nodes[1]?.stage).toBe("cover");
});

test("malformed mutable flags cannot break the reporter", () => {
  const error = new AtprotoBlobEvidenceError("cover", "cover", [{ blob }]);
  Object.defineProperty(error.evidence, "truncated", {
    value: "not a boolean",
  });
  const evidence = collectAtprotoBlobEvidence(error);
  expect(evidence?.invalid).toBe(true);
  expect(evidence?.nodes[0]?.receipts).toHaveLength(1);
});

test("the public schema rejects dangling graph edges", () => {
  expect(
    atprotoBlobEvidenceSchema.safeParse({
      nodes: [{ kind: "error", cause: 15 }],
      truncated: false,
      invalid: false,
    }).success,
  ).toBe(false);
});
