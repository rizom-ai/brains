import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { execSync } from "child_process";
import type { CommandResult } from "../run-command";

interface PinPackageJson {
  name: string;
  private: boolean;
  dependencies: Record<string, string>;
}

/**
 * Generate a package.json that pins @rizom/brain to a specific version.
 */
export function generatePinPackageJson(version: string): PinPackageJson {
  return {
    name: "brain-instance",
    private: true,
    dependencies: {
      "@rizom/brain": version,
    },
  };
}

/**
 * Pin the current @rizom/brain version by creating package.json and installing.
 *
 * This locks the brain instance to a specific version. When a local
 * @rizom/brain is detected, the global CLI re-execs with the local copy.
 */
export function pin(cwd: string): CommandResult {
  const pkgPath = join(cwd, "package.json");

  if (existsSync(pkgPath)) {
    return {
      success: false,
      message:
        "package.json already exists. Edit it manually to change the pinned version.",
    };
  }

  if (!existsSync(join(cwd, "brain.yaml"))) {
    return {
      success: false,
      message: `No brain.yaml found in ${cwd}. Run 'brain init <dir>' first.`,
    };
  }

  // Read current version from our own package
  let version = "0.1.0";
  try {
    const selfPkg = join(__dirname, "..", "..", "package.json");
    if (existsSync(selfPkg)) {
      const pkg = JSON.parse(readFileSync(selfPkg, "utf-8")) as {
        version?: string;
      };
      if (pkg.version) version = pkg.version;
    }
  } catch {
    // Fall back to hardcoded version
  }

  const pkg = generatePinPackageJson(version);
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");

  // Install
  try {
    execSync("bun install", { cwd, stdio: "inherit" });
  } catch {
    return {
      success: false,
      message:
        "Created package.json but 'bun install' failed. Run it manually.",
    };
  }

  return {
    success: true,
    message: `Pinned @rizom/brain@${version}. Local version will be used on next 'brain start'.`,
  };
}
