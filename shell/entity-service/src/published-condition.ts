import { sql, type SQL } from "drizzle-orm";
import { entities } from "./schema/entities";

const statusExpr = sql`json_extract(${entities.metadata}, '$.status')`;

/**
 * The publish gate for one entity type. A type that declares its published
 * statuses gets exactly those — no status is not published. Any other type
 * keeps the default lifecycle: published, active, or no status at all.
 */
export function publishedStatusCondition(publishedStatuses?: string[]): SQL {
  if (publishedStatuses && publishedStatuses.length > 0) {
    return sql`${statusExpr} IN (${sql.join(
      publishedStatuses.map((status) => sql`${status}`),
      sql`, `,
    )})`;
  }
  return sql`(${statusExpr} = 'published' OR ${statusExpr} = 'active' OR ${statusExpr} IS NULL)`;
}

/**
 * The publish gate across entity types, for queries such as search that span
 * them: each declaring type (`gates`, statuses by type) by its own statuses,
 * every other type by the default lifecycle.
 */
export function publishedAcrossTypesCondition(
  gates: Record<string, string[]>,
): SQL {
  const declared = Object.entries(gates).filter(
    ([, statuses]) => statuses.length > 0,
  );
  if (declared.length === 0) return publishedStatusCondition();
  const byType = declared.map(
    ([entityType, statuses]) =>
      sql`(${entities.entityType} = ${entityType} AND ${publishedStatusCondition(statuses)})`,
  );
  const undeclared = sql`(${entities.entityType} NOT IN (${sql.join(
    declared.map(([entityType]) => sql`${entityType}`),
    sql`, `,
  )}) AND ${publishedStatusCondition()})`;
  return sql`(${sql.join([...byType, undeclared], sql` OR `)})`;
}
