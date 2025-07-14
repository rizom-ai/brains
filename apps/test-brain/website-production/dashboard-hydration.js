
// Use global preact from window
const { h, hydrate, useState, useMemo } = window.preact;

(() => {
  var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
    get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
  }) : x)(function(x) {
    if (typeof require !== "undefined")
      return require.apply(this, arguments);
    throw Error('Dynamic require of "' + x + '" is not supported');
  });

  // src/templates/dashboard/layout.tsx
  var import_preact = window.preact;
  
  var DashboardRender = ({
    data,
    sortedStats,
    filter,
    sortBy,
    showDetails,
    onFilterChange,
    onSortChange,
    onToggleDetails
  }) => {
    return /* @__PURE__ */ (0, import_preact.h)(
      "div",
      {
        className: "dashboard-widget p-6 bg-theme-subtle rounded-lg",
        "data-component": "site-builder:dashboard"
      },
      /* @__PURE__ */ (0, import_preact.h)("h2", { className: "text-2xl font-bold mb-4" }, "System Dashboard"),
      /* @__PURE__ */ (0, import_preact.h)("div", { className: "mb-4 flex gap-4", "data-hydrate-controls": "true" }, /* @__PURE__ */ (0, import_preact.h)(
        "input",
        {
          type: "text",
          placeholder: "Filter types...",
          value: filter,
          onInput: onFilterChange ? (e) => onFilterChange(e.target.value) : void 0,
          className: "px-3 py-2 border rounded"
        }
      ), /* @__PURE__ */ (0, import_preact.h)(
        "button",
        {
          onClick: onSortChange,
          className: "px-4 py-2 bg-brand text-white rounded hover:bg-brand-dark"
        },
        "Sort by ",
        sortBy === "count" ? "Type" : "Count"
      ), /* @__PURE__ */ (0, import_preact.h)(
        "button",
        {
          onClick: onToggleDetails,
          className: "px-4 py-2 bg-theme rounded border hover:bg-theme-subtle"
        },
        showDetails ? "Hide" : "Show",
        " Details"
      )),
      /* @__PURE__ */ (0, import_preact.h)("div", { className: "grid grid-cols-2 md:grid-cols-3 gap-4 mb-6" }, sortedStats.map((stat) => /* @__PURE__ */ (0, import_preact.h)("div", { key: stat.type, className: "bg-theme p-4 rounded" }, /* @__PURE__ */ (0, import_preact.h)("h3", { className: "font-semibold" }, stat.type), /* @__PURE__ */ (0, import_preact.h)("p", { className: "text-2xl font-bold text-brand" }, stat.count)))),
      /* @__PURE__ */ (0, import_preact.h)("div", { className: "mt-6 text-sm text-theme-muted" }, "Built: ", new Date(data.buildInfo.timestamp).toLocaleString())
    );
  };
  var DashboardWidget = (data) => {
    const isBrowser = typeof window !== "undefined";
    if (!isBrowser) {
      const sortedStats2 = [...data.entityStats].sort((a, b) => b.count - a.count);
      return /* @__PURE__ */ (0, import_preact.h)(
        DashboardRender,
        {
          data,
          sortedStats: sortedStats2,
          filter: "",
          sortBy: "count",
          showDetails: false
        }
      );
    }
    const [sortBy, setSortBy] = window.preact.useState("count");
    const [showDetails, setShowDetails] = window.preact.useState(false);
    const [filter, setFilter] = window.preact.useState("");
    const sortedStats = window.preact.useMemo(() => {
      return [...data.entityStats].filter((s) => s.type.toLowerCase().includes(filter.toLowerCase())).sort(
        (a, b) => sortBy === "count" ? b.count - a.count : a.type.localeCompare(b.type)
      );
    }, [data.entityStats, sortBy, filter]);
    return /* @__PURE__ */ (0, import_preact.h)(
      DashboardRender,
      {
        data,
        sortedStats,
        filter,
        sortBy,
        showDetails,
        onFilterChange: setFilter,
        onSortChange: () => setSortBy(sortBy === "count" ? "type" : "count"),
        onToggleDetails: () => setShowDetails(!showDetails)
      }
    );
  };

  // src/templates/dashboard/hydration.tsx
  (function hydrateDashboard() {
    if (typeof window !== "undefined" && !window.__dashboard_hydrated) {
      window.__dashboard_hydrated = true;
      const dashboardElement = document.querySelector(
        '[data-component="site-builder:dashboard"]'
      );
      if (!dashboardElement?.parentElement) {
        console.warn("[Dashboard] Dashboard element or parent not found");
        return;
      }
      const container = dashboardElement.parentElement;
      const dataScript = document.querySelector('[data-dashboard-props="true"]');
      if (!dataScript) {
        console.warn("[Dashboard] Data script not found");
        return;
      }
      try {
        const data = JSON.parse(dataScript.textContent ?? "{}");
        console.log("[Dashboard] Container before hydration:", container);
        console.log(
          "[Dashboard] Container innerHTML length:",
          container.innerHTML.length
        );
        console.log("[Dashboard] Data:", data);
        const { h: h2 } = window.preact;
        window.preact.hydrate(h2(DashboardWidget, data), container);
        console.log("[Dashboard] Container after hydration:", container);
        console.log(
          "[Dashboard] Container innerHTML length after:",
          container.innerHTML.length
        );
        dataScript.remove();
        console.log("[Dashboard] Hydrated successfully");
      } catch (error) {
        console.error("[Dashboard] Hydration failed:", error);
      }
    }
  })();
})();
