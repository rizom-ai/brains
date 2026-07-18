export const agentNetworkWidgetScript = `(function () {
  function parsePersonClaims(button) {
    var raw = button.getAttribute("data-agent-person-claims");
    if (!raw) return [];
    try {
      var parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  }

  var promotionAvailable = document.body.getAttribute("data-auth-role") === "anchor";
  document.querySelectorAll("[data-agent-promote]").forEach(function (button) {
    button.hidden = !promotionAvailable;
    if (!promotionAvailable) return;
    button.addEventListener("click", function () {
      sessionStorage.setItem("brains:people-agent-promotion", JSON.stringify({
        agentId: button.getAttribute("data-agent-promote"),
        displayName: button.getAttribute("data-agent-promote-name"),
        claims: parsePersonClaims(button)
      }));
      window.location.assign("/admin");
    });
  });
})();`;
