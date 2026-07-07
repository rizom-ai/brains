/**
 * Env Schema Declarations
 *
 * The declaration shape each shell service uses to describe the env vars
 * it consumes, plus the renderer that turns declarations into the
 * varlock-flavored `.env.schema` sections operators receive. Services
 * declare vars next to the code that reads them; `@brains/core`
 * aggregates the declarations; the sync script writes the rendered
 * section into each brain's `env.schema.template`.
 */

export interface EnvVarDecl {
  name: string;
  required?: boolean;
  sensitive?: boolean;
  /** Rendered as a comment line above the variable. */
  description?: string;
}

/** The varlock header at the top of every generated `.env.schema`. */
export const ENV_SCHEMA_HEADER = [
  "# This env file uses @env-spec - see https://varlock.dev/env-spec for more info",
  "#",
  "# @defaultRequired=false @defaultSensitive=false",
  "# ----------",
].join("\n");

/**
 * Markers delimiting the generated shell-owned block inside each brain's
 * `env.schema.template`. `scripts/sync-env-templates.ts` owns the content
 * between them; everything outside stays hand-maintained.
 */
export const SHELL_ENV_SECTION_START =
  "# ---- shell-owned env (generated; edit the owning service's env-schema.ts) ----";
export const SHELL_ENV_SECTION_END = "# ---- end shell-owned env ----";

/** Replace the marker-delimited block in a template with `section`. */
export function replaceShellEnvSection(
  template: string,
  section: string,
): string {
  const startIndex = template.indexOf(SHELL_ENV_SECTION_START);
  const endIndex = template.indexOf(SHELL_ENV_SECTION_END);
  if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) {
    throw new Error("Template is missing the shell-owned env section markers");
  }
  return (
    template.slice(0, startIndex + SHELL_ENV_SECTION_START.length) +
    `\n${section}\n` +
    template.slice(endIndex)
  );
}

export function renderEnvSchemaSection(decls: EnvVarDecl[]): string {
  return decls.map(renderDecl).join("\n\n");
}

function renderDecl(decl: EnvVarDecl): string {
  const annotations = [
    ...(decl.required ? ["@required"] : []),
    ...(decl.sensitive ? ["@sensitive"] : []),
  ];
  return [
    ...(decl.description ? [`# ${decl.description}`] : []),
    ...(annotations.length > 0 ? [`# ${annotations.join(" ")}`] : []),
    `${decl.name}=`,
  ].join("\n");
}
