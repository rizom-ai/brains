import { z } from "@rizom/site";

/**
 * A `{ label, href }` link: the schema every CTA field reuses. The explicit
 * annotation is required because `--isolatedDeclarations` cannot infer an
 * exported const's type from `z.object(...)`.
 */
export const ctaSchema: z.ZodObject<{
  label: z.ZodString;
  href: z.ZodString;
}> = z.object({
  label: z.string(),
  href: z.string(),
});
