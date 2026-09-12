/* Enhance the existing hero box. Never send on load, focus, or topic selection. */
(function () {
  var body = document.querySelector("#brain-chat .talk-body");
  var input = body?.querySelector("textarea");
  if (!body || !input) return;
  var status = document.createElement("p");
  status.id = "ask-status";
  status.setAttribute("role", "status");
  var scroll = body.querySelector(".brain-box-static-scroll");
  if (!scroll) return;
  scroll.append(status);
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
      var loaded = await Promise.all([import("/ask/assets/guest.js"), styled]);
      loaded[0].mountGuestBox(body, sendRequested);
      mounted = true;
    } catch {
      sheet.remove();
      sendRequested = false;
      input.readOnly = false;
      body.querySelectorAll("[data-chat-topic]").forEach(function (button) {
        button.disabled = false;
      });
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
      body.querySelectorAll("[data-chat-topic]").forEach(function (button) {
        button.disabled = true;
      });
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
  var send = body.querySelector(".send");
  if (send) {
    send.disabled = false;
    send.addEventListener("click", requestSend);
  }
  body.querySelectorAll("[data-chat-topic]").forEach(function (button) {
    button.disabled = false;
    button.addEventListener("click", function () {
      if (mounted) return;
      input.value = button.textContent || "";
      void open();
    });
  });
})();
