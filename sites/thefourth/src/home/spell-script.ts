/**
 * The spell, in the browser: on "Unlock it" every word of the jargon
 * sentence flies apart on the paper, the jargon struck out, and after a
 * beat the keyhole opens onto the translation; "Try another" draws the next
 * sentence. The scatter is seeded by word and spell, as in the design, so it
 * lands the same way every time, and narrows with the viewport so the words
 * stay on a phone's screen. A spell in a language written without spaces
 * scatters the words it lists. Reduced motion skips the flight.
 * Without the script the jargon sentence stands alone, buttons hidden.
 */
export const spellScript: string = `<script>
(function () {
  function init(root) {
    var data = root.querySelector("[data-tf-spells]");
    var spells;
    try { spells = JSON.parse(data.textContent || "[]"); } catch (error) { return; }
    if (!spells.length) return;
    var words = root.querySelector(".tf-spell__words");
    var after = root.querySelector(".tf-spell__after");
    var main = root.querySelector("[data-tf-main]");
    var sub = root.querySelector("[data-tf-sub]");
    var counter = root.querySelector("[data-tf-counter]");
    var still = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var index = 0;
    var timer = null;
    function pad(value) { return (value < 10 ? "0" : "") + value; }
    function draw() {
      var spell = spells[index];
      var listed = spell.words && spell.words.length > 0;
      var parts = listed ? spell.words : spell.before.split(" ");
      var jargon = spell.jargon.map(function (word) { return word.toLowerCase(); });
      words.setAttribute("aria-label", spell.before);
      words.textContent = "";
      parts.forEach(function (word, i) {
        var span = document.createElement("span");
        span.className = "tf-word";
        span.setAttribute("aria-hidden", "true");
        span.setAttribute("data-jargon", jargon.indexOf(word.toLowerCase()) === -1 ? "false" : "true");
        span.textContent = !listed && i < parts.length - 1 ? word + " " : word;
        words.appendChild(span);
      });
      after.setAttribute("data-light", spell.light);
      main.textContent = spell.main;
      sub.textContent = spell.sub;
      counter.textContent = spell.sector + " · " + pad(index + 1) + "/" + pad(spells.length);
      root.classList.remove("tf-spell--broken", "tf-spell--after");
    }
    function scatter() {
      var k = Math.max(0.35, Math.min(1, window.innerWidth / 1300));
      Array.prototype.forEach.call(words.children, function (span, i) {
        var h = Math.sin((i + 1) * 12.9898 + index * 3.1) * 43758.5453;
        var r1 = h - Math.floor(h);
        var r2 = (r1 * 7.3) % 1;
        var jargon = span.getAttribute("data-jargon") === "true";
        span.style.transform = "translate(" + Math.round((r1 - 0.5) * 520 * k) + "px, " +
          Math.round((r2 - 0.35) * 320 * k) + "px) rotate(" + Math.round((r1 - 0.5) * 60) + "deg) scale(" +
          (jargon ? 1.05 : 0.8) + ")";
      });
    }
    root.querySelector("[data-tf-break]").addEventListener("click", function () {
      if (root.classList.contains("tf-spell--broken")) return;
      root.classList.add("tf-spell--broken");
      if (!still) scatter();
      timer = setTimeout(function () { root.classList.add("tf-spell--after"); }, still ? 0 : 1150);
    });
    root.querySelector("[data-tf-next]").addEventListener("click", function () {
      clearTimeout(timer);
      index = (index + 1) % spells.length;
      draw();
    });
    root.classList.add("tf-spell--ready");
  }
  function boot() { Array.prototype.forEach.call(document.querySelectorAll("[data-tf-spell]"), init); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
</script>`;
