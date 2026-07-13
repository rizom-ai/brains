export const proximityMapScript = `(function () {
  document.querySelectorAll("[data-proximity-map]").forEach(function (map) {
    var nodes = map.querySelectorAll("[data-proximity-node]");
    var clusters = map.querySelectorAll("[data-proximity-cluster-id]");
    var tooltip = map.querySelector("[data-proximity-tooltip]");

    function reset() {
      nodes.forEach(function (node) {
        node.style.opacity = "";
      });
      clusters.forEach(function (cluster) {
        cluster.style.opacity = "";
      });
      if (tooltip) {
        tooltip.hidden = true;
        tooltip.textContent = "";
      }
    }

    // Structured tooltip built exclusively through textContent — agent names
    // arrive from remote agent cards and must never be parsed as markup.
    function showTooltip(anchor, parts) {
      if (!tooltip) return;
      tooltip.textContent = "";
      var name = document.createElement("div");
      name.className = "proximity-tooltip-name";
      name.textContent = parts.name;
      tooltip.appendChild(name);
      if (parts.meta) {
        var meta = document.createElement("div");
        meta.className = "proximity-tooltip-meta";
        meta.textContent = parts.meta;
        tooltip.appendChild(meta);
      }
      if (parts.tags && parts.tags.length > 0) {
        var tags = document.createElement("div");
        tags.className = "proximity-tooltip-tags";
        parts.tags.forEach(function (tagText) {
          var tag = document.createElement("span");
          tag.className = "proximity-tooltip-tag";
          tag.textContent = tagText;
          tags.appendChild(tag);
        });
        tooltip.appendChild(tags);
      }
      tooltip.hidden = false;
      var mapRect = map.getBoundingClientRect();
      var anchorRect = anchor.getBoundingClientRect();
      var left = anchorRect.right - mapRect.left + 12;
      var top = anchorRect.top - mapRect.top - 8;
      tooltip.style.left = Math.min(left, mapRect.width - tooltip.offsetWidth - 12) + "px";
      tooltip.style.top = Math.max(12, top) + "px";
    }

    function focusCluster(clusterId) {
      nodes.forEach(function (candidate) {
        var sameCluster = candidate.getAttribute("data-proximity-node-cluster") === clusterId;
        candidate.style.opacity = sameCluster ? "1" : "0.2";
      });
      clusters.forEach(function (cluster) {
        var active = cluster.getAttribute("data-proximity-cluster-id") === clusterId;
        cluster.style.opacity = active ? "1" : "0.14";
      });
    }

    function activateNode(node) {
      var clusterId = node.getAttribute("data-proximity-node-cluster");
      if (clusterId) {
        focusCluster(clusterId);
      } else {
        nodes.forEach(function (candidate) {
          candidate.style.opacity = candidate === node ? "1" : "0.2";
        });
        clusters.forEach(function (cluster) {
          cluster.style.opacity = "0.14";
        });
      }

      var name = node.getAttribute("data-proximity-name") || "Agent";
      var kind = node.getAttribute("data-proximity-kind") || "agent";
      var status = node.getAttribute("data-proximity-status") || "";
      var distance = node.getAttribute("data-proximity-distance") || "";
      var tags = node.getAttribute("data-proximity-tags") || "";
      var statusLabel = status === "discovered" ? " · pending review" : status === "archived" ? " · archived" : "";
      showTooltip(node, {
        name: name,
        meta: kind + statusLabel + " · distance " + distance,
        tags: tags ? tags.split(", ") : [],
      });
    }

    function activateCluster(cluster, clusterId) {
      focusCluster(clusterId);
      var label = cluster.getAttribute("data-proximity-cluster-label") || "Constellation";
      var members = cluster.getAttribute("data-proximity-cluster-members") || "0";
      showTooltip(cluster, {
        name: label,
        meta: "constellation · " + members + " agents",
      });
    }

    function bind(element, activate) {
      element.addEventListener("mouseenter", activate);
      element.addEventListener("mouseleave", reset);
      element.addEventListener("focus", activate);
      element.addEventListener("blur", reset);
    }

    nodes.forEach(function (node) {
      bind(node, function () { activateNode(node); });
    });

    clusters.forEach(function (cluster) {
      var clusterId = cluster.getAttribute("data-proximity-cluster-id");
      if (!clusterId) return;
      bind(cluster, function () { activateCluster(cluster, clusterId); });
    });
  });
})();`;
