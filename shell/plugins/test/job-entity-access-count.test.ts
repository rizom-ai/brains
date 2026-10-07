import { describe, expect, it } from "bun:test";
import { createTestEntity } from "@brains/entity-service/test";
import { createJobEntityAccess } from "../src/job/job-entity-access";
import { createMockShell } from "../src/test/mock-shell";

/**
 * A package that lists its own records with a filter also has to say how
 * many there are in total, and listing everything to count it is not an
 * answer. Named consumer: @brains/email-workflows, whose triage list
 * reports `total` beside a bounded page.
 */
describe("job entity access count", () => {
  const seed = (
    shell: ReturnType<typeof createMockShell>,
    id: string,
    status: string,
    visibility: "public" | "restricted" = "restricted",
  ): void => {
    shell.addEntities([
      createTestEntity("ticket", {
        id,
        content: `ticket ${id}`,
        visibility,
        metadata: { status },
      }),
    ]);
  };

  it("counts the entities a filter matches, within the visibility asked for", async () => {
    const shell = createMockShell();
    seed(shell, "t-1", "open");
    seed(shell, "t-2", "open");
    seed(shell, "t-3", "closed");
    const access = createJobEntityAccess(
      shell.getEntityService(),
      new Set(["ticket"]),
      "test",
    );

    expect(
      await access.count({
        entityType: "ticket",
        options: {
          filter: {
            metadata: { status: "open" },
            visibilityScope: "restricted",
          },
        },
      }),
    ).toBe(2);
  });

  it("caps the count at the scope the access was built with", async () => {
    const shell = createMockShell();
    seed(shell, "t-1", "open", "public");
    seed(shell, "t-2", "open", "restricted");
    const access = createJobEntityAccess(
      shell.getEntityService(),
      new Set(["ticket"]),
      "test",
      "public",
    );

    expect(
      await access.count({
        entityType: "ticket",
        options: { filter: { visibilityScope: "restricted" } },
      }),
    ).toBe(1);
  });
});
