import { EntityPlugin, type BaseEntity } from "@brains/plugins";
import { createFaqPlugins } from "../faq-plugins";

type FaqEntityPlugin = EntityPlugin<
  BaseEntity,
  Record<string, never>,
  Record<string, never>
>;

/**
 * The faq type as the installed package declares it: its schema and its
 * adapter, for a real entity store a test opens itself.
 */
export function faqType(): {
  schema: FaqEntityPlugin["schema"];
  adapter: FaqEntityPlugin["adapter"];
} {
  const plugin = createFaqPlugins().find(
    (candidate): candidate is FaqEntityPlugin =>
      candidate instanceof EntityPlugin,
  );
  if (!plugin) throw new Error("The faq package declares no type");
  return { schema: plugin.schema, adapter: plugin.adapter };
}
