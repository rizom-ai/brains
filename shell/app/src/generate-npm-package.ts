/**
 * Generate a publish-ready package.json for a brain model npm package.
 *
 * Native deps are optionalDependencies — npm/bun installs the right
 * platform-specific binary automatically.
 */

interface NpmPackageJson {
  name: string;
  version: string;
  type: string;
  bin: Record<string, string>;
  exports: Record<string, string>;
  files: string[];
  optionalDependencies: Record<string, string>;
  publishConfig: { access: string };
  license: string;
}

export function generateNpmPackageJson(
  modelName: string,
  version: string,
): NpmPackageJson {
  return {
    name: `@brains/${modelName}`,
    version,
    type: "module",
    bin: {
      [modelName]: "./dist/.model-entrypoint.js",
    },
    exports: {
      ".": "./dist/.model-entrypoint.js",
    },
    files: ["dist", "migrations", "seed-content"],
    optionalDependencies: {
      sharp: "^0.34.5",
      "@libsql/client": "^0.14.0",
      "better-sqlite3": "^11.8.1",
      fastembed: "^1.14.4",
      lightningcss: "^1.29.2",
      "@tailwindcss/oxide": "^4.1.4",
      "react-devtools-core": "^6.1.1",
    },
    publishConfig: {
      access: "public",
    },
    license: "MIT",
  };
}
