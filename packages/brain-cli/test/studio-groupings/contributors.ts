import notes from "@brains/note";
import blog from "@brains/blog";
import images from "@brains/image-plugin";
import {
  instantiatePluginPackageDefinition,
  type IShell,
  type Plugin,
} from "@brains/plugins";

/** Install the real declarative packages, not removed adapter/class exports. */
export async function installContributors(
  shell: IShell,
  types: readonly ("note" | "post" | "image")[] = ["note", "post"],
): Promise<() => Promise<void>> {
  const installed: Plugin[] = [];
  const close = async (): Promise<void> => {
    for (const plugin of installed.splice(0).reverse())
      await plugin.shutdown?.();
  };
  try {
    for (const [type, definition, name] of [
      ["note", notes, "@brains/note"],
      ["post", blog, "@brains/blog"],
      ["image", images, "@brains/image-plugin"],
    ] as const) {
      if (!types.includes(type)) continue;
      for (const plugin of instantiatePluginPackageDefinition(
        definition,
        {},
        { name, version: "0.0.0-test" },
      )) {
        installed.push(plugin);
        await plugin.register(shell);
      }
    }
    for (const plugin of installed) await plugin.finalizeRegistration?.();
    return close;
  } catch (error) {
    await close();
    throw error;
  }
}
