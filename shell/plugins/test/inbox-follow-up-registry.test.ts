import { describe, expect, it } from "bun:test";
import { z } from "@brains/utils/zod";
import {
  InboxFollowUpRegistry,
  type InboxActor,
  type InboxFollowUpKindRegistration,
  type InboxItem,
} from "../src";

const actor: InboxActor = { permissionLevel: "admin" };

function item(overrides: Partial<InboxItem> = {}): InboxItem {
  return {
    id: "mail-1",
    title: "Review the proposal",
    summary: "A content-safe summary.",
    receivedAt: "2026-08-13T08:00:00.000Z",
    urgency: "high",
    entityRef: { entityType: "mail-item", entityId: "mail-1" },
    actions: [],
    ...overrides,
  };
}

function universal(
  overrides: Partial<InboxFollowUpKindRegistration> = {},
): InboxFollowUpKindRegistration {
  return {
    kind: "open-entity",
    label: "Open source entity",
    priority: 30,
    mode: "universal",
    permissionLevel: "trusted",
    applies: ({ item: candidate }) => candidate.entityRef !== undefined,
    resolve: ({ item: candidate }) => ({
      href: `/cms/entities/${candidate.entityRef?.entityType}/${candidate.entityRef?.entityId}`,
    }),
    ...overrides,
  };
}

describe("InboxFollowUpRegistry", () => {
  it("closes registration at finalization and freezes normalized metadata", async () => {
    const registry = new InboxFollowUpRegistry();
    registry.registerKind(
      "cms",
      universal({ label: "  Open source entity  " }),
    );

    expect(() => registry.listKinds()).toThrow(
      "Inbox follow-up registry is not finalized",
    );

    registry.finalize();
    const registered = registry.getKind("open-entity");

    expect(registered).toMatchObject({
      kind: "open-entity",
      label: "Open source entity",
      priority: 30,
      mode: "universal",
      permissionLevel: "trusted",
    });
    expect(Object.isFrozen(registered)).toBe(true);
    expect(() => registry.registerKind("late", universal())).toThrow(
      "Inbox follow-up registration is closed",
    );
    expect(
      await registry.resolveUniversal({
        sourceId: "email-triage",
        item: item(),
        actor,
      }),
    ).toEqual([
      {
        kind: "open-entity",
        label: "Open source entity",
        href: "/cms/entities/mail-item/mail-1",
      },
    ]);
  });

  it("rejects duplicate kind ownership when the catalog finalizes", () => {
    const registry = new InboxFollowUpRegistry();
    registry.registerKind("cms", universal());
    registry.registerKind("other", universal());

    expect(() => registry.finalize()).toThrow(
      'Inbox follow-up kind "open-entity" is registered by multiple plugins: cms, other',
    );
  });

  it("requires declared kinds to own their context schema", () => {
    const registry = new InboxFollowUpRegistry();

    expect(() =>
      registry.registerKind("drafting", {
        ...universal({ kind: "draft-reply", mode: "declared" }),
        contextSchema: undefined,
      } as unknown as InboxFollowUpKindRegistration),
    ).toThrow("Declared inbox follow-up kinds require a context schema");
  });

  it("never auto-applies declared kinds and orders universal kinds deterministically", async () => {
    const registry = new InboxFollowUpRegistry();
    let declaredResolved = false;
    registry.registerKind(
      "chat",
      universal({
        kind: "discuss-in-chat",
        label: "Discuss in chat",
        priority: 20,
        resolve: () => ({ href: "/chat" }),
      }),
    );
    registry.registerKind("cms", universal());
    registry.registerKind(
      "notes",
      universal({
        kind: "capture-as-note",
        label: "Capture as note",
        priority: 20,
        resolve: () => ({ href: "/cms/entities/note?mode=create" }),
      }),
    );
    registry.registerKind("drafting", {
      kind: "draft-reply",
      label: "Draft reply",
      priority: 1,
      mode: "declared",
      permissionLevel: "admin",
      contextSchema: z.strictObject({
        mailItemId: z.string().trim().min(1).max(300),
      }),
      applies: () => true,
      resolve: () => {
        declaredResolved = true;
        return { href: "/draft" };
      },
    });
    registry.finalize();

    const resolved = await registry.resolveUniversal({
      sourceId: "email-triage",
      item: item(),
      actor,
    });

    expect(resolved.map((entry) => entry.kind)).toEqual([
      "capture-as-note",
      "discuss-in-chat",
      "open-entity",
    ]);
    expect(declaredResolved).toBe(false);
  });

  it("applies presentation permission and item predicates before resolving", async () => {
    const registry = new InboxFollowUpRegistry();
    let resolveCalls = 0;
    registry.registerKind(
      "cms",
      universal({
        permissionLevel: "admin",
        resolve: () => {
          resolveCalls += 1;
          return { href: "/cms/entities/mail-item/mail-1" };
        },
      }),
    );
    registry.finalize();

    expect(
      await registry.resolveUniversal({
        sourceId: "email-triage",
        item: item({ entityRef: undefined }),
        actor,
      }),
    ).toEqual([]);
    expect(
      await registry.resolveUniversal({
        sourceId: "email-triage",
        item: item(),
        actor: { permissionLevel: "trusted" },
      }),
    ).toEqual([]);
    expect(resolveCalls).toBe(0);
  });

  it.each([
    "https://evil.test/steal",
    "//evil.test/steal",
    "/safe\\redirect",
    "/safe\u0000redirect",
    `/${"x".repeat(2_048)}`,
  ])("drops an unsafe final resolver target: %s", async (href) => {
    const registry = new InboxFollowUpRegistry();
    registry.registerKind("cms", universal({ resolve: () => ({ href }) }));
    registry.finalize();

    expect(
      await registry.resolveUniversal({
        sourceId: "email-triage",
        item: item(),
        actor,
      }),
    ).toEqual([]);
  });

  it("preserves a bounded JSON-safe state envelope and freezes the result", async () => {
    const registry = new InboxFollowUpRegistry();
    registry.registerKind(
      "cms",
      universal({
        resolve: () => ({
          href: "/cms/entities/note?mode=create",
          state: {
            cmsCreatePrefill: {
              version: 1,
              title: "Review the proposal",
              backlink: "entity://mail-item/mail-1",
            },
          },
        }),
      }),
    );
    registry.finalize();

    const [resolved] = await registry.resolveUniversal({
      sourceId: "email-triage",
      item: item(),
      actor,
    });

    expect(resolved).toEqual({
      kind: "open-entity",
      label: "Open source entity",
      href: "/cms/entities/note?mode=create",
      state: {
        cmsCreatePrefill: {
          version: 1,
          title: "Review the proposal",
          backlink: "entity://mail-item/mail-1",
        },
      },
    });
    expect(Object.isFrozen(resolved)).toBe(true);
    expect(Object.isFrozen(resolved?.state)).toBe(true);
  });

  it.each([
    { unsafe: undefined },
    { unsafe: Number.NaN },
    { unsafe: (): string => "not json" },
    { unsafe: "x".repeat(8_193) },
  ])("drops malformed or oversized resolver state", async (state) => {
    const registry = new InboxFollowUpRegistry();
    registry.registerKind(
      "cms",
      universal({
        resolve: () => ({ href: "/cms", state }),
      }),
    );
    registry.finalize();

    expect(
      await registry.resolveUniversal({
        sourceId: "email-triage",
        item: item(),
        actor,
      }),
    ).toEqual([]);
  });

  it("isolates predicate and resolver failures to one launch", async () => {
    const registry = new InboxFollowUpRegistry();
    registry.registerKind(
      "broken-predicate",
      universal({
        kind: "broken-predicate",
        priority: 1,
        applies: () => {
          throw new Error("private predicate detail");
        },
      }),
    );
    registry.registerKind(
      "broken-resolver",
      universal({
        kind: "broken-resolver",
        priority: 2,
        resolve: () => {
          throw new Error("private resolver detail");
        },
      }),
    );
    registry.registerKind("cms", universal());
    registry.finalize();

    expect(
      await registry.resolveUniversal({
        sourceId: "email-triage",
        item: item(),
        actor,
      }),
    ).toEqual([
      {
        kind: "open-entity",
        label: "Open source entity",
        href: "/cms/entities/mail-item/mail-1",
      },
    ]);
  });

  it("removes a stopped owner from the finalized catalog", async () => {
    const registry = new InboxFollowUpRegistry();
    registry.registerKind("cms", universal());
    registry.finalize();

    registry.unregisterPlugin("cms");

    expect(registry.listKinds()).toEqual([]);
    expect(
      await registry.resolveUniversal({
        sourceId: "email-triage",
        item: item(),
        actor,
      }),
    ).toEqual([]);
  });
});
