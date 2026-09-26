/**
 * The local data source and template name, which the runtime scopes to the
 * installed package: `@brains/knowledge-map:map`.
 *
 * Was `topics:knowledge-map` while this lived in the topics package, then
 * `knowledge-map:map` while the plugin scoped its own ids. The map projects
 * every entity type, not topics, so it moved — and the id moved with it.
 * `sites/rizom-ai` names the scoped template in its routes.
 */
export const KNOWLEDGE_MAP_LOCAL_ID = "map";

/** The id the runtime registers, and the one a site route names. */
export const KNOWLEDGE_MAP_DATASOURCE_ID = "@brains/knowledge-map:map";
