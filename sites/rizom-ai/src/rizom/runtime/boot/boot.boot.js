/**
 * Rizom site boot script.
 *
 * Runs once at page load and wires up:
 *   1. Scroll-reveal IntersectionObserver → toggles `.visible` on `.reveal`
 *   2. Side-nav active-dot tracker (home route only)
 *   3. #themeToggle label sync on click (delegates theme flip to
 *      window.toggleTheme, which is defined by site-builder's inline
 *      FOUC-prevention script — see plugins/site-builder html-generator.ts)
 *
 * Shipped as a static asset at /boot.js and loaded with <script defer>.
 * Theme profile selection is applied separately via a tiny inline head
 * script that writes `data-theme-profile` onto <html> before this file runs.
 */
(function () {
  function init() {
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

    // Side nav active-dot tracker (skipped on routes without SideNav).
    // The dot → section mapping is derived from the rendered dots'
    // href attributes, so SideNav.tsx stays the single source of truth.
    var dots = document.querySelectorAll(".side-nav-dot");
    if (dots.length > 0) {
      var ids = Array.prototype.map.call(dots, function (d) {
        return (d.getAttribute("href") || "").replace(/^#/, "");
      });
      var so = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (e) {
            if (!e.isIntersecting) return;
            var idx = ids.indexOf(e.target.id);
            if (idx < 0 || dots[idx].classList.contains("active")) return;
            dots.forEach(function (d) {
              d.classList.remove("active");
            });
            dots[idx].classList.add("active");
          });
        },
        { threshold: 0.4 },
      );
      ids.forEach(function (id) {
        if (!id) return;
        var el = document.getElementById(id);
        if (el) so.observe(el);
      });
    }

    // Theme toggle — delegate actual flip to window.toggleTheme (injected
    // by site-builder), we just keep the button label in sync.
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
      });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
