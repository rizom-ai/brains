import { INBOX_ACTION_PATH } from "./action-route";

export const unifiedInboxWidgetScript: string = `(function () {
  document.querySelectorAll("[data-unified-inbox-widget]").forEach(function (root) {
    var endpoint = root.getAttribute("data-inbox-action-url") || "${INBOX_ACTION_PATH}";
    var status = root.querySelector("[data-inbox-status]");

    function setStatus(message, isError) {
      if (!status) return;
      status.textContent = message;
      status.classList.toggle("is-error", Boolean(isError));
    }

    async function dispatch(button, confirmed) {
      button.disabled = true;
      setStatus("Updating inbox…", false);
      try {
        var response = await fetch(endpoint, {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sourceId: button.getAttribute("data-inbox-source-id"),
            itemId: button.getAttribute("data-inbox-item-id"),
            actionId: button.getAttribute("data-inbox-action-id"),
            confirmed: confirmed
          })
        });
        var result = await response.json();
        if (response.status === 409 && result.confirmationRequired && !confirmed) {
          button.disabled = false;
          if (window.confirm(result.summary || "Confirm this inbox action?")) {
            await dispatch(button, true);
          } else {
            setStatus("Action cancelled.", false);
          }
          return;
        }
        if (!response.ok || !result.success) {
          throw new Error(result.error || "Inbox action failed");
        }
        setStatus("Inbox updated.", false);
        window.setTimeout(function () { window.location.reload(); }, 180);
      } catch (error) {
        button.disabled = false;
        setStatus(error instanceof Error ? error.message : "Inbox action failed", true);
      }
    }

    root.addEventListener("click", function (event) {
      var target = event.target;
      var button = target && target.closest ? target.closest("[data-inbox-action]") : null;
      if (!button || !root.contains(button) || button.disabled) return;

      var needsConfirmation = button.getAttribute("data-inbox-confirm") === "true";
      if (needsConfirmation) {
        var label = button.getAttribute("data-inbox-action-label") || "Run action";
        var title = button.getAttribute("data-inbox-item-title") || "this item";
        if (!window.confirm(label + " “" + title + "”?")) return;
      }
      void dispatch(button, needsConfirmation);
    });
  });
})();`;
