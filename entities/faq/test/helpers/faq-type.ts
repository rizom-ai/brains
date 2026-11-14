import { createFaqPlugins } from "../faq-plugins";
import {
  isDeclaredEntityType,
  type DeclaredEntityTypePlugin,
} from "@brains/plugins/test";

type FaqEntityPlugin = DeclaredEntityTypePlugin;

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
      isDeclaredEntityType(candidate),
  );
  if (!plugin) throw new Error("The faq package declares no type");
  return { schema: plugin.schema, adapter: plugin.adapter };
}
