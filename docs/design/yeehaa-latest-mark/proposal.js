// The newest piece on the map: on the live page, the mark of the most
// recently published piece gets the latest-mark ring, named either by a
// label above it (variant A) or by an entry in the legend (variant B).
(() => {
  const LATEST = {
    key: "post:a-colleague-without-context",
    kind: "essay",
    month: "June 2026",
  };
  const variant = window.LATEST_VARIANT ?? "B";
  const build = () => {
    const mark = document.querySelector(`[data-atlas-key="${LATEST.key}"]`);
    if (!mark || mark.classList.contains("atlas__mark--latest")) return;
    mark.classList.add("atlas__mark--latest");
    // Today this mark sits under the legend; the build keeps marks clear of it.
    mark.style.top = "86%";
    const title = mark.querySelector(".atlas__tip b")?.textContent ?? "";
    if (variant === "A") {
      const label = document.createElement("span");
      label.className = "atlas__latest";
      label.setAttribute("aria-hidden", "true");
      const name = document.createElement("b");
      name.textContent = title;
      const when = document.createElement("span");
      when.textContent = `Latest ${LATEST.kind}, ${LATEST.month}`;
      label.append(name, when);
      mark.append(label);
      return;
    }
    if (variant === "C") {
      // Only "Latest" in the legend; using it opens the ringed mark's card.
      const key = document.createElement("button");
      key.type = "button";
      key.className = "atlas__key--latest";
      const ring = document.createElement("i");
      ring.setAttribute("aria-hidden", "true");
      key.append(ring, "Latest");
      const open = (on) =>
        on
          ? mark.setAttribute("data-open", "")
          : mark.removeAttribute("data-open");
      key.addEventListener("mouseenter", () => open(true));
      key.addEventListener("mouseleave", () => open(false));
      // A tap opens it after the atlas's own outside-click close has run.
      key.addEventListener("click", () => setTimeout(() => open(true)));
      document.querySelector(".atlas__legend")?.append(key);
      return;
    }
    const key = document.createElement("a");
    key.className = "atlas__key--latest";
    key.href = mark.querySelector("a")?.getAttribute("href") ?? "#";
    const ring = document.createElement("i");
    ring.setAttribute("aria-hidden", "true");
    const text = document.createElement("span");
    const when = document.createElement("em");
    when.textContent = `, ${LATEST.month}`;
    text.append(`Newest: ${title}`, when);
    key.append(ring, text);
    document.querySelector(".atlas__legend")?.append(key);
  };
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", build);
  else build();
})();
