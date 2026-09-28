import { expect, test as bunTest } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  installPackedConsumer,
  packedCompatibilityEvidenceEnabled,
  packPackages,
  runCommand,
  startCommand,
} from "./helpers/packed-consumer";

const test = bunTest.skipIf(!packedCompatibilityEvidenceEnabled());
test("packed Studio definitions and field tools preserve multiple runtime grouping extensions", async () => {
  const directory = await mkdtemp(
    join(tmpdir(), "public-authoring-studio-groupings-"),
  );
  try {
    const tarballs = await packPackages(
      [join(import.meta.dir, "..")],
      join(directory, "tarballs"),
    );
    const consumer = join(directory, "consumer");
    await installPackedConsumer(
      join(import.meta.dir, "fixtures", "canonical-packed-consumer"),
      consumer,
      tarballs,
    );
    await mkdir(join(consumer, "seed-content"));
    await writeFile(
      join(consumer, "seed-content", "README.md"),
      "# Packed consumer\n",
    );
    await writeFile(
      join(consumer, "brain.yaml"),
      `brain: brain\nbundleContract: capability-bundles-v1\nanchor: person\nkind: professional\nbundles: [core, media, web, chat]\nplugins:\n  directory-sync:\n    seedContentPath: ./seed-content\n`,
    );
    const env = {
      ...process.env,
      AI_API_KEY: "packed-grouping-check",
      GIT_SYNC_TOKEN: "packed-grouping-check",
      BRAIN_SKIP_LOCAL_REEXEC: "1",
    };
    await runCommand(["bun", "run", "import-smoke.ts"], consumer, { env });
    await runCommand(
      ["bun", "run", "brain", "start", "--startup-check"],
      consumer,
      { env, timeoutMs: 90_000 },
    );
    const tool = async (
      name: string,
      input: Record<string, unknown>,
      confirm = false,
    ): Promise<string> =>
      (
        await runCommand(
          [
            "bun",
            "run",
            "brain",
            "tool",
            name,
            JSON.stringify(input),
            ...(confirm ? ["--yes"] : []),
          ],
          consumer,
          { env, timeoutMs: 90_000 },
        )
      ).stdout;
    await tool(
      "system_create",
      {
        entityType: "grouping-definitions",
        // The create tool derives an ID from title; this singleton fixes it.
        title: "Grouping definitions",
        source: {
          kind: "text",
          content:
            "---\nvisibility: shared\ngroupings:\n  clients:\n    label: Clients\n    multiple: true\n  projects:\n    label: Projects\n    multiple: true\n---\n",
        },
      },
      true,
    );
    const created = await tool(
      "system_create",
      {
        entityType: "note",
        title: "Packed Member",
        source: {
          kind: "text",
          content:
            "---\nclients: [Acme]\nprojects: [Launch]\nunclaimed: null\n---\n\n# Packed Member\n\nBody",
        },
      },
      true,
    );
    expect(created).toContain("packed-member");
    const previewProcess = startCommand(
      [
        "bun",
        "run",
        "brain",
        "tool",
        "system_update",
        JSON.stringify({
          entityType: "note",
          id: "packed-member",
          fields: { clients: ["Beta"] },
        }),
      ],
      consumer,
      { env },
    );
    const { stdout: preview, exitCode } = await previewProcess.completed;
    expect(exitCode).toBe(1);
    expect(preview).toContain('clients: ["Acme"] → ["Beta"]');
    expect(preview).toContain("Confirmation needed");
    const updated = await tool(
      "system_update",
      {
        entityType: "note",
        id: "packed-member",
        fields: { clients: ["Beta"] },
      },
      true,
    );
    expect(updated).toContain('"updated": "packed-member"');
    const saved = await tool("system_get", {
      entityType: "note",
      id: "packed-member",
    });
    expect(saved).toContain("clients:");
    expect(saved).toContain("Beta");
    expect(saved).toContain("Launch");
    expect(saved).toContain("unclaimed: null");
    expect(saved).not.toContain("Acme");
    await tool(
      "system_update",
      { entityType: "note", id: "packed-member", fields: { clients: null } },
      true,
    );
    const removed = await tool("system_get", {
      entityType: "note",
      id: "packed-member",
    });
    expect(removed).not.toContain("clients:");
    expect(removed).toContain("Launch");
    const fieldsOnly = await startCommand(
      [
        "bun",
        "run",
        "brain",
        "tool",
        "system_update",
        JSON.stringify({
          entityType: "grouping-definitions",
          id: "grouping-definitions",
          fields: { groupings: {} },
        }),
        "--yes",
      ],
      consumer,
      { env },
    ).completed;
    expect(fieldsOnly.exitCode).toBe(1);
    expect(fieldsOnly.stdout + fieldsOnly.stderr).toContain(
      "does not persist groupings through 'fields'",
    );
    const unchangedDefinitions = await tool("system_get", {
      entityType: "grouping-definitions",
      id: "grouping-definitions",
    });
    expect(unchangedDefinitions).toContain("clients:");
    expect(unchangedDefinitions).toContain("projects:");

    await tool(
      "system_update",
      {
        entityType: "grouping-definitions",
        id: "grouping-definitions",
        content:
          "---\nvisibility: shared\ngroupings:\n  clients:\n    label: Clients\n    multiple: false\n    values: [Acme, Beta]\n  projects:\n    label: Projects\n    multiple: true\n---\n",
      },
      true,
    );
    const closedDefinitions = await tool("system_get", {
      entityType: "grouping-definitions",
      id: "grouping-definitions",
    });
    expect(closedDefinitions).toContain("multiple: false");
    expect(closedDefinitions).toContain("values:");
    const systemCreated = await tool(
      "system_create",
      {
        entityType: "prompt",
        title: "Packed Instructions",
        source: {
          kind: "text",
          content:
            '---\ntitle: Packed Instructions\ntarget: note:test\nclients: [" Ka21, exact ", " Ka21, exact ", Stray]\n---\n\nInstructions.',
        },
      },
      true,
    );
    expect(systemCreated).toContain("packed-instructions");
    const systemSaved = await tool("system_get", {
      entityType: "prompt",
      id: "packed-instructions",
    });
    expect(systemSaved.match(/ Ka21, exact /g)).toHaveLength(2);
    expect(systemSaved).toContain("Stray");
    const refused = startCommand(
      [
        "bun",
        "run",
        "brain",
        "tool",
        "system_update",
        JSON.stringify({
          entityType: "note",
          id: "packed-member",
          fields: { clients: ["Gamma"] },
        }),
        "--yes",
      ],
      consumer,
      { env },
    );
    const refusal = await refused.completed;
    expect(refusal.exitCode).toBe(1);
    expect(refusal.stdout + refusal.stderr).toContain(
      "choose values from the configured list",
    );
    const afterRefusal = await tool("system_get", {
      entityType: "note",
      id: "packed-member",
    });
    expect(afterRefusal).not.toContain("Gamma");
    const allowed = await tool(
      "system_update",
      {
        entityType: "note",
        id: "packed-member",
        fields: { clients: ["Beta"] },
      },
      true,
    );
    expect(allowed).toContain('"updated": "packed-member"');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 180_000);
