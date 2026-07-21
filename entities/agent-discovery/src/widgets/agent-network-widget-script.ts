export const agentNetworkWidgetScript = `(function () {
  var invitationAvailable = document.body.getAttribute("data-auth-role") === "admin";
  document.querySelectorAll("[data-external-peer-invite]").forEach(function (button) {
    button.hidden = !invitationAvailable;
    if (!invitationAvailable) return;
    button.addEventListener("click", function () {
      sessionStorage.setItem("brains:admin-peer-invitation", JSON.stringify({
        peerId: button.getAttribute("data-external-peer-invite"),
        displayName: button.getAttribute("data-external-peer-name")
      }));
      window.location.assign("/admin");
    });
  });
})();`;
