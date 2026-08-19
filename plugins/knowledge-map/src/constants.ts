/**
 * The site datasource id, and so the scope of the template that reads it.
 *
 * Was `topics:knowledge-map` while this lived in the topics package. The map
 * projects every entity type, not topics, so it moved — and the id moved with
 * it. `sites/rizom-ai` names the template in its routes.
 */
export const KNOWLEDGE_MAP_DATASOURCE_ID = "knowledge-map:map";
