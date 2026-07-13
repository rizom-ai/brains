import { z } from "zod/v4";
import type {
  ComponentType,
  SiteSectionGroup,
  UserPermissionLevel,
} from "@rizom/site";

/**
 * Schema-first content sections for Rizom site packages.
 *
 * A section is authored from a single zod schema: the component's props are
 * `z.infer<typeof schema>`, so the shape is defined once and the component
 * fails to typecheck if it diverges. The brain-side half
 * (`@brains/site-composition`) derives the CMS field metadata and the markdown
 * formatter from the same schema by introspection, so there is no parallel
 * hand-written field DSL to keep in sync.
 *
 * Uses `@rizom/site`'s `ComponentType` (a preact function component typed for
 * bivariant props) so sections drop straight into the site-builder's layout
 * slot, exactly like the field-DSL `layout` they replace.
 */

export { z };
export type { ComponentType, UserPermissionLevel } from "@rizom/site";

export interface SectionMeta {
  /** Human title, used as the content entity's markdown H1. */
  title: string;
  description: string;
  requiredPermission?: UserPermissionLevel;
  fullscreen?: boolean;
}

/**
 * A content section: one zod schema, the component it feeds, and metadata. The
 * default type parameter collapses `component` to `ComponentType<unknown>`, so
 * a `Record<string, SectionDefinition>` holds heterogeneous sections without a
 * separate erased type.
 */
export interface SectionDefinition<
  S extends z.ZodType = z.ZodType,
> extends SectionMeta {
  schema: S;
  component: ComponentType<z.infer<S>>;
}

/**
 * Define a section from a schema + a component whose props are `z.infer` of
 * that schema. Passing a component with mismatched props is a type error.
 */
export function defineSection<S extends z.ZodType>(
  schema: S,
  component: ComponentType<z.infer<S>>,
  meta: SectionMeta,
): SectionDefinition<S> {
  return { schema, component, ...meta };
}

/**
 * A namespace of sections — stored/synced under `site-content/<namespace>/`.
 * Returns the base SDK's `SiteSectionGroup` so it drops straight into
 * `SiteDefinition.sections`; the per-section prop tie is already enforced by
 * `defineSection`.
 */
export type { SiteSectionGroup as SectionGroup } from "@rizom/site";

export function sectionGroup(
  namespace: string,
  sections: Record<string, SectionDefinition>,
): SiteSectionGroup {
  return { namespace, sections };
}
