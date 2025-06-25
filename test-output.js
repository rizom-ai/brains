// packages/shell/src/site-templates/dashboard/hydration.tsx
import { hydrate } from "preact";

// packages/shell/src/site-templates/dashboard/layout.tsx
import { useState, useMemo } from "preact/hooks";
import { jsxDEV, Fragment } from "preact/jsx-dev-runtime";
var DashboardRender = ({
  data,
  sortedStats,
  filter,
  sortBy,
  showDetails,
  isBrowser,
  onFilterChange,
  onSortChange,
  onToggleDetails
}) => {
  return /* @__PURE__ */ jsxDEV("div", {
    className: "dashboard-widget p-6 bg-theme-subtle rounded-lg",
    "data-component": "shell:dashboard",
    children: [
      /* @__PURE__ */ jsxDEV("h2", {
        className: "text-2xl font-bold mb-4",
        children: "System Dashboard"
      }, undefined, false, undefined, this),
      /* @__PURE__ */ jsxDEV("div", {
        className: "mb-4 flex gap-4",
        "data-hydrate-controls": "true",
        children: [
          /* @__PURE__ */ jsxDEV("input", {
            type: "text",
            placeholder: "Filter types...",
            value: filter,
            onInput: onFilterChange ? (e) => onFilterChange(e.target.value) : undefined,
            className: "px-3 py-2 border rounded"
          }, undefined, false, undefined, this),
          /* @__PURE__ */ jsxDEV("button", {
            onClick: onSortChange,
            className: "px-4 py-2 bg-brand text-white rounded hover:bg-brand-dark",
            children: [
              "Sort by ",
              sortBy === "count" ? "Type" : "Count"
            ]
          }, undefined, true, undefined, this),
          /* @__PURE__ */ jsxDEV("button", {
            onClick: onToggleDetails,
            className: "px-4 py-2 bg-theme rounded border hover:bg-theme-subtle",
            children: [
              showDetails ? "Hide" : "Show",
              " Details"
            ]
          }, undefined, true, undefined, this)
        ]
      }, undefined, true, undefined, this),
      /* @__PURE__ */ jsxDEV("div", {
        className: "grid grid-cols-2 md:grid-cols-3 gap-4 mb-6",
        children: sortedStats.map((stat) => /* @__PURE__ */ jsxDEV("div", {
          className: "bg-theme p-4 rounded",
          children: [
            /* @__PURE__ */ jsxDEV("h3", {
              className: "font-semibold",
              children: stat.type
            }, undefined, false, undefined, this),
            /* @__PURE__ */ jsxDEV("p", {
              className: "text-2xl font-bold text-brand",
              children: stat.count
            }, undefined, false, undefined, this)
          ]
        }, stat.type, true, undefined, this))
      }, undefined, false, undefined, this),
      /* @__PURE__ */ jsxDEV("div", {
        className: "mt-6 text-sm text-theme-muted",
        children: [
          "Built: ",
          new Date(data.buildInfo.timestamp).toLocaleString()
        ]
      }, undefined, true, undefined, this),
      !isBrowser && /* @__PURE__ */ jsxDEV(Fragment, {
        children: [
          /* @__PURE__ */ jsxDEV("script", {
            type: "application/json",
            "data-dashboard-props": "true",
            dangerouslySetInnerHTML: { __html: JSON.stringify(data) }
          }, undefined, false, undefined, this),
          /* @__PURE__ */ jsxDEV("script", {
            src: "/dashboard-hydration.js"
          }, undefined, false, undefined, this)
        ]
      }, undefined, true, undefined, this)
    ]
  }, undefined, true, undefined, this);
};
var DashboardWidget = (data) => {
  const isBrowser = typeof window !== "undefined";
  if (!isBrowser) {
    const sortedStats2 = [...data.entityStats].sort((a, b) => b.count - a.count);
    return /* @__PURE__ */ jsxDEV(DashboardRender, {
      data,
      sortedStats: sortedStats2,
      filter: "",
      sortBy: "count",
      showDetails: false,
      isBrowser: false
    }, undefined, false, undefined, this);
  }
  const [sortBy, setSortBy] = useState("count");
  const [showDetails, setShowDetails] = useState(false);
  const [filter, setFilter] = useState("");
  const sortedStats = useMemo(() => {
    return [...data.entityStats].filter((s) => s.type.toLowerCase().includes(filter.toLowerCase())).sort((a, b) => sortBy === "count" ? b.count - a.count : a.type.localeCompare(b.type));
  }, [data.entityStats, sortBy, filter]);
  return /* @__PURE__ */ jsxDEV(DashboardRender, {
    data,
    sortedStats,
    filter,
    sortBy,
    showDetails,
    isBrowser: true,
    onFilterChange: setFilter,
    onSortChange: () => setSortBy(sortBy === "count" ? "type" : "count"),
    onToggleDetails: () => setShowDetails(!showDetails)
  }, undefined, false, undefined, this);
};

// packages/shell/src/site-templates/dashboard/hydration.tsx
import { jsxDEV as jsxDEV2 } from "preact/jsx-dev-runtime";
(function hydrateDashboard() {
  if (typeof window !== "undefined" && !window.__dashboard_hydrated) {
    window.__dashboard_hydrated = true;
    const container = document.querySelector('[data-component="shell:dashboard"]');
    if (!container) {
      console.warn("[Dashboard] Container not found");
      return;
    }
    const dataScript = document.querySelector("[data-dashboard-props]");
    if (!dataScript) {
      console.warn("[Dashboard] Data script not found");
      return;
    }
    try {
      const data = JSON.parse(dataScript.textContent || "{}");
      hydrate(/* @__PURE__ */ jsxDEV2(DashboardWidget, {
        ...data
      }, undefined, false, undefined, this), container);
      dataScript.remove();
      console.log("[Dashboard] Hydrated successfully");
    } catch (error) {
      console.error("[Dashboard] Hydration failed:", error);
    }
  }
})();
