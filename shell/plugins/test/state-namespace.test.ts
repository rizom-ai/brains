import { describe, expect, it } from "bun:test";
import { RuntimeStateService } from "@brains/runtime-state";
import { migrateRuntimeState } from "@brains/runtime-state/migrate";
import { createTestDatabase } from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import {
  interfaceStateNamespaceFor,
  stateNamespaceFor,
} from "../src/internal/state-namespace";

const cases = [
  { name: "@scope/pkg", namespace: "cache" },
  { name: "scope.pkg", namespace: "cache" },
  { name: "scope", namespace: "pkg.cache" },
  { name: "@scope/pkg.extra", namespace: "cache" },
  { name: "@scope.pkg/extra", namespace: "cache" },
  { name: "@scope/pkg", namespace: "extra.cache" },
  { name: "package", namespace: "scope:cache" },
];

describe("package-owned state namespaces", () => {
  it("keeps ordinary scoped keys and separates owner and namespace boundaries", () => {
    expect(
      stateNamespaceFor("@brains/email-workflows", "classification-attempts"),
    ).toBe("brains.email-workflows.classification-attempts");
    expect(stateNamespaceFor("@rizom/example", "nested.state")).toBe(
      "rizom.example.nested.state",
    );
    const keys = cases.map(({ name, namespace }) =>
      stateNamespaceFor(name, namespace),
    );
    expect(new Set(keys).size).toBe(cases.length);
    expect(stateNamespaceFor("scope.pkg", "cache")).toBe(
      "package:c2NvcGUucGtn:cache",
    );
    expect(() => stateNamespaceFor("\ud800", "cache")).toThrow("well-formed");
  });

  it("reopens existing scoped state without moving it and never guesses ownership of old collapsed keys", async () => {
    const database = await createTestDatabase({
      prefix: "state-owner-",
      filename: "runtime-state.db",
      migrate: (url) => migrateRuntimeState({ url }),
    });
    let service = RuntimeStateService.createFresh({ url: database.url });
    const schema = z.string();
    try {
      await service.initialize();
      // These are physical keys written before the encoding correction.
      const existing = "brains.email-workflows.classification-attempts";
      await service
        .scoped({ namespace: existing, schema })
        .set("old", "existing-value");
      const collapsed = "scope.pkg.cache";
      await service
        .scoped({ namespace: collapsed, schema })
        .set("old", "ambiguous-owner");
      service.close();
      service = RuntimeStateService.createFresh({ url: database.url });
      await service.initialize();
      expect(
        await service
          .scoped({
            namespace: stateNamespaceFor(
              "@brains/email-workflows",
              "classification-attempts",
            ),
            schema,
          })
          .get("old"),
      ).toBe("existing-value");
      const encoded = service.scoped({
        namespace: stateNamespaceFor("scope.pkg", "cache"),
        schema,
      });
      expect(await encoded.get("old")).toBeNull();
      expect(
        await service.scoped({ namespace: collapsed, schema }).get("old"),
      ).toBe("ambiguous-owner");
      for (const entry of cases) {
        await service
          .scoped({
            namespace: stateNamespaceFor(entry.name, entry.namespace),
            schema,
          })
          .set("shared", `${entry.name}:${entry.namespace}`);
      }
      service.close();
      service = RuntimeStateService.createFresh({ url: database.url });
      await service.initialize();
      for (const entry of cases) {
        expect(
          await service
            .scoped({
              namespace: stateNamespaceFor(entry.name, entry.namespace),
              schema,
            })
            .get("shared"),
        ).toBe(`${entry.name}:${entry.namespace}`);
      }
      expect(
        await service.scoped({ namespace: existing, schema }).get("old"),
      ).toBe("existing-value");
      expect(
        await service.scoped({ namespace: collapsed, schema }).get("old"),
      ).toBe("ambiguous-owner");
    } finally {
      service.close();
      await database.cleanup();
    }
  });
});

const interfaceCases = [
  {
    packageName: `@fixture/${"long-owner-".repeat(7)}`,
    name: "external-interface",
    namespace: "inbound.uid-cursor",
  },
  {
    packageName: "@brains/email",
    name: "email",
    namespace: "inbound.uid-cursor",
  },
  {
    packageName: "@fixture/email",
    name: "email",
    namespace: "inbound.uid-cursor",
  },
  {
    packageName: "@brains/email",
    name: "email",
    namespace: "inbound.source-locators",
  },
  { packageName: "@brains/chat", name: "chat", namespace: "subscriptions" },
  { packageName: "@brains/chat", name: "discord", namespace: "subscriptions" },
  { packageName: "@brains/chat", name: "slack", namespace: "subscriptions" },
  { packageName: "@fixture/chat", name: "discord", namespace: "subscriptions" },
  { packageName: "@fixture/chat", name: "slack", namespace: "subscriptions" },
  { packageName: "@fixture/first", name: "state-owner", namespace: "cache" },
  { packageName: "@fixture/second", name: "state-owner", namespace: "cache" },
  { packageName: "@fixture/interface", name: "scope", namespace: "pkg.cache" },
  // Defensive internal coverage; the public declaration API requires flat IDs.
  { packageName: "@fixture/interface", name: "scope.pkg", namespace: "cache" },
  {
    packageName: "@fixture/interface",
    name: "interface",
    namespace: "ZW1haWw:inbound.uid-cursor",
  },
];
const mixedCases = [
  ...[
    ...cases,
    { name: "@email/inbound", namespace: "uid-cursor" },
    { name: "@email/inbound", namespace: "source-locators" },
    { name: "email", namespace: "inbound.uid-cursor" },
  ].map((entry) => ({
    key: stateNamespaceFor(entry.name, entry.namespace),
    value: JSON.stringify({ family: "package", ...entry }),
  })),
  ...interfaceCases.map((entry) => ({
    key: interfaceStateNamespaceFor(
      entry.packageName,
      entry.name,
      entry.namespace,
    ),
    value: JSON.stringify({ family: "interface", ...entry }),
  })),
];

describe("interface-owned state namespaces", () => {
  it("separates package and declaration identities in every interface namespace", () => {
    expect(
      interfaceStateNamespaceFor("@brains/chat", "chat", "subscriptions"),
    ).toBe("interface:QGJyYWlucy9jaGF0:Y2hhdA:subscriptions");
    expect(
      interfaceStateNamespaceFor(
        "@brains/email",
        "email",
        "inbound.uid-cursor",
      ),
    ).toBe("interface:QGJyYWlucy9lbWFpbA:ZW1haWw:inbound.uid-cursor");
    expect(new Set(mixedCases.map(({ key }) => key)).size).toBe(
      mixedCases.length,
    );
    expect(() =>
      interfaceStateNamespaceFor("@fixture/interface", "\ud800", "cache"),
    ).toThrow("well-formed");
    expect(() =>
      interfaceStateNamespaceFor("\ud800", "email", "cache"),
    ).toThrow("well-formed");
    expect(() =>
      interfaceStateNamespaceFor("@fixture/interface", "", "cache"),
    ).toThrow();
  });

  it("persists isolated owners across restart without migrating or reading ambiguous old interface state", async () => {
    const database = await createTestDatabase({
      prefix: "interface-state-owner-",
      filename: "runtime-state.db",
      migrate: (url) => migrateRuntimeState({ url }),
    });
    let service = RuntimeStateService.createFresh({ url: database.url });
    const schema = z.string();
    try {
      await service.initialize();
      for (const declarationId of ["chat", "discord", "slack"]) {
        await service
          .scoped({ namespace: `${declarationId}.subscriptions`, schema })
          .set("old", `existing-${declarationId}-state`);
      }
      await service
        .scoped({ namespace: "email.inbound.uid-cursor", schema })
        .set("old", "unmigrated-development-state");
      for (const { key, value } of mixedCases) {
        await service.scoped({ namespace: key, schema }).set("shared", value);
      }
      service.close();
      service = RuntimeStateService.createFresh({ url: database.url });
      await service.initialize();
      for (const { key, value } of mixedCases) {
        expect(
          await service.scoped({ namespace: key, schema }).get("shared"),
        ).toBe(value);
      }
      for (const declarationId of ["chat", "discord", "slack"]) {
        expect(
          await service
            .scoped({
              namespace: interfaceStateNamespaceFor(
                "@brains/chat",
                declarationId,
                "subscriptions",
              ),
              schema,
            })
            .get("old"),
        ).toBeNull();
        expect(
          await service
            .scoped({ namespace: `${declarationId}.subscriptions`, schema })
            .get("old"),
        ).toBe(`existing-${declarationId}-state`);
      }
      expect(
        await service
          .scoped({
            namespace: interfaceStateNamespaceFor(
              "@brains/email",
              "email",
              "inbound.uid-cursor",
            ),
            schema,
          })
          .get("old"),
      ).toBeNull();
      expect(
        await service
          .scoped({ namespace: "email.inbound.uid-cursor", schema })
          .get("old"),
      ).toBe("unmigrated-development-state");
    } finally {
      service.close();
      await database.cleanup();
    }
  });
});
