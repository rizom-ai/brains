import {
  ASK_BOX_ATTRIBUTE,
  ASK_READY_ATTRIBUTE,
  ASK_SEND_ATTRIBUTE,
  ASK_STATUS_ATTRIBUTE,
} from "@brains/contracts";

/**
 * Shared progressive enhancement for every Ask box host a site renders (see
 * `@brains/contracts` ask-box). Served only while guest chat is enabled, so a
 * site's disabled host stays inert otherwise. Never sends on load, focus or a
 * filled draft: the guest bundle loads on engagement and sends only when the
 * visitor asked to. When the bundle cannot load, the draft stays and the
 * status line says so.
 */
export const ASK_BOX_BOOT_SCRIPT: string = `(function () {
  document.querySelectorAll("[${ASK_BOX_ATTRIBUTE}]").forEach(function (host) {
    var input = host.querySelector("textarea");
    var send = host.querySelector("[${ASK_SEND_ATTRIBUTE}]");
    var status = host.querySelector("[${ASK_STATUS_ATTRIBUTE}]");
    if (!input || !send || !status) return;
    var loading = false;
    var mounted = false;
    var sendRequested = false;
    async function open() {
      if (loading || mounted) return;
      loading = true;
      status.textContent = "Connecting to chat…";
      var sheet = document.createElement("link");
      sheet.rel = "stylesheet";
      sheet.href = "/ask/assets/guest.css";
      try {
        var styled = new Promise(function (resolve, reject) {
          sheet.onload = resolve;
          sheet.onerror = reject;
        });
        document.head.append(sheet);
        // Served by the Brain, not bundled inside the site package.
        var moduleUrl = new URL("/ask/assets/guest.js", window.location.origin).href;
        var loaded = await Promise.all([import(moduleUrl), styled]);
        loaded[0].mountGuestBox(host, sendRequested);
        mounted = true;
      } catch {
        // The status line tells the visitor; the draft stays and nothing was sent.
        sheet.remove();
        sendRequested = false;
        input.readOnly = false;
        status.textContent =
          "Public chat is unavailable here. Your draft is unchanged; no question has been sent.";
      } finally {
        loading = false;
      }
    }
    function requestSend() {
      if (mounted) return;
      if (input.value.trim()) {
        sendRequested = true;
        input.readOnly = true;
      }
      void open();
    }
    input.disabled = false;
    input.addEventListener("focus", open);
    input.addEventListener("keydown", function (event) {
      if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
        event.preventDefault();
        requestSend();
      }
    });
    send.disabled = false;
    send.addEventListener("click", requestSend);
    host.setAttribute("${ASK_READY_ATTRIBUTE}", "");
  });
})();`;
