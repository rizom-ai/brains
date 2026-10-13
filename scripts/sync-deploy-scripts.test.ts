import { describe, expect, it } from "bun:test";
import {
  DEPLOY_SCRIPT_TEMPLATES,
  TEMPLATE_OWNED,
  compareDeployScripts,
  type DeployScriptSource,
} from "./sync-deploy-scripts";

function source(
  canonical: Record<string, string>,
  templates: Record<string, Record<string, string>>,
): DeployScriptSource {
  return {
    readCanonical: (name) => canonical[name],
    listCanonical: () => Object.keys(canonical),
    readTemplate: (dir, name) => templates[dir]?.[name],
    listTemplate: (dir) => Object.keys(templates[dir] ?? {}),
  };
}

describe("compareDeployScripts", () => {
  it("finds nothing to do when every shared copy matches", () => {
    const result = compareDeployScripts(
      source(
        { "provision-server.ts": "A" },
        { "template-a": { "provision-server.ts": "A" } },
      ),
      ["template-a"],
    );

    expect(result.stale).toEqual([]);
  });

  it("reports a copy that has drifted from the canonical script", () => {
    const result = compareDeployScripts(
      source(
        { "provision-server.ts": "A" },
        { "template-a": { "provision-server.ts": "DRIFTED" } },
      ),
      ["template-a"],
    );

    expect(result.stale).toEqual([
      { template: "template-a", name: "provision-server.ts", content: "A" },
    ]);
  });

  it("leaves a template alone for a script it does not ship", () => {
    const result = compareDeployScripts(
      source(
        { "provision-server.ts": "A", "write-kamal-secrets.ts": "B" },
        { "template-a": { "provision-server.ts": "A" } },
      ),
      ["template-a"],
    );

    // Not every template deploys every capability; absence is a choice, and
    // this check is about copies drifting, not about completeness.
    expect(result.stale).toEqual([]);
  });

  it("ignores a script the template owns outright", () => {
    const result = compareDeployScripts(
      source(
        { "provision-server.ts": "A" },
        {
          "template-a": {
            "provision-server.ts": "A",
            "resolve-user-config.ts": "template only",
          },
        },
      ),
      ["template-a"],
    );

    expect(result.stale).toEqual([]);
  });

  it("exempts the helpers shim, which binds each template to its own package", () => {
    const result = compareDeployScripts(
      source(
        { "helpers.ts": 'export * from "@brains/deploy-support";' },
        {
          "template-a": { "helpers.ts": 'export * from "@rizom/ops/deploy";' },
        },
      ),
      ["template-a"],
    );

    expect(TEMPLATE_OWNED).toContain("helpers.ts");
    expect(result.stale).toEqual([]);
  });

  it("checks every template a script is copied into", () => {
    const result = compareDeployScripts(
      source(
        { "update-dns.ts": "A" },
        {
          "template-a": { "update-dns.ts": "A" },
          "template-b": { "update-dns.ts": "DRIFTED" },
        },
      ),
      ["template-a", "template-b"],
    );

    expect(result.stale.map((entry) => entry.template)).toEqual(["template-b"]);
  });
});

describe("the repository's own deploy scripts", () => {
  it("has every copied script in sync with its canonical source", () => {
    const result = compareDeployScripts(undefined, DEPLOY_SCRIPT_TEMPLATES);

    expect(
      result.stale.map((entry) => `${entry.template}/${entry.name}`),
    ).toEqual([]);
  });

  it("copies at least the scripts this check exists to protect", () => {
    const result = compareDeployScripts(undefined, DEPLOY_SCRIPT_TEMPLATES);

    // A silent drop to zero comparisons would make the gate pass for the wrong
    // reason, so the check asserts it is actually looking at something.
    expect(result.compared).toBeGreaterThanOrEqual(7);
  });
});
