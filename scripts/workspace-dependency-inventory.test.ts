import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import {
  externalImports,
  importFollowedByImportMeta,
  importsInsideTemplate,
  importsInComments,
  importsInsideStrings,
  realImports,
} from "./workspace-dependency-inventory.fixtures";
import {
  findUndeclaredWorkspaceImports,
  workspaceImportsInSource,
} from "./workspace-dependency-inventory";

const repositoryRoot = join(import.meta.dir, "..");

describe("workspace import scanning", () => {
  test("finds static, bare, dynamic and subpath imports", () => {
    expect(workspaceImportsInSource(realImports)).toEqual([
      "@brains/alpha",
      "@brains/beta",
      "@brains/delta",
      "@brains/epsilon",
      "@brains/zeta",
      "@rizom/gamma",
    ]);
  });

  test("ignores import statements inside string literals", () => {
    expect(workspaceImportsInSource(importsInsideStrings)).toEqual([]);
  });

  test("ignores imports in comments", () => {
    expect(workspaceImportsInSource(importsInComments)).toEqual([
      "@brains/kept",
    ]);
  });

  test("ignores generated code inside a template literal", () => {
    expect(workspaceImportsInSource(importsInsideTemplate)).toEqual([
      "@brains/kept",
    ]);
  });

  test("stops at the end of the import statement it started in", () => {
    expect(workspaceImportsInSource(importFollowedByImportMeta)).toEqual([
      "@brains/first",
    ]);
  });

  test("ignores packages outside the workspace scopes", () => {
    expect(workspaceImportsInSource(externalImports)).toEqual([]);
  });
});

describe("workspace dependency declarations", () => {
  test("every package declares the workspace packages it imports", async () => {
    const findings = await findUndeclaredWorkspaceImports(repositoryRoot);

    expect(
      findings
        .filter(({ kind }) => kind === "undeclared")
        .map(
          ({ package: name, missing, section }) =>
            `${name} -> ${missing} (${section})`,
        ),
    ).toEqual([]);
  });

  test("the only imports that cannot be declared are the test-utils loop", async () => {
    // `@brains/test-utils` depends on twenty packages and is imported by the
    // tests of several of them. Declaring it there closes a loop that turbo
    // refuses to build, so those imports rely on hoisting and have to until
    // test-utils stops depending on what it mocks.
    //
    // Asserted rather than ignored: a second package growing this problem
    // shows up here instead of being absorbed into an exception.
    const findings = await findUndeclaredWorkspaceImports(repositoryRoot);
    const cannotDeclare = findings.filter(({ kind }) => kind === "would-cycle");

    expect([...new Set(cannotDeclare.map(({ missing }) => missing))]).toEqual([
      "@brains/test-utils",
    ]);
  });
});
