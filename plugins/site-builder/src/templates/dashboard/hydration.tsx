// Import component that will be bundled
import { DashboardWidget } from "./layout";

// Get preact from global at runtime
declare global {
  interface Window {
    preact: {
      hydrate: (vnode: unknown, parent: Element) => void;
    };
  }
}

/**
 * Dashboard hydration script - uses proper JSX
 * This file gets compiled to JavaScript and included via script tag
 */
(function hydrateDashboard(): void {
  if (typeof window !== "undefined" && !window.__dashboard_hydrated) {
    window.__dashboard_hydrated = true;

    // Find the dashboard container's parent (the root div)
    const dashboardElement = document.querySelector(
      '[data-component="site-builder:dashboard"]',
    );
    if (!dashboardElement?.parentElement) {
      console.warn("[Dashboard] Dashboard element or parent not found");
      return;
    }
    const container = dashboardElement.parentElement;

    // Find the data script
    const dataScript = document.querySelector('[data-dashboard-props="true"]');
    if (!dataScript) {
      console.warn("[Dashboard] Data script not found");
      return;
    }

    try {
      // Parse the data
      const data = JSON.parse(dataScript.textContent || "{}");

      console.log("[Dashboard] Container before hydration:", container);
      console.log(
        "[Dashboard] Container innerHTML length:",
        container.innerHTML.length,
      );
      console.log("[Dashboard] Data:", data);

      // Hydrate the component using h from global preact
      const { h } = window.preact;
      window.preact.hydrate(h(DashboardWidget, data), container);

      console.log("[Dashboard] Container after hydration:", container);
      console.log(
        "[Dashboard] Container innerHTML length after:",
        container.innerHTML.length,
      );

      // Remove the data script
      dataScript.remove();

      console.log("[Dashboard] Hydrated successfully");
    } catch (error) {
      console.error("[Dashboard] Hydration failed:", error);
    }
  }
})();

// Make it available globally for script tag usage
declare global {
  interface Window {
    __dashboard_hydrated?: boolean;
  }
}
