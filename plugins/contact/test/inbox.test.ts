import { describe, expect, it, spyOn } from "bun:test";
import { createPluginHarness } from "@brains/plugins/test";
import { createServicePluginContext, type InboxActor } from "@brains/plugins";
import { instantiate, contactEntities } from "./helpers";
import { ContactInboxSource, contactRequestAdapter } from "../src";

const receivedAt = "2026-09-21T10:00:00.000Z";
const expiresAt = "2026-10-21T10:00:00.000Z";
const admin = { permissionLevel: "admin" as const };

async function fixture(): Promise<{
  harness: ReturnType<typeof createPluginHarness>;
  context: ConstructorParameters<typeof ContactInboxSource>[0];
}> {
  const harness = createPluginHarness({ domain: "brain.test" });
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

function act(
  harness: ReturnType<typeof createPluginHarness>,
  source: ContactInboxSource,
  id: string,
  action: string,
  actor: InboxActor,
): Promise<void> {
  return harness.withInboxContext(
    "@brains/contact:contact",
    ["contact-request"],
    (context) => source.act(id, action, actor, context.edits),
    { permission: actor.permissionLevel },
  );
}

describe("contact inbox", () => {
  it("registers a pull-based inbox source, with the form's routes and no tools", async () => {
    const { harness } = await fixture();
    const plugin = instantiate().service;
    const capabilities = await harness.installPlugin(plugin);
    await harness.finalizeRegistration();
    expect(
      harness.getMockShell().getInboxRegistry().getSource("contact-requests"),
    ).toBeDefined();
    expect(capabilities.tools).toEqual([]);
    expect(plugin.getWebRoutes().map((route) => route.path)).toEqual([
      "/contact",
      "/contact",
      "/contact/thanks",
    ]);
    expect(plugin.getApiRoutes()).toEqual([]);
  });

  it("lists each entity once and keeps personal details in the admin-only plain-text detail", async () => {
    const { context, harness } = await fixture();
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
    await act(harness, source, "contact-test", "mark-handled", admin);
    expect(await source.list()).toEqual([]);
    await act(harness, source, "contact-test", "mark-handled", admin);
    expect(await source.list()).toEqual([]);
  });

  it("denies non-admin detail/actions and unknown actions", async () => {
    const { context, harness } = await fixture();
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
        act(harness, source, "contact-test", "mark-handled", {
          permissionLevel,
        }),
      ).rejects.toThrow("Contact inbox requires admin permission");
    }
    expect(
      act(harness, source, "contact-test", "publish", admin),
    ).rejects.toThrow("Invalid contact inbox action");
    expect(await source.list()).toHaveLength(1);
  });

  it("does not overwrite a concurrent notification update when marking handled", async () => {
    const { context, harness } = await fixture();
    const source = new ContactInboxSource(context, () =>
      Date.parse(receivedAt),
    );
    const service = harness.getEntityService();
    const update = service.updateEntity.bind(service);
    spyOn(service, "updateEntity").mockImplementation(async (request) => {
      const current = await context.entityService.getEntity({
        entityType: "contact-request",
        id: "contact-test",
        visibilityScope: "restricted",
      });
      if (!current) throw new Error("Missing contact request");
      const parsed = contactRequestAdapter.parseContent(current.content);
      await update({
        entity: {
          ...current,
          content: contactRequestAdapter.createContent(
            { ...parsed.frontmatter, notification: "sent" },
            parsed.message,
          ),
          metadata: { ...current.metadata, notification: "sent" },
        },
      });
      return update(request);
    });
    const outcome = await act(
      harness,
      source,
      "contact-test",
      "mark-handled",
      admin,
    ).then(
      () => "handled",
      (error: unknown) => {
        expect(error).toMatchObject({
          message: "Contact request unavailable",
          cause: { code: "conflict" },
        });
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
    const { context, harness } = await fixture();
    const source = new ContactInboxSource(context, () => Date.parse(expiresAt));
    expect(await source.list()).toEqual([]);
    expect(
      source.resolveDetail("contact-test", admin, new AbortController().signal),
    ).rejects.toThrow("Contact request unavailable");
    expect(
      act(harness, source, "contact-test", "mark-handled", admin),
    ).rejects.toThrow("Contact request unavailable");
    const controller = new AbortController();
    controller.abort();
    expect(
      source.resolveDetail("contact-test", admin, controller.signal),
    ).rejects.toThrow();
  });
});
