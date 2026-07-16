export const DASHBOARD_TABS_SCRIPT = `(function () {
  var roots = Array.prototype.slice.call(document.querySelectorAll("[data-ui-tabs]"));
  if (!roots.length) return;

  function ownedBy(root, selector) {
    return Array.prototype.slice.call(root.querySelectorAll(selector)).filter(function (node) {
      return node.closest("[data-ui-tabs]") === root;
    });
  }

  function setup(root) {
    var tabs = ownedBy(root, "[data-ui-tab]");
    var panels = ownedBy(root, "[data-ui-panel]");
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

  document.documentElement.classList.add("dashboard-tabs-ready");
  roots.forEach(setup);
})();`;
