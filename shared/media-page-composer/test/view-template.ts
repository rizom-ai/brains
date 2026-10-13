import { createTemplate, toViewTemplate } from "@brains/plugins";
import type { FormatComponents, ViewTemplate } from "@brains/plugins";
import { z } from "@brains/utils/zod";

/** The view template the shell serves for a `{ title }` template in these formats. */
export function viewTemplate(
  name: string,
  formats: FormatComponents<{ title: string }>,
): ViewTemplate {
  const view = toViewTemplate(
    `test:${name}`,
    createTemplate<{ title: string }>({
      name,
      description: name,
      schema: z.object({ title: z.string() }),
      requiredPermission: "public",
      layout: { formats },
    }),
  );
  if (!view) throw new Error(`${name} renders in no format`);
  return view;
}
