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

  test("no import is one a manifest could not declare", async () => {
    // A `would-cycle` finding is an import that cannot be honestly declared:
    // the package it reaches for already depends on the package reaching, so
    // adding the entry closes a loop turbo refuses to schedule. Such an import
    // works only because the package manager hoists workspace packages to the
    // root, and no manifest edit can fix it — the packages have to move.
    //
    // `@brains/test-utils` used to be the whole of this list. It mocked every
    // shell service, so it depended on every shell service, and the tests of
    // those services imported it back. Each service now owns the mock of its
    // own interface — `@brains/entity-service/test` and the rest — leaving
    // test-utils a leaf on `@brains/utils` that anything may declare.
    const findings = await findUndeclaredWorkspaceImports(repositoryRoot);

    expect(
      findings
        .filter(({ kind }) => kind === "would-cycle")
        .map(({ package: name, missing }) => `${name} -> ${missing}`),
    ).toEqual([]);
  });
});
