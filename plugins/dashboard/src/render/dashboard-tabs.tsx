/** @jsxImportSource react */
import type { JSX } from "react";

export function TabBar({
  knowledgeCount,
  networkCount,
}: {
  knowledgeCount: number;
  networkCount: number;
}): JSX.Element {
  const tabs = [
    { id: "overview", label: "Overview", count: 0 },
    { id: "knowledge", label: "Knowledge", count: knowledgeCount },
    { id: "network", label: "Network", count: networkCount },
    { id: "system", label: "System", count: 0 },
  ];
  return (
    <nav
      className="dashboard-tabs"
      aria-label="Dashboard sections"
      role="tablist"
    >
      {tabs.map((tab, index) => (
        <a
          id={`dashboard-tab-${tab.id}`}
          className={`dashboard-tab${index === 0 ? " is-active" : ""}`}
          href={`#${tab.id}`}
          role="tab"
          aria-selected={index === 0 ? "true" : "false"}
          data-dashboard-tab-link={tab.id}
          data-ui-tab={tab.id}
          key={tab.id}
        >
          <span>{tab.label}</span>
          {tab.count > 0 && (
            <span className="tab-badge tab-badge--muted">{tab.count}</span>
          )}
        </a>
      ))}
    </nav>
  );
}
