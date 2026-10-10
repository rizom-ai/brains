import { describe, expect, it, spyOn } from "bun:test";
import { createMockShell } from "@brains/plugins/test";
import { EntityMailItemRepository } from "../src/mail-item-repository";

describe("EntityMailItemRepository", () => {
  // Mail items are restricted, and an unscoped read sees public entities
  // only: a redelivered email would be classified and persisted again.
  it("looks up an existing mail item at full scope", async () => {
    const entityService = createMockShell().getEntityService();
    const getEntity = spyOn(entityService, "getEntity");

    await new EntityMailItemRepository(entityService).get("mail-1");

    expect(getEntity.mock.calls[0]?.[0]).toEqual({
      entityType: "mail-item",
      id: "mail-1",
      visibilityScope: "restricted",
    });
  });
});
