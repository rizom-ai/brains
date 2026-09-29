// The styling pass's copy and small DOM changes on the live preview; see proposal.css.
(() => {
  const WAITING = "Looking through the essays and talks";
  const NOTE = "Answers use published work only. Leave private details out.";
  // Stands in for the publish-status filter: this draft is not on yeehaa.io.
  const DRAFTS = ["the-machine-finds-the-cracks"];
  const apply = () => {
    for (const waiting of document.querySelectorAll(".brain-box-waiting")) {
      const text = [...waiting.childNodes].find((node) => node.nodeType === 3);
      if (text && text.textContent !== WAITING) text.textContent = WAITING;
    }
    for (const hint of document.querySelectorAll(".brain-box-hint:not(.invalid)")) {
      if (hint.textContent !== NOTE) hint.textContent = NOTE;
    }
    for (const box of document.querySelectorAll(".atlas__ask textarea")) {
      if (!box.placeholder) box.placeholder = "Ask about my work…";
    }
    for (const source of document.querySelectorAll(".brain-box-sources li")) {
      const href = source.querySelector("a")?.getAttribute("href") ?? "";
      if (DRAFTS.some((slug) => href.endsWith("/" + slug))) source.dataset.proposalDraft = "";
    }
  };
  document.addEventListener("DOMContentLoaded", () => {
    apply();
    new MutationObserver(apply).observe(document.body, { childList: true, subtree: true, characterData: true });
  });
})();
