export const proximityMapScript = `(function () {
  document.querySelectorAll("[data-proximity-map]").forEach(function (map) {
    var nodes = map.querySelectorAll("[data-proximity-node]");
    var clusters = map.querySelectorAll("[data-proximity-cluster-id]");
    var constellations = map.querySelectorAll("[data-proximity-constellation]");
    var tooltip = map.querySelector("[data-proximity-tooltip]");

    function reset() {
      nodes.forEach(function (node) {
        node.style.opacity = "";
      });
      clusters.forEach(function (cluster) {
        cluster.style.opacity = "";
      });
      constellations.forEach(function (constellation) {
        constellation.style.opacity = "";
      });
      if (tooltip) {
        tooltip.hidden = true;
        tooltip.textContent = "";
      }
    }

    function showTooltip(anchor, text) {
      if (!tooltip) return;
      tooltip.textContent = text;
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
      constellations.forEach(function (constellation) {
        var active = constellation.getAttribute("data-proximity-constellation") === clusterId;
        constellation.style.opacity = active ? "1" : "0.28";
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
        constellations.forEach(function (constellation) {
          constellation.style.opacity = "0.28";
        });
      }

      var name = node.getAttribute("data-proximity-name") || "Agent";
      var kind = node.getAttribute("data-proximity-kind") || "agent";
      var status = node.getAttribute("data-proximity-status") || "";
      var distance = node.getAttribute("data-proximity-distance") || "";
      var tags = node.getAttribute("data-proximity-tags") || "";
      var statusLabel = status === "discovered" ? " · pending review" : status === "archived" ? " · archived" : "";
      showTooltip(node, name + " · " + kind + statusLabel + " · distance " + distance + (tags ? " · " + tags : ""));
    }

    function activateConstellation(target, clusterId) {
      focusCluster(clusterId);
      var label = target.getAttribute("data-proximity-cluster-label") || "Constellation";
      var members = target.getAttribute("data-proximity-cluster-members") || "0";
      showTooltip(target, label + " · constellation · " + members + " agents");
    }

    nodes.forEach(function (node) {
      node.addEventListener("mouseenter", function () { activateNode(node); });
      node.addEventListener("mouseleave", reset);
      node.addEventListener("focus", function () { activateNode(node); });
      node.addEventListener("blur", reset);
    });

    clusters.forEach(function (cluster) {
      var clusterId = cluster.getAttribute("data-proximity-cluster-id");
      if (!clusterId) return;
      cluster.addEventListener("mouseenter", function () { activateConstellation(cluster, clusterId); });
      cluster.addEventListener("mouseleave", reset);
      cluster.addEventListener("focus", function () { activateConstellation(cluster, clusterId); });
      cluster.addEventListener("blur", reset);
    });

    constellations.forEach(function (constellation) {
      var clusterId = constellation.getAttribute("data-proximity-constellation");
      if (!clusterId) return;
      constellation.addEventListener("mouseenter", function () { activateConstellation(constellation, clusterId); });
      constellation.addEventListener("mouseleave", reset);
      constellation.addEventListener("focus", function () { activateConstellation(constellation, clusterId); });
      constellation.addEventListener("blur", reset);
    });
  });
})();`;
