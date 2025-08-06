import type { ContentFormatter } from "@brains/plugins";
import type { DashboardData } from "../templates/dashboard/schema";

/**
 * Dashboard formatter - for static data generation
 * This is a simplified version that returns mock data for the proof of concept
 */
export class DashboardFormatter implements ContentFormatter<DashboardData> {
  /**
   * Format dashboard data as a string
   */
  format(data: DashboardData): string {
    // Format as YAML-like content
    const lines = ["# Dashboard Data", ""];

    lines.push("entityStats:");
    for (const stat of data.entityStats) {
      lines.push(`  - type: ${stat.type}`);
      lines.push(`    count: ${stat.count}`);
    }

    lines.push("");
    lines.push("recentEntities:");
    for (const entity of data.recentEntities) {
      lines.push(`  - id: ${entity.id}`);
      lines.push(`    type: ${entity.type}`);
      lines.push(`    title: ${entity.title}`);
      lines.push(`    created: ${entity.created}`);
    }

    lines.push("");
    lines.push("buildInfo:");
    lines.push(`  timestamp: ${data.buildInfo.timestamp}`);
    lines.push(`  version: ${data.buildInfo.version}`);

    return lines.join("\n");
  }

  /**
   * Parse dashboard data from string
   */
  parse(_content: string): DashboardData {
    // For now, return mock data
    // In a real implementation, this would parse the YAML content
    return this.getMockData();
  }

  /**
   * Get mock dashboard data for proof of concept
   */
  getMockData(): DashboardData {
    return {
      entityStats: [
        { type: "note", count: 42 },
        { type: "task", count: 17 },
        { type: "profile", count: 5 },
        { type: "project", count: 3 },
      ],
      recentEntities: [
        {
          id: "1",
          type: "note",
          title: "Meeting Notes - Q4 Planning",
          created: new Date(Date.now() - 3600000).toISOString(),
        },
        {
          id: "2",
          type: "task",
          title: "Review pull request #123",
          created: new Date(Date.now() - 7200000).toISOString(),
        },
        {
          id: "3",
          type: "note",
          title: "Architecture refactoring ideas",
          created: new Date(Date.now() - 86400000).toISOString(),
        },
      ],
      buildInfo: {
        timestamp: new Date().toISOString(),
        version: "1.0.0",
      },
    };
  }
}
