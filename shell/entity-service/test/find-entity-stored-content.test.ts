import { describe, expect, it } from "bun:test";
import { findEntityByIdentifier } from "../src/find-entity";
import { createTestEntity } from "../src/test";
import type { BaseEntity } from "../src/types";

const stored = createTestEntity("post", {
  id: "post-1",
  content: "Body: ![Figure](entity://image/figure)",
  metadata: { slug: "post-one" },
});
// What a content-resolving read returns: the reference inlined as bytes.
const resolved: BaseEntity = {
  ...stored,
  content: "Body: ![Figure](data:image/png;base64,AAAA)",
};

describe("findEntityByIdentifier", () => {
  it("returns stored content, so a caller that writes back never persists resolved references", async () => {
    // A real entity service offers both reads; the lookup must take the stored one.
    const service = {
      getEntity: async (): Promise<BaseEntity> => resolved,
      getEntityRaw: async (): Promise<BaseEntity> => stored,
      listEntities: async (): Promise<BaseEntity[]> => [],
    };

    const found = await findEntityByIdentifier(service, "post", "post-1");

    expect(found?.content).toBe(stored.content);
  });
});
