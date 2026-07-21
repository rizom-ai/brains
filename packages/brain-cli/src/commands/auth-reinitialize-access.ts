import { resolve } from "node:path";
import { reinitializeAuthAccessStorage } from "@brains/auth-service";
import type { BrainDefinition } from "@brains/app";
import { parseBrainYaml } from "../lib/brain-yaml";
import type { CommandResult } from "../lib/command-result";
import { getModel } from "../lib/model-registry";

export interface AuthReinitializeAccessOptions {
  storageDir?: string | undefined;
  yes?: boolean | undefined;
}

/** Reapply exact access grants from brain.yaml without wiping durable auth. */
export async function reinitializeAuthAccess(
  cwd: string,
  options: AuthReinitializeAccessOptions = {},
): Promise<CommandResult> {
  if (!options.yes) {
    return {
      success: false,
      message:
        "Refusing to reinitialize access without --yes. This replaces exact grants and Anchor bindings from brain.yaml and revokes active sessions.",
    };
  }

  const storageDir = resolve(cwd, options.storageDir ?? "./data/auth");
  if (isBrainDataPath(storageDir)) {
    return {
      success: false,
      message:
        "Refusing to modify auth state under brain-data. Auth storage must live outside content/brain-data.",
    };
  }

  try {
    const config = readConfiguredPrincipals(cwd);
    const result = await reinitializeAuthAccessStorage(storageDir, config);
    return {
      success: true,
      message: `Access reinitialized in ${storageDir}: ${result.state.grants.length} exact grants, ${result.state.anchors.length} Anchor bindings, and ${result.revokedSessions} sessions revoked. Restart the brain to load the new access projection.`,
    };
  } catch (error) {
    return {
      success: false,
      message: `Failed to reinitialize access: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

function readConfiguredPrincipals(cwd: string): {
  admins: string[];
  trusted: string[];
  anchors: string[];
} {
  const yaml = parseBrainYaml(cwd);
  const definition = getModel(yaml.brain) as BrainDefinition | undefined;
  const defaults = definition?.permissions;
  const nested = isRecord(yaml["permissions"])
    ? yaml["permissions"]
    : undefined;
  return {
    admins:
      readOptionalStringArray(nested?.["admins"], "permissions.admins") ??
      readOptionalStringArray(yaml["admins"], "admins") ??
      defaults?.admins ??
      [],
    trusted:
      readOptionalStringArray(nested?.["trusted"], "permissions.trusted") ??
      readOptionalStringArray(yaml["trusted"], "trusted") ??
      defaults?.trusted ??
      [],
    anchors:
      readOptionalStringArray(nested?.["anchors"], "permissions.anchors") ??
      readOptionalStringArray(yaml["anchors"], "anchors") ??
      defaults?.anchors ??
      [],
  };
}

function readOptionalStringArray(
  value: unknown,
  path: string,
): string[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (
    !Array.isArray(value) ||
    value.some((entry) => typeof entry !== "string")
  ) {
    throw new Error(`${path} must be an array of interface principals`);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isBrainDataPath(path: string): boolean {
  return path.split(/[\\/]+/).includes("brain-data");
}
