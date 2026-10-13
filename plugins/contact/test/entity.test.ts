import { describe, expect, it } from "bun:test";
import { createPluginHarness } from "@brains/plugins/test";
import {
  ContactRequestPlugin,
  contactRequestAdapter,
  contactSubmissionSchema,
} from "../src";

const frontmatter = {
  name: "Ada",
  email: "ada@example.com",
  receivedAt: "2026-09-21T10:00:00.000Z",
  expiresAt: "2026-10-21T10:00:00.000Z",
  status: "new" as const,
  notification: "pending" as const,
};

describe("contact request records", () => {
  it("round-trips private details in Markdown, not query metadata", () => {
    const message =
      "Could we talk?\n\n---\nvisibility: public\n# Still message text";
    const markdown = contactRequestAdapter.createContent(frontmatter, message);
    const parsed = contactRequestAdapter.parseContent(markdown);
    expect(parsed).toEqual({ frontmatter, message });
    const entity = contactRequestAdapter.fromMarkdown(markdown);
    expect(entity.visibility).toBe("restricted");
    expect(entity.metadata).toEqual({
      title: "Contact request",
      receivedAt: frontmatter.receivedAt,
      expiresAt: frontmatter.expiresAt,
      status: "new",
      notification: "pending",
    });
    expect(JSON.stringify(entity.metadata)).not.toContain("ada@example.com");
  });

  it("allows an empty optional message but bounds every submitted field", () => {
    expect(
      contactSubmissionSchema.parse({
        name: " Ada ",
        email: frontmatter.email,
      }),
    ).toEqual({
      name: "Ada",
      email: frontmatter.email,
      message: "",
      website: "",
    });
    for (const extra of [
      { name: "" },
      { name: "x".repeat(121) },
      { email: "not an address" },
      { message: "x".repeat(4001) },
      { website: "https://spam.test" },
      { visibility: "public" },
      { conversationId: "unverified-locator" },
    ]) {
      expect(
        contactSubmissionSchema.safeParse({
          name: "Ada",
          email: frontmatter.email,
          ...extra,
        }).success,
      ).toBe(false);
    }
    expect(
      contactRequestAdapter.parseContent(
        contactRequestAdapter.createContent(frontmatter, ""),
      ).message,
    ).toBe("");
  });

  it("requires finite bounded retention", () => {
    for (const expiresAt of [
      frontmatter.receivedAt,
      "2026-09-20T10:00:00.000Z",
      "2099-01-01T00:00:00.000Z",
    ]) {
      expect(() =>
        contactRequestAdapter.createContent(
          { ...frontmatter, expiresAt },
          "hello",
        ),
      ).toThrow("Invalid contact request");
    }
  });

  it("registers a restricted, non-indexed, non-projection entity and no public surface", async () => {
    const harness = createPluginHarness();
    const registry = harness.getEntityRegistry();
    type Validator = Parameters<typeof registry.registerPersistValidator>[1];
    let validator: Validator | undefined;
    registry.registerPersistValidator = (type, candidate): void => {
      if (type === "contact-request") validator = candidate;
    };
    const capabilities = await harness.installPlugin(
      new ContactRequestPlugin(),
    );
    expect(registry.getEntityTypeConfig("contact-request")).toMatchObject({
      embeddable: false,
      fullTextSearchable: false,
      projectionSource: false,
      projectionSourceRole: "excluded",
    });
    expect(capabilities.tools).toEqual([]);
    if (!validator) throw new Error("Missing persist validator");
    const entity = {
      id: "test",
      entityType: "contact-request",
      visibility: "restricted" as const,
      content: contactRequestAdapter.createContent(
        frontmatter,
        "Private message",
      ),
      metadata: {},
      contentHash: "test",
      created: frontmatter.receivedAt,
      updated: frontmatter.receivedAt,
    };
    expect(await validator(entity, { operation: "create" })).toBeUndefined();
    expect(
      validator({ ...entity, visibility: "public" }, { operation: "create" }),
    ).rejects.toThrow("Contact requests must have restricted visibility");
    expect(
      validator({ ...entity, visibility: "shared" }, { operation: "update" }),
    ).rejects.toThrow("Contact requests must have restricted visibility");
    expect(
      validator({ ...entity, content: "malformed" }, { operation: "update" }),
    ).rejects.toThrow("Invalid contact request");
  });
});
