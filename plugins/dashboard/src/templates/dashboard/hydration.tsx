import { DashboardWidget } from "./layout";

declare global {
  interface Window {
    preact: {
      hydrate: (vnode: unknown, parent: Element) => void;
    };
    __dashboard_hydrated?: boolean;
  }
}

/**
 * Dashboard hydration script
 * This file gets compiled to JavaScript and included via script tag
 */
(function hydrateDashboard(): void {
  if (typeof window !== "undefined" && !window.__dashboard_hydrated) {
    window.__dashboard_hydrated = true;

    const dashboardElement = document.querySelector(
      '[data-component="dashboard:dashboard"]',
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
      const data = JSON.parse(dataScript.textContent || "{}");
      const { h } = window.preact;
      window.preact.hydrate(h(DashboardWidget, data), container);
      dataScript.remove();
      console.log("[Dashboard] Hydrated successfully");
    } catch (error) {
      console.error("[Dashboard] Hydration failed:", error);
    }
  }
})();
