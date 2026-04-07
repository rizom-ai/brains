/**
 * Rizom site boot script.
 *
 * Runs once at page load and wires up:
 *   1. `data-rizom-variant` on <body> (value substituted at load time)
 *   2. `data-theme` on <html> (from localStorage, default dark)
 *   3. Scroll-reveal IntersectionObserver → toggles `.visible` on `.reveal`
 *   4. Side-nav active-dot tracker
 *   5. #themeToggle click handler
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

    // Apply saved theme to <html>
    var saved = localStorage.getItem("theme") || "dark";
    document.documentElement.setAttribute("data-theme", saved);

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

    // Side nav active-dot tracker
    var dots = document.querySelectorAll(".side-nav-dot");
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
          if (e.isIntersecting) {
            var idx = ids.indexOf(e.target.id);
            if (idx >= 0) {
              dots.forEach(function (d) {
                d.classList.remove("active");
              });
              if (dots[idx]) dots[idx].classList.add("active");
            }
          }
        });
      },
      { threshold: 0.4 },
    );
    ids.forEach(function (id) {
      var el = document.getElementById(id);
      if (el) so.observe(el);
    });

    // Theme toggle
    var toggle = document.getElementById("themeToggle");
    if (toggle) {
      if (saved === "light") toggle.textContent = "\u263e Dark";
      toggle.addEventListener("click", function () {
        var next =
          document.documentElement.getAttribute("data-theme") === "light"
            ? "dark"
            : "light";
        document.documentElement.setAttribute("data-theme", next);
        localStorage.setItem("theme", next);
        toggle.textContent = next === "light" ? "\u263e Dark" : "\u2600 Light";
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
