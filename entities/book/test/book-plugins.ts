import {
  instantiatePluginPackageDefinition,
  type DataSource,
  type Plugin,
} from "@brains/plugins";
import type { MockShell } from "@brains/plugins/test";
import { bookPackage } from "../src";
import packageJson from "../package.json";

/**
 * The book package's plugins, as the canonical brain installs them: under
 * the book class's plugin id, its book type apart.
 */
export function createBookPlugins(): Plugin[] {
  return instantiatePluginPackageDefinition(
    bookPackage,
    {},
    { name: packageJson.name, version: packageJson.version },
    { pluginId: "book", ownedTypePluginId: "book-entity" },
  );
}

/** The book package installed on a test shell, as a brain registers it. */
export async function installBook(shell: MockShell): Promise<void> {
  for (const plugin of createBookPlugins()) await plugin.register(shell);
}

/** A data source the book package registered, by its registered id. */
export function bookDataSourceOn(shell: MockShell, id: string): DataSource {
  const source = shell.getDataSourceRegistry().get(id);
  if (!source) throw new Error(`No data source ${id}`);
  return source;
}
