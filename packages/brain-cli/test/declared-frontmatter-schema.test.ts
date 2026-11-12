import { describe, expect, it } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { syncObsidianVault } from "@brains/obsidian-vault";
import { EntityPlugin, type BaseEntity, type Plugin } from "@brains/plugins";
import { createMockShell } from "@brains/plugins/test";
import { zodFieldToStudioWidget } from "@brains/studio";
import { createSilentLogger } from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import { canonicalBrain } from "../src/model/canonical-brain";

/**
 * Every declared entity type on the canonical brain reports the frontmatter
 * schema its entity plugin class declared, as JSON Schema captured from the
 * class at the commit before its conversion
 * (fixtures/class-frontmatter.json): what Studio's editor, the Obsidian
 * vault's templates and fileClasses, and frontmatter extensions read as the
 * type's frontmatter. For post and playbook, the vault files and Studio's
 * editor fields are those the classes produced.
 */

const fixtureSchema = z.object({
  schemas: z.record(z.string(), z.unknown()),
  obsidian: z.record(
    z.string(),
    z.object({
      fileClass: z.string(),
      template: z.string(),
      studioFields: z.array(z.unknown()),
    }),
  ),
});
const classes = fixtureSchema.parse(
  JSON.parse(
    await readFile(
      join(import.meta.dir, "fixtures", "class-frontmatter.json"),
      "utf8",
    ),
  ),
);

type DeclaredEntityPlugin = EntityPlugin<
  BaseEntity,
  Record<string, never>,
  Record<string, never>
>;

/** The canonical brain's declared entity plugins, by their type. */
function declaredEntityPlugins(): Map<string, DeclaredEntityPlugin> {
  const byType = new Map<string, DeclaredEntityPlugin>();
  for (const [, factory, defaults] of canonicalBrain.capabilities) {
    let plugins: Plugin | Plugin[];
    try {
      plugins = factory(typeof defaults === "function" ? {} : (defaults ?? {}));
    } catch {
      // A capability whose defaults need a deployment's config declares no
      // entity type this test reads.
      continue;
    }
    for (const plugin of [plugins].flat()) {
      if (
        plugin instanceof EntityPlugin &&
        plugin.constructor.name === "DeclarativeEntityPlugin"
      )
        byType.set(plugin.entityType, plugin);
    }
  }
  return byType;
}

function jsonSchemaOf(schema: z.ZodType | undefined): unknown {
  if (!schema) return null;
  const { $schema: _dialect, ...json } = z.toJSONSchema(schema, {
    unrepresentable: "any",
    io: "input",
  });
  return json;
}

describe("a declared type's frontmatter, as its class declared it", () => {
  it("is the class's frontmatter schema for every declared type", () => {
    const declared = declaredEntityPlugins();
    expect([...declared.keys()].sort()).toEqual(
      Object.keys(classes.schemas).sort(),
    );
    for (const [type, plugin] of declared) {
      expect({
        type,
        schema: jsonSchemaOf(plugin.adapter.frontmatterSchema),
      }).toEqual({
        type,
        schema: classes.schemas[type],
      });
    }
  });

  it("writes the post and playbook vault files and Studio fields the classes did", async () => {
    const declared = declaredEntityPlugins();
    const shell = createMockShell();
    for (const type of ["post", "playbook"]) {
      const plugin = declared.get(type);
      if (!plugin) throw new Error(`No declared ${type}`);
      await plugin.register(shell);
    }
    const registry = shell.getEntityRegistry();
    const written = new Map<string, string>();
    syncObsidianVault({
      shapes: {
        types: () => ["post", "playbook"],
        frontmatterSchema: (type) =>
          registry.getEffectiveFrontmatterSchema(type),
        isSingleton: (type) => registry.getAdapter(type).isSingleton === true,
        bodyTemplate: (type) => registry.getAdapter(type).getBodyTemplate(),
      },
      dataDir: "/vault",
      config: { baseFolder: "_obsidian" },
      deps: {
        mkdir: (): void => {},
        writeFile: (path: string, content: string): void => {
          written.set(path, content);
        },
        existsFile: (): boolean => false,
        readFile: (): string => "",
        removeFile: (): void => {},
        renameFile: (): void => {},
      },
      logger: createSilentLogger(),
    });
    for (const type of ["post", "playbook"]) {
      const expected = classes.obsidian[type];
      if (!expected) throw new Error(`No captured ${type}`);
      expect(written.get(`/vault/_obsidian/fileClasses/${type}.md`)).toBe(
        expected.fileClass,
      );
      expect(written.get(`/vault/_obsidian/templates/${type}.md`)).toBe(
        expected.template,
      );
      const schema = registry.getEffectiveFrontmatterSchema(type);
      if (!schema) throw new Error(`No frontmatter for ${type}`);
      const fields: unknown = Object.keys(schema.shape).map((name) =>
        zodFieldToStudioWidget(name, schema.shape[name]),
      );
      expect(fields).toEqual(expected.studioFields);
    }
    // A playbook's status, audience and completion mode are optional again,
    // with the defaults the class gave them.
    const playbook = registry.getEffectiveFrontmatterSchema("playbook");
    if (!playbook) throw new Error("No playbook frontmatter");
    for (const [name, value] of [
      ["status", "active"],
      ["audience", "admin"],
      ["completionMode", "agent-confirmed"],
    ] as const) {
      expect(zodFieldToStudioWidget(name, playbook.shape[name])).toMatchObject({
        required: false,
        default: value,
      });
    }
  });
});
