/**
 * The page's motion, as the design has it: acts rise into view as they
 * scroll in, the arch, the discs and the photos drift at their own pace
 * (both only where view timelines exist), the pointer is a wand and a short
 * trail of mustard sparks follows it. Reduced motion stops all of it (see ./styles);
 * touch screens get no sparks.
 */
const WAND_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><path d="M10 10 L28 28" stroke="#FFFFFF" stroke-width="5" stroke-linecap="round"/><path d="M10 10 L28 28" stroke="#232323" stroke-width="2.4" stroke-linecap="round"/><path d="M23 23 L28 28" stroke="#D6C91D" stroke-width="2.4" stroke-linecap="round"/><path d="M5 0.5 L6.3 3.7 L9.5 5 L6.3 6.3 L5 9.5 L3.7 6.3 L0.5 5 L3.7 3.7 Z" fill="#EF5959" stroke="#FFFFFF" stroke-width="0.8"/></svg>`;

const WAND_CURSOR = `url("data:image/svg+xml,${encodeURIComponent(WAND_SVG)}") 5 5, auto`;

export const motionCSS: string = `
.tf-site, .tf-site a, .tf-site button { cursor: ${WAND_CURSOR}; }
.tf-spark { position: absolute; z-index: 50; width: 9px; height: 9px; pointer-events: none; background: var(--palette-mustard); clip-path: polygon(50% 0, 60% 40%, 100% 50%, 60% 60%, 50% 100%, 40% 60%, 0 50%, 40% 40%); animation: tf-spark 0.8s ease-out both; }
@keyframes tf-spark { 0% { opacity: 1; transform: translate(-50%, -50%) scale(1); } 100% { opacity: 0; transform: translate(-50%, 8px) scale(0.2) rotate(90deg); } }
@keyframes tf-rise { from { opacity: 0; transform: translateY(32px); } to { opacity: 1; transform: none; } }
@keyframes tf-drift-up { from { transform: translateY(60px); } to { transform: translateY(-60px); } }
@keyframes tf-drift-down { from { transform: translateY(-40px); } to { transform: translateY(40px); } }
@supports (animation-timeline: view()) {
  .tf-reveal { animation: tf-rise linear both; animation-timeline: view(); animation-range: entry 0% cover 25%; }
  .tf-l1 { animation: tf-drift-up linear both; animation-timeline: view(); animation-range: cover 0% cover 100%; }
  .tf-l3 { animation: tf-drift-down linear both; animation-timeline: view(); animation-range: cover 0% cover 100%; }
}
`;

export const sparkScript: string = `<script>
(function () {
  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  var count = 0;
  var last = 0;
  function boot() {
    var site = document.querySelector(".tf-site");
    if (!site) return;
    var sparks = [];
    site.addEventListener("pointermove", function (event) {
      if (event.pointerType !== "mouse") return;
      var now = Date.now();
      if (now - last < 45) return;
      last = now;
      var box = site.getBoundingClientRect();
      var spark = sparks[count % 14];
      if (!spark) {
        spark = document.createElement("span");
        spark.setAttribute("aria-hidden", "true");
        site.appendChild(spark);
        sparks.push(spark);
      }
      spark.className = "";
      void spark.offsetWidth;
      spark.className = "tf-spark";
      spark.style.left = Math.round(event.clientX - box.left + 4) + "px";
      spark.style.top = Math.round(event.clientY - box.top + 4) + "px";
      count += 1;
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
</script>`;

/**
 * The keys fly to the keyhole, which sits wherever the headline wraps it, so
 * this measures its offset from the stage's center into --dx on load and on
 * every resize. Without it the keys use the design's default offset.
 */
export const keyholeScript: string = `<script>
(function () {
  function measure() {
    var keyhole = document.querySelector("[data-tf-keyhole]");
    var stage = document.querySelector("[data-tf-stage]");
    var keys = document.querySelector(".tf-keys");
    if (!keyhole || !stage || !keys) return;
    var a = keyhole.getBoundingClientRect();
    var b = stage.getBoundingClientRect();
    if (!b.width) return;
    keys.style.setProperty("--dx", Math.round(a.left + a.width / 2 - (b.left + b.width / 2)) + "px");
  }
  function boot() { measure(); window.addEventListener("resize", measure); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
</script>`;
