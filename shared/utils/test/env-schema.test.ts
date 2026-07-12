import { describe, expect, it } from "bun:test";
import {
  ENV_SCHEMA_HEADER,
  renderEnvSchemaSection,
  type EnvVarDecl,
} from "../src/env-schema";

describe("renderEnvSchemaSection", () => {
  it("renders description, annotations, and assignment like the operator templates", () => {
    const decls: EnvVarDecl[] = [
      {
        name: "AI_API_KEY",
        required: true,
        sensitive: true,
        description: "AI provider",
      },
      {
        name: "AI_IMAGE_KEY",
        sensitive: true,
        description:
          "Optional: separate key for image generation (defaults to AI_API_KEY)",
      },
    ];

    expect(renderEnvSchemaSection(decls)).toBe(
      [
        "# AI provider",
        "# @required @sensitive",
        "AI_API_KEY=",
        "",
        "# Optional: separate key for image generation (defaults to AI_API_KEY)",
        "# @sensitive",
        "AI_IMAGE_KEY=",
      ].join("\n"),
    );
  });

  it("omits missing description and annotation lines", () => {
    expect(
      renderEnvSchemaSection([{ name: "CLOUDFLARE_ANALYTICS_SITE_TAG" }]),
    ).toBe("CLOUDFLARE_ANALYTICS_SITE_TAG=");
    expect(
      renderEnvSchemaSection([{ name: "SETUP_EMAIL_TO", required: true }]),
    ).toBe(["# @required", "SETUP_EMAIL_TO="].join("\n"));
  });

  it("exposes the varlock header used at the top of every schema", () => {
    expect(ENV_SCHEMA_HEADER).toBe(
      [
        "# This env file uses @env-spec - see https://varlock.dev/env-spec for more info",
        "#",
        "# @defaultRequired=false @defaultSensitive=false",
        "# ----------",
      ].join("\n"),
    );
  });
});
