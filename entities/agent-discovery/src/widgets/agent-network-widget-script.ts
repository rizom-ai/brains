export const agentNetworkWidgetScript = `(function () {
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
    var filters = widget.querySelectorAll("[data-agent-network-tag-filter]");
    var skillRows = widget.querySelectorAll("[data-agent-network-skill-row]");

    function setTagFilter(filter) {
      filters.forEach(function (button) {
        var active = button.getAttribute("data-agent-network-tag-filter") === filter;
        button.classList.toggle("is-active", active);
        button.setAttribute("aria-pressed", active ? "true" : "false");
      });
      skillRows.forEach(function (row) {
        var tags = parseTags(row);
        var visible = filter === "all" || tags.indexOf(filter) !== -1;
        row.toggleAttribute("data-hidden", !visible);
      });
    }

    widget.addEventListener("click", function (event) {
      var target = event.target;
      var button = target && target.closest
        ? target.closest("[data-agent-network-tag-filter]")
        : null;
      if (!button || !widget.contains(button)) return;
      var filter = button.getAttribute("data-agent-network-tag-filter");
      if (filter) setTagFilter(filter);
    });

    setTagFilter("all");
  });
})();`;
