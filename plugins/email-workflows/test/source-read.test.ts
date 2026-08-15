import { describe, expect, it } from "bun:test";
import {
  EMAIL_SOURCE_READ,
  emailSourceReadRequestSchema,
} from "@brains/contracts";
import { createPluginHarness } from "@brains/plugins/test";
import {
  MailItemPlugin,
  MailTriageInboxSource,
  MailTriageOperatorService,
  createMailItemProjection,
} from "../src";
import { EmailWorkflowsSourceReader } from "../src/source-read";

const sourceRef = `imap:${"a".repeat(64)}`;

interface SourceReadFixture {
  harness: ReturnType<typeof createPluginHarness>;
  operator: MailTriageOperatorService;
  reader: EmailWorkflowsSourceReader;
  itemId: string;
}

async function createFixture(): Promise<SourceReadFixture> {
  const harness = createPluginHarness();
  await harness.installPlugin(new MailItemPlugin());
  const projection = createMailItemProjection(
    {
      messageId: "<private-message-id@example.com>",
      sourceRef,
      from: { address: "private-sender@example.com" },
      to: [{ address: "private-recipient@example.net" }],
      subject: "Private original subject",
      receivedAt: "2026-08-05T09:00:00.000Z",
      text: "Private original body",
      headers: {},
    },
    {
      decision: "retain",
      title: "Safe routing title",
      category: "work",
      priority: "high",
      needsReply: true,
      requestedActions: ["Reply"],
      summary: "Safe derived summary.",
    },
  );
  const created = await harness.getEntityService().createEntity({
    entity: {
      ...projection,
      created: "2026-08-05T09:00:00.000Z",
      updated: "2026-08-05T09:00:00.000Z",
    },
  });
  const operator = new MailTriageOperatorService(
    harness.getServiceContext("email-workflows"),
  );
  const reader = new EmailWorkflowsSourceReader(
    harness.getServiceContext("email-workflows"),
    operator,
  );
  return { harness, operator, reader, itemId: created.entityId };
}

describe("EmailWorkflowsSourceReader", () => {
  it("resolves the restricted mail locator and forwards only an Admin actor", async () => {
    const fixture = await createFixture();
    const requests: unknown[] = [];
    fixture.harness.subscribe(EMAIL_SOURCE_READ, async (message) => {
      requests.push(message.payload);
      return {
        success: true,
        data: {
          kind: "available",
          message: {
            messageId: "<private-message-id@example.com>",
            from: { address: "private-sender@example.com" },
            to: [{ address: "private-recipient@example.net" }],
            subject: "Private original subject",
            receivedAt: "2026-08-05T09:00:00.000Z",
            text: "Private original body",
            references: [],
            truncated: false,
          },
        },
      };
    });

    expect(
      await fixture.operator.getSourceRef(fixture.itemId, {
        userPermissionLevel: "admin",
      }),
    ).toBe(sourceRef);
    const result = await fixture.reader.read({
      itemId: fixture.itemId,
      actor: { permissionLevel: "admin" },
      signal: new AbortController().signal,
    });

    expect(requests).toHaveLength(1);
    expect(result).toMatchObject({
      kind: "available",
      message: { text: "Private original body" },
    });
    const request = emailSourceReadRequestSchema.parse(requests[0]);
    expect(request.sourceRef).toBe(sourceRef);
    expect(request.actor).toEqual({ permissionLevel: "admin" });
    expect(request.signal).toBeInstanceOf(AbortSignal);
    expect(
      await new MailTriageInboxSource(
        fixture.operator,
        undefined,
        fixture.reader,
      ).resolveDetail(
        fixture.itemId,
        { permissionLevel: "admin" },
        new AbortController().signal,
      ),
    ).toEqual({
      kind: "plain",
      text: "Private original body",
      truncated: false,
    });

    const entity = await fixture.harness.getEntityService().getEntity({
      entityType: "mail-item",
      id: fixture.itemId,
      visibilityScope: "restricted",
    });
    expect(JSON.stringify(entity)).not.toContain("Private original body");
    expect(JSON.stringify(entity)).not.toContain(
      "private-recipient@example.net",
    );
  });

  it("fails closed before source access for non-Admins and missing items", async () => {
    const fixture = await createFixture();
    let reads = 0;
    fixture.harness.subscribe(EMAIL_SOURCE_READ, async () => {
      reads += 1;
      throw new Error("private provider failure");
    });

    expect(
      await fixture.reader.read({
        itemId: fixture.itemId,
        actor: { permissionLevel: "trusted" },
      }),
    ).toEqual({ kind: "unavailable" });
    expect(
      await fixture.reader.read({
        itemId: `mail-${"b".repeat(64)}`,
        actor: { permissionLevel: "admin" },
      }),
    ).toEqual({ kind: "unavailable" });
    expect(reads).toBe(0);
  });
});
