import { afterEach, describe, expect, test } from "bun:test";
import { defineEntity } from "@brains/sdk/entities";
import { defineServicePlugin, z } from "@brains/sdk/services";
import {
  serviceRuntime,
  type ServiceRuntime,
} from "@brains/sdk/internal/service-runtime";
import {
  declaredEntityStore,
  type DeclaredEntityStore,
} from "./helpers/declared-entity-store";

/**
 * A first-party service that seeds a document its package bundles, as the
 * playbook type's steward seeds onboarding's playbooks, stores the document
 * as written, byte for byte, as the class's createEntityFromMarkdown did:
 * the declared write path would restate its frontmatter. It writes only the
 * types its header owns.
 */

const guide = defineEntity({
  type: "guide-probe",
  purpose: "A bundled guide",
  metadata: z.object({
    title: z.string(),
    status: z.enum(["draft", "active"]).optional(),
  }),
});
// The same, but its schema fills a status the file leaves unstated.
const defaulted = defineEntity({
  type: "defaulted-probe",
  purpose: "A bundled guide with a default",
  metadata: z.object({
    title: z.string(),
    status: z.enum(["draft", "active"]).default("active"),
  }),
});
const other = defineEntity({
  type: "other-probe",
  purpose: "Another package's type",
  metadata: z.object({}),
});

let runtime: ServiceRuntime | undefined;
/** A steward of one type, whose runtime the test keeps. */
function stewardOf(
  type: typeof guide | typeof defaulted,
): ReturnType<typeof defineServicePlugin> {
  return defineServicePlugin(
    { id: "guides-probe", config: z.object({}), entities: [type] },
    {
      subscriptions: (context) => {
        runtime = serviceRuntime(context);
        return [];
      },
    },
  );
}
const steward = stewardOf(guide);

const stores: DeclaredEntityStore[] = [];
afterEach(async () => {
  for (const store of stores.splice(0)) await store.close();
  runtime = undefined;
});

// As a bundled file is written: a blank line after its frontmatter, and a
// field left unstated.
const bundled = "---\ntitle: First Steps\n---\n\n# Guide\n\nSay hello.\n";

describe("a first-party service importing a bundled document", () => {
  test("stores the document as written, under the id it names", async () => {
    const opened = await declaredEntityStore(
      steward,
      "@brains/guides-probe",
      "guides-probe",
    );
    stores.push(opened);
    if (!runtime) throw new Error("No runtime");

    await runtime.importDocument(guide, {
      id: "first-steps",
      markdown: bundled,
    });

    expect((await opened.stored("guide-probe", "first-steps"))?.content).toBe(
      bundled,
    );
    expect(
      (
        await opened.service.getEntity({
          entityType: "guide-probe",
          id: "first-steps",
        })
      )?.metadata,
    ).toEqual({ title: "First Steps" });
  });

  test("writes a default its type's schema fills into the document", async () => {
    const opened = await declaredEntityStore(
      stewardOf(defaulted),
      "@brains/guides-probe",
      "guides-probe",
    );
    stores.push(opened);
    if (!runtime) throw new Error("No runtime");

    await runtime.importDocument(defaulted, {
      id: "first-steps",
      markdown: bundled,
    });

    // A declared type's metadata is its frontmatter: a filled default is
    // stated in the stored document, which the class kept as written.
    expect(
      (await opened.stored("defaulted-probe", "first-steps"))?.content,
    ).toBe(
      "---\ntitle: First Steps\nstatus: active\n---\n\n# Guide\n\nSay hello.\n",
    );
  });

  test("refuses a type its header does not own", async () => {
    const opened = await declaredEntityStore(
      steward,
      "@brains/guides-probe",
      "guides-probe",
    );
    stores.push(opened);
    if (!runtime) throw new Error("No runtime");
    const imported = runtime;

    const refusal = await imported
      .importDocument(other, { id: "x", markdown: "---\n---\nBody\n" })
      .then(
        () => undefined,
        (error: unknown) => error,
      );
    expect(refusal).toMatchObject({ code: "permission_denied" });
  });
});
