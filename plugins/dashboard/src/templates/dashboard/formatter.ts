import type { ContentFormatter } from "@brains/plugins";
import type { DashboardData } from "./schema";

/**
 * Dashboard formatter - converts dashboard data to/from string format
 */
export class DashboardFormatter implements ContentFormatter<DashboardData> {
  format(data: DashboardData): string {
    return JSON.stringify(data, null, 2);
  }

  parse(content: string): DashboardData {
    return JSON.parse(content) as DashboardData;
  }
}
