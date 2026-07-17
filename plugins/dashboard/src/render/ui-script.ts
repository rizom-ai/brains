export const DASHBOARD_UI_SCRIPT = `(function () {
  function ownedBy(root, selector, rootSelector) {
    return Array.prototype.slice.call(root.querySelectorAll(selector)).filter(function (node) {
      return node.closest(rootSelector) === root;
    });
  }

  function setupTabs(root) {
    var tabs = ownedBy(root, "[data-ui-tab]", "[data-ui-tabs]");
    var panels = ownedBy(root, "[data-ui-panel]", "[data-ui-tabs]");
    var useHash = root.hasAttribute("data-ui-tabs-hash");
    var stateAttribute = root.getAttribute("data-ui-tabs-state-attribute");
    var fallback = root.getAttribute("data-ui-tabs-default") || "";
    if (!tabs.length || !panels.length) return;

    function panelExists(value) {
      return panels.some(function (panel) {
        return panel.getAttribute("data-ui-panel") === value;
      });
    }

    function resolveValue() {
      var hashValue = useHash ? window.location.hash.replace(/^#/, "") : "";
      if (hashValue && panelExists(hashValue)) return hashValue;
      if (fallback && panelExists(fallback)) return fallback;
      return panels[0].getAttribute("data-ui-panel") || "";
    }

    function activate(value, updateHash) {
      root.setAttribute("data-ui-tabs-active", value);
      if (stateAttribute) root.setAttribute(stateAttribute, value);

      tabs.forEach(function (tab) {
        var active = tab.getAttribute("data-ui-tab") === value;
        tab.classList.toggle("is-active", active);
        tab.setAttribute("aria-selected", active ? "true" : "false");
        if (tab.hasAttribute("aria-pressed")) {
          tab.setAttribute("aria-pressed", active ? "true" : "false");
        }
      });

      panels.forEach(function (panel) {
        var active = panel.getAttribute("data-ui-panel") === value;
        panel.classList.toggle("is-active", active);
        panel.toggleAttribute("hidden", !active);
      });

      if (useHash && updateHash && window.history && window.history.pushState) {
        window.history.pushState(null, "", "#" + value);
      }
    }

    root.addEventListener("click", function (event) {
      var target = event.target;
      var tab = target && target.closest ? target.closest("[data-ui-tab]") : null;
      if (!tab || tab.closest("[data-ui-tabs]") !== root) return;
      var value = tab.getAttribute("data-ui-tab");
      if (!value || !panelExists(value)) return;
      event.preventDefault();
      activate(value, true);
    });

    root.classList.add("ui-tabs-ready");
    activate(resolveValue(), false);

    if (useHash) {
      window.addEventListener("hashchange", function () {
        activate(resolveValue(), false);
      });
    }
  }

  function parseFilterValues(item) {
    var raw = item.getAttribute("data-ui-filter-values");
    if (!raw) return [];
    try {
      var parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      return [];
    }
  }

  function setupFilter(root) {
    var controls = ownedBy(root, "[data-ui-filter-value]", "[data-ui-filter]");
    var items = ownedBy(root, "[data-ui-filter-values]", "[data-ui-filter]");
    var allValue = root.getAttribute("data-ui-filter-all") || "all";
    var fallback = root.getAttribute("data-ui-filter-default") || allValue;
    if (!controls.length) return;

    function activate(value) {
      root.setAttribute("data-ui-filter-active", value);
      controls.forEach(function (control) {
        var active = control.getAttribute("data-ui-filter-value") === value;
        control.classList.toggle("is-active", active);
        control.setAttribute("aria-pressed", active ? "true" : "false");
      });
      items.forEach(function (item) {
        var values = parseFilterValues(item);
        var visible = value === allValue || values.indexOf(value) !== -1;
        item.toggleAttribute("hidden", !visible);
      });
    }

    root.addEventListener("click", function (event) {
      var target = event.target;
      var control = target && target.closest
        ? target.closest("[data-ui-filter-value]")
        : null;
      if (!control || control.closest("[data-ui-filter]") !== root) return;
      var value = control.getAttribute("data-ui-filter-value");
      if (value) activate(value);
    });

    activate(fallback);
  }

  var tabRoots = Array.prototype.slice.call(document.querySelectorAll("[data-ui-tabs]"));
  if (tabRoots.length) {
    document.documentElement.classList.add("dashboard-tabs-ready");
    tabRoots.forEach(setupTabs);
  }

  var filterRoots = Array.prototype.slice.call(document.querySelectorAll("[data-ui-filter]"));
  filterRoots.forEach(setupFilter);
})();`;
