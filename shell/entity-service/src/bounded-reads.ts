import {
  entityReadBudgetSchema,
  type EntityReadBudget,
} from "@brains/contracts";
import { sql, type SQL } from "drizzle-orm";
import { entities } from "./schema/entities";

/** Filter before driver JSON decoding and adapter reconstruction. Counts
 * UTF-8 storage bytes, including identifiers/metadata and both integer columns.
 * SQLite's own scans/allocations and adapter execution need separate work bounds.
 */
export function entityRowBudgetCondition(budget: EntityReadBudget): SQL {
  const { rowBytes } = entityReadBudgetSchema.parse(budget);
  return sql`typeof(${entities.created}) = 'integer' AND typeof(${entities.updated}) = 'integer' AND (length(cast(${entities.id} as blob)) + length(cast(${entities.entityType} as blob)) + length(cast(${entities.content} as blob)) + length(cast(${entities.contentHash} as blob)) + length(cast(${entities.metadata} as blob)) + length(cast(${entities.visibility} as blob)) + 16) <= ${rowBytes}`;
}
