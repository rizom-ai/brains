/**
 * Rizom site boot script.
 *
 * Runs once at page load and wires up:
 *   1. Scroll-reveal IntersectionObserver → toggles `.visible` on `.reveal`
 *   2. #themeToggle label sync on click (delegates theme flip to
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

    // Only this route owns the lantern and its responsive roadmap.
    var livingMemory = document.querySelector(".living-memory-page");
    if (livingMemory) {
      var card = livingMemory.querySelector(".lantern .card");
      if (card) {
        var tabs = Array.from(card.querySelectorAll('[role="tab"]'));
        var panels = Array.from(card.querySelectorAll('[role="tabpanel"]'));
        var current = card.querySelector(".meta-current");
        var select = function (index) {
          card.dataset.active = String(index);
          if (current) current.textContent = String(index + 1).padStart(2, "0");
          tabs.forEach(function (tab, i) {
            tab.setAttribute("aria-selected", String(i === index));
            tab.tabIndex = i === index ? 0 : -1;
            panels[i].setAttribute("aria-hidden", String(i !== index));
            panels[i].tabIndex = i === index ? 0 : -1;
          });
        };
        tabs.forEach(function (tab, index) {
          tab.addEventListener("click", function () {
            select(index);
          });
          tab.addEventListener("keydown", function (event) {
            var next = {
              ArrowRight: (index + 1) % tabs.length,
              ArrowLeft: (index + tabs.length - 1) % tabs.length,
              Home: 0,
              End: tabs.length - 1,
            }[event.key];
            if (next === undefined) return;
            event.preventDefault();
            select(next);
            tabs[next].focus();
          });
        });
      }
      var mobile = window.matchMedia("(max-width: 800px)");
      var setRoadmapMode = function () {
        livingMemory
          .querySelectorAll(".roadmap-detail")
          .forEach(function (detail) {
            detail.open = !mobile.matches;
          });
      };
      mobile.addEventListener("change", setRoadmapMode);
      setRoadmapMode();
      // Slice only the empty SVG frame; retain the live map's horizontal scale.
      var map = livingMemory.querySelector(".proximity-field > svg");
      if (map) map.setAttribute("preserveAspectRatio", "xMidYMid slice");
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
