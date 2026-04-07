/**
 * Rizom site boot script.
 *
 * Runs once at page load and wires up:
 *   1. `data-rizom-variant` on <body> (value substituted at load time)
 *   2. Scroll-reveal IntersectionObserver → toggles `.visible` on `.reveal`
 *   3. Side-nav active-dot tracker (home route only)
 *   4. #themeToggle label + canvas redraw on click (delegates theme flip
 *      to window.toggleTheme, which is defined by site-builder's inline
 *      FOUC-prevention script — see plugins/site-builder html-generator.ts)
 *
 * Shipped as a static asset at /boot.js and loaded with <script defer>.
 * The variant name is injected by RizomSitePlugin via a tiny inline
 * <script> that sets `window.__RIZOM_VARIANT__` before this file runs.
 */
(function () {
  function init() {
    var variant = window.__RIZOM_VARIANT__ || "ai";
    if (document.body) {
      document.body.setAttribute("data-rizom-variant", variant);
    }

    // Scroll reveal — toggle .visible on .reveal elements as they enter view
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting) {
            e.target.classList.add("visible");
          }
        });
      },
      { threshold: 0.1, rootMargin: "0px 0px -40px 0px" },
    );
    document.querySelectorAll(".reveal").forEach(function (el) {
      io.observe(el);
    });

    // Side nav active-dot tracker (skipped on routes without SideNav)
    var dots = document.querySelectorAll(".side-nav-dot");
    if (dots.length > 0) {
      var ids = [
        "hero",
        "features",
        "answer",
        "ownership",
        "quickstart",
        "mission",
      ];
      var so = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (e) {
            if (!e.isIntersecting) return;
            var idx = ids.indexOf(e.target.id);
            if (idx < 0 || !dots[idx] || dots[idx].classList.contains("active"))
              return;
            dots.forEach(function (d) {
              d.classList.remove("active");
            });
            dots[idx].classList.add("active");
          });
        },
        { threshold: 0.4 },
      );
      ids.forEach(function (id) {
        var el = document.getElementById(id);
        if (el) so.observe(el);
      });
    }

    // Theme toggle — delegate actual flip to window.toggleTheme (injected
    // by site-builder), we just flip the button label and redraw canvases.
    var toggle = document.getElementById("themeToggle");
    if (toggle) {
      var syncLabel = function () {
        var isLight =
          document.documentElement.getAttribute("data-theme") === "light";
        toggle.textContent = isLight ? "\u263e Dark" : "\u2600 Light";
      };
      syncLabel();
      toggle.addEventListener("click", function () {
        if (typeof window.toggleTheme === "function") window.toggleTheme();
        syncLabel();
        if (typeof window.redrawAllCanvases === "function") {
          window.redrawAllCanvases();
        }
      });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
