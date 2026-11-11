import { createTestEntity } from "@brains/entity-service/test";
import { createMockShell } from "@brains/plugins/test";
import { z } from "@brains/utils/zod";
import { describe, expect, test } from "bun:test";
import { ProfileAboutDataSource, professionalProfileSchema } from "../src";

describe("a site's about page data source", () => {
  test("serves the anchor profile parsed with the site's profile schema", async () => {
    const shell = createMockShell();
    shell.addEntities([
      createTestEntity("anchor-profile", {
        id: "anchor-profile",
        content: "---\nname: Ada\nrole: Advisor\n---\nLong biography",
      }),
    ]);
    const source = new ProfileAboutDataSource({
      id: "test:about",
      name: "Test About DataSource",
      description: "The test site's about page",
      schema: professionalProfileSchema,
    });

    const data = await source.fetch(
      undefined,
      z.object({ profile: professionalProfileSchema }),
      { entityService: shell.getEntityService() },
    );

    expect(source.id).toBe("test:about");
    expect(data.profile).toMatchObject({
      name: "Ada",
      role: "Advisor",
      story: "Long biography",
    });
  });
});
