export const agentNetworkWidgetScript = `(function () {
  function setActive(nodes, match) {
    nodes.forEach(function (node) {
      var active = match(node);
      node.classList.toggle("is-active", active);
      if (node.hasAttribute("aria-pressed")) {
        node.setAttribute("aria-pressed", active ? "true" : "false");
      }
    });
  }

  function parseTags(row) {
    var raw = row.getAttribute("data-agent-network-tags");
    if (!raw) return [];
    try {
      var parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  }

  document.querySelectorAll("[data-agent-network-widget]").forEach(function (widget) {
    var viewTabs = widget.querySelectorAll("[data-agent-network-view-tab]");
    var kindTabs = widget.querySelectorAll("[data-agent-network-kind-tab]");
    var panels = widget.querySelectorAll("[data-agent-network-panel]");
    var tagFilters = widget.querySelectorAll("[data-agent-network-tag-filter]");
    var skillRows = widget.querySelectorAll("[data-agent-network-skill-row]");

    function showPanel(key) {
      setActive(panels, function (panel) {
        return panel.getAttribute("data-agent-network-panel") === key;
      });
    }

    function activeKind() {
      var active = widget.querySelector("[data-agent-network-kind-tab].is-active");
      return active ? active.getAttribute("data-agent-network-kind-tab") || "all" : "all";
    }

    function setView(view) {
      widget.setAttribute("data-agent-network-view", view);
      setActive(viewTabs, function (tab) {
        return tab.getAttribute("data-agent-network-view-tab") === view;
      });
      if (view === "skills") {
        showPanel("skills");
      } else {
        showPanel(activeKind());
      }
    }

    function setKind(kind) {
      setActive(kindTabs, function (tab) {
        return tab.getAttribute("data-agent-network-kind-tab") === kind;
      });
      setView("agents");
      showPanel(kind);
    }

    function setTagFilter(filter) {
      setActive(tagFilters, function (button) {
        return button.getAttribute("data-agent-network-tag-filter") === filter;
      });
      skillRows.forEach(function (row) {
        var tags = parseTags(row);
        var visible = filter === "all" || tags.indexOf(filter) !== -1;
        row.toggleAttribute("data-hidden", !visible);
      });
    }

    viewTabs.forEach(function (tab) {
      tab.addEventListener("click", function () {
        var view = tab.getAttribute("data-agent-network-view-tab");
        if (view) setView(view);
      });
    });

    kindTabs.forEach(function (tab) {
      tab.addEventListener("click", function () {
        var kind = tab.getAttribute("data-agent-network-kind-tab");
        if (kind) setKind(kind);
      });
    });

    tagFilters.forEach(function (button) {
      button.addEventListener("click", function () {
        var filter = button.getAttribute("data-agent-network-tag-filter");
        if (filter) setTagFilter(filter);
      });
    });

    setView("agents");
    setTagFilter("all");
  });
})();`;
