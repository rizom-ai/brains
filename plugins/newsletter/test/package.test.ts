import { afterEach, describe, expect, it } from "bun:test";
import { SYSTEM_CHANNELS } from "@brains/plugins";
import {
  createPluginHarness,
  expectTemplateDataSourcesResolve,
} from "@brains/plugins/test";
import { createSilentLogger } from "@brains/test-utils";
import { SITE_BUILDER_CHANNELS } from "@brains/contracts";
import { newsletterEntity } from "../src";
import { newsletterMetadataSchema } from "../src/schemas/newsletter";
import {
  ENTITY_PLUGIN_ID,
  PACKAGE_METADATA,
  SERVICE_PLUGIN_ID,
  installNewsletter,
  instantiate,
} from "./helpers/install";

describe("newsletter package", () => {
  const harness = createPluginHarness({
    logger: createSilentLogger("newsletter-package-test"),
  });

  afterEach(async () => {
    await harness.reset();
  });

  it("produces the Buttondown service and the newsletter entity, scoped to the package", () => {
    const { service, entity } = instantiate();

    expect(service.id).toBe(SERVICE_PLUGIN_ID);
    expect(service.type).toBe("service");
    expect(entity.id).toBe(ENTITY_PLUGIN_ID);
    expect(entity.type).toBe("entity");
    expect(entity.version).toBe(PACKAGE_METADATA.version);
  });

  it("refuses a config it cannot read", () => {
    expect(() => instantiate({ doubleOptIn: "yes" })).toThrow(
      /Invalid plugin config/,
    );
  });

  it("declares newsletters as secondary topic sources with publish statuses", async () => {
    await installNewsletter(harness);

    expect(
      harness.getEntityRegistry().getEntityTypeConfig("newsletter"),
    ).toMatchObject({
      projectionSourceRole: "secondary",
      publish: { publishStatuses: ["queued", "published", "failed"] },
    });
  });

  it("registers templates that point at data sources it declares", async () => {
    await installNewsletter(harness);

    expectTemplateDataSourcesResolve(harness);
    expect([...harness.getTemplates().keys()]).toEqual(
      expect.arrayContaining([
        `${ENTITY_PLUGIN_ID}:generation`,
        `${ENTITY_PLUGIN_ID}:newsletter-list`,
        `${ENTITY_PLUGIN_ID}:newsletter-detail`,
      ]),
    );
  });

  it("offers a placeholder that reads back through its own codec", async () => {
    await installNewsletter(harness);
    const adapter = harness.getEntityRegistry().getAdapter("newsletter");
    const buildStub = adapter.buildStub;
    if (!buildStub) throw new Error("Expected the newsletter adapter to stub");

    const stub = buildStub({ id: "issue-7", title: "Issue 7" });

    expect(newsletterMetadataSchema.parse(stub.metadata)).toEqual({
      subject: "Issue 7",
      status: "generating",
    });
    expect(adapter.fromMarkdown(stub.content).metadata).toMatchObject({
      subject: "Issue 7",
      status: "generating",
    });
  });

  it("keeps the frontmatter in the file and indexes it as metadata", async () => {
    await installNewsletter(harness);
    const adapter = harness.getEntityRegistry().getAdapter("newsletter");
    const markdown = [
      "---",
      "subject: Weekly Update",
      "status: published",
      "sentAt: 2025-01-15T10:00:00.000Z",
      "buttondownId: email-123",
      "entityIds:",
      "  - post-1",
      "---",
      "",
      "Hello subscribers",
      "",
    ].join("\n");

    const decoded = adapter.fromMarkdown(markdown);

    expect(decoded.metadata).toEqual({
      subject: "Weekly Update",
      status: "published",
      sentAt: "2025-01-15T10:00:00.000Z",
      buttondownId: "email-123",
      entityIds: ["post-1"],
    });
    // The body is served without the header; the stored file keeps it.
    expect(decoded.content).toContain("subject: Weekly Update");
    expect(decoded.content).toContain("Hello subscribers");
  });

  it("writes from the ten most recent published posts when a schedule asks for a newsletter", () => {
    expect(newsletterEntity.scheduledGeneration).toEqual({
      from: { entityType: "post", status: "published", limit: 10 },
      mode: "batch",
    });
  });

  describe("publish provider", () => {
    async function registrations(
      config: { apiKey?: string } = {},
    ): Promise<Array<{ type: string; payload: unknown }>> {
      const messages: Array<{ type: string; payload: unknown }> = [];
      harness.subscribe("publish:register", async (msg) => {
        messages.push({ type: "publish:register", payload: msg.payload });
        return { success: true };
      });
      await installNewsletter(harness, config);
      await harness.sendMessage(
        SYSTEM_CHANNELS.pluginsRegistered,
        { timestamp: new Date().toISOString(), pluginCount: 2 },
        "shell",
        true,
      );
      return messages;
    }

    it("announces Buttondown as the newsletter publisher once configured", async () => {
      const messages = await registrations({ apiKey: "test-key" });

      expect(messages).toHaveLength(1);
      expect(messages[0]?.payload).toMatchObject({
        entityType: "newsletter",
        provider: { name: "buttondown" },
        config: {
          publishResultIdField: "buttondownId",
          publishTimestampField: "sentAt",
        },
      });
    });

    it("announces no publisher without an API key", async () => {
      expect(await registrations()).toEqual([]);
    });
  });

  describe("signup slot", () => {
    async function slotRegistrations(
      config: { apiKey?: string } = {},
    ): Promise<unknown[]> {
      const registered: unknown[] = [];
      harness.subscribe(SITE_BUILDER_CHANNELS.slotRegister, async (msg) => {
        registered.push(msg.payload);
        return { success: true };
      });
      const { service } = await installNewsletter(harness, config);
      if (!service.ready) throw new Error("Service plugin has no ready hook");
      await service.ready();
      return registered;
    }

    it("offers the footer signup form to the site once Buttondown is configured", async () => {
      const registered = await slotRegistrations({ apiKey: "test-key" });

      expect(registered).toHaveLength(1);
      expect(registered[0]).toMatchObject({
        slotName: "footer-top",
        pluginId: "buttondown",
      });
      const payload = registered[0];
      const render =
        typeof payload === "object" && payload !== null
          ? Reflect.get(payload, "render")
          : undefined;
      expect(typeof render).toBe("function");
    });

    it("offers no signup form without an API key", async () => {
      expect(await slotRegistrations()).toEqual([]);
    });
  });
});
