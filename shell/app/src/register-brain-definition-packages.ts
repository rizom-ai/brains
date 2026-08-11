import { isPluginPackageDefinition } from "@brains/plugins";
import {
  resolveBrainDefinitionDependencies,
  resolveInstalledPackageManifest,
} from "./installed-package-metadata";
import { registerPackage } from "./package-registry";

export type InstalledPackageImport = (
  packageName: string,
) => Promise<Record<string, unknown>>;

const defaultImport: InstalledPackageImport = async (packageName) =>
  import(packageName);

export async function registerBrainDefinitionPackages(
  packageName: string,
  definition: object,
  fromDirectory: string,
  importPackage: InstalledPackageImport = defaultImport,
): Promise<void> {
  const manifest = resolveInstalledPackageManifest(packageName, fromDirectory);
  registerPackage(manifest.name, definition, { version: manifest.version });

  const dependencies = resolveBrainDefinitionDependencies(
    packageName,
    fromDirectory,
  );
  await Promise.all(
    dependencies.map(async (dependency) => {
      const module = await importPackage(dependency.name);
      const defaultExport = module["default"];
      if (
        defaultExport === undefined &&
        Object.values(module).some(isPluginPackageDefinition)
      ) {
        throw new Error(
          `Plugin package "${dependency.name}" must default-export its declarative package definition; named alpha exports are not supported`,
        );
      }
      registerPackage(dependency.name, defaultExport ?? module, {
        version: dependency.version,
      });
    }),
  );
}
