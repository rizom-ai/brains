import {
  ASK_BOX_ATTRIBUTE,
  ASK_READY_ATTRIBUTE,
  ASK_SEND_ATTRIBUTE,
  ASK_SHEET_ATTRIBUTE,
  ASK_SHEET_HISTORY_KEY,
  ASK_SHEET_MEDIA,
  ASK_STATUS_ATTRIBUTE,
} from "@brains/contracts";

/**
 * Shared progressive enhancement for every Ask box host a site renders (see
 * `@brains/contracts` ask-box). Served only while guest chat is enabled, so a
 * site's disabled host stays inert otherwise. Never sends on load, focus or a
 * filled draft: the guest bundle loads on engagement and sends only when the
 * visitor asked to. When the bundle cannot load, the draft stays and the
 * status line says so. On a narrow screen engaging opens the box full screen
 * at once, before the bundle arrives, so the keyboard never covers it.
 */
/** Where the boot is served, at the current version. */
export const ASK_BOX_BOOT_PATH = "/ask/assets/boot.js";
/** Which build is current; never cached, so a release reaches every browser. */
export const ASK_BOX_VERSION_PATH = "/ask/assets/version";

/**
 * Served at ASK_BOX_SCRIPT_PATH, which sites reference without a version and
 * browsers and caches may keep for hours. It never changes: it asks which
 * build is current and loads the boot, and through it the chat, at that
 * version, so no cache serves stale code after a release.
 */
export const ASK_BOX_LOADER_SCRIPT: string = `(function () {
  function boot(src) {
    var script = document.createElement("script");
    script.src = src;
    document.head.append(script);
  }
  fetch("${ASK_BOX_VERSION_PATH}", { cache: "no-store" })
    .then(function (response) {
      if (!response.ok) throw new Error("Version unavailable");
      return response.json();
    })
    .then(function (current) {
      boot("${ASK_BOX_BOOT_PATH}?v=" + encodeURIComponent(current.version));
    })
    .catch(function () {
      // Without a version the boot still loads; only its caching is weaker.
      boot("${ASK_BOX_BOOT_PATH}");
    });
})();`;

export function askBoxBootScript(version: string): string {
  const suffix = `?v=${encodeURIComponent(version)}`;
  return `(function () {
  // Reloaded with the sheet open: step back off its entry, so Back has no
  // dead step, and return to where the page was.
  var marked = window.history.state && window.history.state[${JSON.stringify(ASK_SHEET_HISTORY_KEY)}];
  if (marked) {
    window.addEventListener("popstate", function returned() {
      window.removeEventListener("popstate", returned);
      window.scrollTo(0, Number(marked.y) || 0);
    });
    window.history.back();
  }
  var guestModule = new URL("/ask/assets/guest.js${suffix}", window.location.origin).href;
  var guestStyles = null;
  // The chat's stylesheet, added once: it only styles an engaged box.
  function styles() {
    if (!guestStyles) {
      var sheet = document.createElement("link");
      sheet.rel = "stylesheet";
      sheet.href = "/ask/assets/guest.css${suffix}";
      guestStyles = new Promise(function (resolve, reject) {
        sheet.onload = resolve;
        sheet.onerror = function () {
          sheet.remove();
          guestStyles = null;
          reject(new Error("Chat styles unavailable"));
        };
      });
      document.head.append(sheet);
    }
    return guestStyles;
  }
  // Fetched once the page is idle, so engaging opens the box at once. Nothing
  // mounts and nothing is sent; a failure here surfaces on engagement.
  function prefetch() {
    styles().catch(function () { return undefined; });
    var code = document.createElement("link");
    code.rel = "modulepreload";
    code.href = "/ask/assets/guest.js${suffix}";
    document.head.append(code);
  }
  (window.requestIdleCallback || function (run) { window.setTimeout(run, 1000); })(prefetch);
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
      if (window.matchMedia(${JSON.stringify(ASK_SHEET_MEDIA)}).matches) {
        var viewport = window.visualViewport;
        host.style.setProperty(
          "--ask-viewport-height",
          (viewport ? viewport.height : window.innerHeight) + "px"
        );
        host.setAttribute("${ASK_SHEET_ATTRIBUTE}", "");
      }
      try {
        // Served by the Brain, not bundled inside the site package.
        var loaded = await Promise.all([import(guestModule), styles()]);
        loaded[0].mountGuestBox(host, sendRequested);
        mounted = true;
      } catch {
        // The status line tells the visitor; the draft stays and nothing was sent.
        host.removeAttribute("${ASK_SHEET_ATTRIBUTE}");
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
}
