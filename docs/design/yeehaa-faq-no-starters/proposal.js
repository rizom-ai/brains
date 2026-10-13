// No starters, FAQs closed: on the live preview, the opening loses
// "Where would you start?" and its questions, and the FAQ band becomes a
// stacked list with every question closed. The band is replaced by a copy
// so the current side-by-side reader script no longer drives it.
(() => {
  const build = () => {
    document.querySelector(".atlas__door h2")?.remove();
    document.querySelector(".atlas__topics")?.remove();
    const band = document.querySelector("[data-atlas-faqs]");
    if (!band || band.dataset.mock) return;
    const copy = band.cloneNode(true);
    copy.dataset.mock = "";
    copy.removeAttribute("data-split");
    copy.querySelector("[data-atlas-faqs-reader]")?.remove();
    copy
      .querySelectorAll("details")
      .forEach((details) => details.removeAttribute("open"));
    band.replaceWith(copy);
  };
  document.addEventListener("DOMContentLoaded", () => setTimeout(build, 50));
})();
