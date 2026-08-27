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
        tab.setAttribute("tabindex", active ? "0" : "-1");
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

    root.addEventListener("keydown", function (event) {
      var target = event.target;
      var tab = target && target.closest ? target.closest("[data-ui-tab]") : null;
      if (!tab || tab.closest("[data-ui-tabs]") !== root) return;

      var tabList = tab.closest('[role="tablist"]');
      var vertical = tabList && tabList.getAttribute("aria-orientation") === "vertical";
      var currentIndex = tabs.indexOf(tab);
      var nextIndex = currentIndex;

      if (event.key === "Home") nextIndex = 0;
      else if (event.key === "End") nextIndex = tabs.length - 1;
      else if ((!vertical && event.key === "ArrowRight") || (vertical && event.key === "ArrowDown")) {
        nextIndex = (currentIndex + 1) % tabs.length;
      } else if ((!vertical && event.key === "ArrowLeft") || (vertical && event.key === "ArrowUp")) {
        nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
      } else {
        return;
      }

      var nextTab = tabs[nextIndex];
      var nextValue = nextTab && nextTab.getAttribute("data-ui-tab");
      if (!nextTab || !nextValue || !panelExists(nextValue)) return;
      event.preventDefault();
      nextTab.focus();
      activate(nextValue, true);
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
    var emptyStates = ownedBy(root, "[data-ui-filter-empty]", "[data-ui-filter]");
    var tools = ownedBy(root, "[data-ui-filter-tools]", "[data-ui-filter]")[0] || null;
    var search = ownedBy(root, "[data-ui-filter-search]", "[data-ui-filter]")[0] || null;
    var toggle = ownedBy(root, "[data-ui-filter-toggle]", "[data-ui-filter]")[0] || null;
    var toggleLabel = ownedBy(root, "[data-ui-filter-toggle-label]", "[data-ui-filter]")[0] || null;
    var allValue = root.getAttribute("data-ui-filter-all") || "all";
    var fallback = root.getAttribute("data-ui-filter-default") || allValue;
    var visibleLimit = Number(root.getAttribute("data-ui-filter-visible-options")) || controls.length;
    var hasOverflow = controls.length > visibleLimit;
    var expanded = false;
    if (!controls.length) return;

    function updateControlVisibility() {
      var query = search ? search.value.trim().toLowerCase() : "";
      var activeValue = root.getAttribute("data-ui-filter-active") || fallback;
      controls.forEach(function (control, index) {
        var value = control.getAttribute("data-ui-filter-value") || "";
        var label = control.getAttribute("data-ui-filter-option-label") || value;
        var matches = label.toLowerCase().indexOf(query) !== -1;
        var visible = query
          ? value === allValue || value === activeValue || matches
          : expanded || index < visibleLimit || value === activeValue;
        control.toggleAttribute("hidden", !visible);
      });

      if (tools) tools.toggleAttribute("hidden", !hasOverflow);
      if (toggle) {
        toggle.toggleAttribute("hidden", !hasOverflow || query.length > 0);
        toggle.setAttribute("aria-expanded", expanded ? "true" : "false");
      }
      if (toggleLabel) toggleLabel.textContent = expanded ? "Show fewer" : "Show all";
    }

    function activate(value) {
      root.setAttribute("data-ui-filter-active", value);
      controls.forEach(function (control) {
        var active = control.getAttribute("data-ui-filter-value") === value;
        control.classList.toggle("is-active", active);
        control.setAttribute("aria-pressed", active ? "true" : "false");
      });
      var visibleCount = 0;
      items.forEach(function (item) {
        var values = parseFilterValues(item);
        var visible = value === allValue || values.indexOf(value) !== -1;
        item.toggleAttribute("hidden", !visible);
        if (visible) visibleCount += 1;
      });
      emptyStates.forEach(function (emptyState) {
        emptyState.toggleAttribute("hidden", visibleCount > 0);
      });
      updateControlVisibility();
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

    if (search) {
      search.addEventListener("input", updateControlVisibility);
    }
    if (toggle) {
      toggle.addEventListener("click", function () {
        expanded = !expanded;
        updateControlVisibility();
      });
    }

    root.classList.add("ui-filter-ready");
    activate(fallback);
  }

  function spatialRelated(point) {
    var raw = point.getAttribute("data-ui-spatial-related");
    if (!raw) return [];
    try {
      var parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      return [];
    }
  }

  function setupSpatial(root) {
    var points = ownedBy(root, "[data-ui-spatial-point]", "[data-ui-spatial]");
    var details = ownedBy(root, "[data-ui-spatial-detail]", "[data-ui-spatial]");
    if (!points.length) return;

    function activate(id) {
      root.setAttribute("data-ui-spatial-active", id);
      var selected = points.find(function (point) {
        return point.getAttribute("data-ui-spatial-point") === id;
      });
      var related = selected ? spatialRelated(selected) : [];
      points.forEach(function (point) {
        var pointId = point.getAttribute("data-ui-spatial-point") || "";
        var pointRelated = spatialRelated(point);
        var isSelected = pointId === id;
        var isRelated = related.indexOf(pointId) !== -1 || pointRelated.indexOf(id) !== -1;
        point.classList.toggle("is-selected", isSelected);
        point.classList.toggle("is-related", isRelated);
        point.setAttribute("aria-pressed", isSelected ? "true" : "false");
      });
      details.forEach(function (detail) {
        detail.toggleAttribute(
          "hidden",
          detail.getAttribute("data-ui-spatial-detail") !== id,
        );
      });
    }

    function clear() {
      root.removeAttribute("data-ui-spatial-active");
      points.forEach(function (point) {
        point.classList.remove("is-selected", "is-related");
        point.setAttribute("aria-pressed", "false");
      });
      details.forEach(function (detail) {
        detail.setAttribute("hidden", "");
      });
    }

    root.addEventListener("click", function (event) {
      var target = event.target;
      var point = target && target.closest
        ? target.closest("[data-ui-spatial-point]")
        : null;
      if (!point || point.closest("[data-ui-spatial]") !== root) return;
      var id = point.getAttribute("data-ui-spatial-point");
      if (id) activate(id);
    });
    root.addEventListener("focusin", function (event) {
      var target = event.target;
      var point = target && target.closest
        ? target.closest("[data-ui-spatial-point]")
        : null;
      if (!point || point.closest("[data-ui-spatial]") !== root) return;
      var id = point.getAttribute("data-ui-spatial-point");
      if (id) activate(id);
    });
    root.addEventListener("keydown", function (event) {
      if (event.key === "Escape") clear();
    });
  }

  var tabRoots = Array.prototype.slice.call(document.querySelectorAll("[data-ui-tabs]"));
  if (tabRoots.length) {
    document.documentElement.classList.add("dashboard-tabs-ready");
    tabRoots.forEach(setupTabs);
  }

  var filterRoots = Array.prototype.slice.call(document.querySelectorAll("[data-ui-filter]"));
  filterRoots.forEach(setupFilter);

  var spatialRoots = Array.prototype.slice.call(document.querySelectorAll("[data-ui-spatial]"));
  spatialRoots.forEach(setupSpatial);
})();`;
