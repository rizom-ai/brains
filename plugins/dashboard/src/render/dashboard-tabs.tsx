/** @jsxImportSource react */
import type { JSX } from "react";
import {
  OperatorSectionTabs,
  OperatorSectionTab,
} from "@brains/operator-view-react";

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
    <OperatorSectionTabs className="dashboard-tabs" label="Dashboard sections">
      {tabs.map((tab, index) => (
        <OperatorSectionTab
          id={`dashboard-tab-${tab.id}`}
          className="dashboard-tab"
          href={`#${tab.id}`}
          aria-controls={tab.id}
          selected={index === 0}
          count={tab.count}
          data-dashboard-tab-link={tab.id}
          data-ui-tab={tab.id}
          key={tab.id}
        >
          {tab.label}
        </OperatorSectionTab>
      ))}
    </OperatorSectionTabs>
  );
}
