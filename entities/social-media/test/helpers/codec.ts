import {
  bindPluginPackageMetadata,
  instantiatePluginPackageDefinition,
  type BaseEntity,
  type EntityAdapter,
} from "@brains/plugins";
import { createPluginHarness } from "@brains/plugins/test";
import { createSilentLogger } from "@brains/test-utils";
import socialMediaPackage from "../../src";
import packageJson from "../../package.json";

/**
 * The adapter the registry hands out for `social-post`.
 *
 * Built from the entity's `markdown` codec. Tests that used to call
 * SocialPostAdapter's own toMarkdown/fromMarkdown assert against this
 * instead: those methods stopped running when the package converted.
 */
export async function postCodec(): Promise<{
  adapter: EntityAdapter<BaseEntity>;
  reset: () => void;
}> {
  const metadata = { name: packageJson.name, version: packageJson.version };
  bindPluginPackageMetadata(socialMediaPackage, metadata);
  const plugin = instantiatePluginPackageDefinition(
    socialMediaPackage,
    {},
    metadata,
  ).find(({ type }) => type === "entity");
  if (!plugin) throw new Error("Social post entity plugin was not created");

  const harness = createPluginHarness({
    logger: createSilentLogger("social-post-codec"),
  });
  await harness.installPlugin(plugin);
  return {
    adapter: harness.getEntityRegistry().getAdapter<BaseEntity>("social-post"),
    reset: (): void => {
      harness.reset();
    },
  };
}
