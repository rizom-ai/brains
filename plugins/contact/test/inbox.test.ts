import { describe, expect, it } from "bun:test";
import { createPluginHarness } from "@brains/plugins/test";
import { createServicePluginContext } from "@brains/plugins";
import { instantiate, contactEntities } from "./helpers";
import { ContactInboxSource, contactRequestAdapter } from "../src";

const receivedAt = "2026-09-21T10:00:00.000Z";
const expiresAt = "2026-10-21T10:00:00.000Z";
const admin = { permissionLevel: "admin" as const };

async function fixture(): Promise<{
  harness: ReturnType<typeof createPluginHarness>;
  context: ConstructorParameters<typeof ContactInboxSource>[0];
}> {
  const harness = createPluginHarness();
  await harness.installPlugin(instantiate().entity);
  const entityService = harness.getEntityService();
  const content = contactRequestAdapter.createContent(
    {
      name: "Ada",
      email: "private@example.com",
      receivedAt,
      expiresAt,
      status: "new",
      notification: "pending",
    },
    "Private contact message <script>not HTML</script>",
  );
  const parsed = contactRequestAdapter.fromMarkdown(content);
  await entityService.createEntity({
    entity: {
      ...parsed,
      id: "contact-test",
      entityType: "contact-request",
      visibility: "restricted",
      content,
      metadata: parsed.metadata ?? {},
    },
  });
  return {
    harness,
    context: {
      ...createServicePluginContext(
        harness.getMockShell(),
        "@brains/contact:contact",
      ),
      entityService: contactEntities(entityService),
    },
  };
}

describe("contact inbox", () => {
  it("registers a pull-based inbox source without exposing routes or tools", async () => {
    const { harness } = await fixture();
    const plugin = instantiate().service;
    const capabilities = await harness.installPlugin(plugin);
    await harness.finalizeRegistration();
    expect(
      harness.getMockShell().getInboxRegistry().getSource("contact-requests"),
    ).toBeDefined();
    expect(capabilities.tools).toEqual([]);
    expect(plugin.getWebRoutes()).toEqual([]);
    expect(plugin.getApiRoutes()).toEqual([]);
  });

  it("lists each entity once and keeps personal details in the admin-only plain-text detail", async () => {
    const { context } = await fixture();
    const source = new ContactInboxSource(context, () =>
      Date.parse(receivedAt),
    );
    const listed = await source.list();
    expect(listed).toHaveLength(1);
    expect(await source.list()).toEqual(listed);
    expect(listed[0]).toMatchObject({
      id: "contact-test",
      title: "Contact request",
      entityRef: { entityType: "contact-request", entityId: "contact-test" },
    });
    for (const secret of [
      "Ada",
      "private@example.com",
      "Private contact message",
    ])
      expect(JSON.stringify(listed)).not.toContain(secret);
    const detail = await source.resolveDetail(
      "contact-test",
      admin,
      new AbortController().signal,
    );
    expect(detail).toMatchObject({ kind: "plain", truncated: false });
    expect(detail.text).toContain("private@example.com");
    expect(detail.text).toContain("<script>not HTML</script>");
    await source.act("contact-test", "mark-handled", admin);
    expect(await source.list()).toEqual([]);
    await source.act("contact-test", "mark-handled", admin);
    expect(await source.list()).toEqual([]);
  });

  it("denies non-admin detail/actions and unknown actions", async () => {
    const { context } = await fixture();
    const source = new ContactInboxSource(context, () =>
      Date.parse(receivedAt),
    );
    for (const permissionLevel of ["public", "trusted"] as const) {
      expect(
        source.resolveDetail(
          "contact-test",
          { permissionLevel },
          new AbortController().signal,
        ),
      ).rejects.toThrow("Contact inbox requires admin permission");
      expect(
        source.act("contact-test", "mark-handled", { permissionLevel }),
      ).rejects.toThrow("Contact inbox requires admin permission");
    }
    expect(source.act("contact-test", "publish", admin)).rejects.toThrow(
      "Invalid contact inbox action",
    );
    expect(await source.list()).toHaveLength(1);
  });

  it("does not overwrite a concurrent notification update when marking handled", async () => {
    const { context } = await fixture();
    const source = new ContactInboxSource(context, () =>
      Date.parse(receivedAt),
    );
    const update = context.entityService.update.bind(context.entityService);
    context.entityService.update = async (
      entity,
      options,
    ): ReturnType<typeof update> => {
      const current = await context.entityService.getEntity({
        entityType: "contact-request",
        id: "contact-test",
        visibilityScope: "restricted",
      });
      if (!current) throw new Error("Missing contact request");
      const parsed = contactRequestAdapter.parseContent(current.content);
      await update({
        ...current,
        content: contactRequestAdapter.createContent(
          { ...parsed.frontmatter, notification: "sent" },
          parsed.message,
        ),
        metadata: { ...current.metadata, notification: "sent" },
      });
      return update(entity, options);
    };
    const outcome = await source
      .act("contact-test", "mark-handled", admin)
      .then(
        () => "handled",
        (error: unknown) => {
          expect(error).toEqual(new Error("Contact request unavailable"));
          return "conflict";
        },
      );
    expect(outcome).toBe("conflict");
    const current = await context.entityService.getEntity({
      entityType: "contact-request",
      id: "contact-test",
      visibilityScope: "restricted",
    });
    if (!current) throw new Error("Missing contact request");
    expect(
      contactRequestAdapter.parseContent(current.content).frontmatter,
    ).toMatchObject({ status: "new", notification: "sent" });
  });

  it("hides expired records and honors cancellation before reading details", async () => {
    const { context } = await fixture();
    const source = new ContactInboxSource(context, () => Date.parse(expiresAt));
    expect(await source.list()).toEqual([]);
    expect(
      source.resolveDetail("contact-test", admin, new AbortController().signal),
    ).rejects.toThrow("Contact request unavailable");
    expect(source.act("contact-test", "mark-handled", admin)).rejects.toThrow(
      "Contact request unavailable",
    );
    const controller = new AbortController();
    controller.abort();
    expect(
      source.resolveDetail("contact-test", admin, controller.signal),
    ).rejects.toThrow();
  });
});
