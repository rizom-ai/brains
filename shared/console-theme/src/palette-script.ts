/**
 * Inline script for the cross-surface jump palette. Opens from the strip's
 * command chip or ⌘K/Ctrl+K, queries the authenticated /api/console/jump
 * endpoint, and renders grouped doors (entities → CMS, tabs → dashboard).
 * The hosting surface may define window.__consoleJumpLocal(query) to append
 * its own groups (e.g. chat conversations). Styled by the console sheet.
 */
export const CONSOLE_PALETTE_SCRIPT = `(function () {
  var ENDPOINT = "/api/console/jump";
  var overlay = null, input = null, groupsEl = null, returnFocus = null;
  var rows = [], selected = 0, debounceTimer = null, requestSeq = 0;

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  function ensureDom() {
    if (overlay) return;
    overlay = el("div", "console-palette-overlay");
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", "Search the console");
    var palette = el("div", "console-palette");
    var inputRow = el("div", "cp-input-row");
    input = el("input", "cp-input");
    input.type = "text";
    input.placeholder = "Search entities, tabs, surfaces\\u2026";
    input.setAttribute("aria-label", "Search the console");
    inputRow.appendChild(input);
    inputRow.appendChild(el("kbd", "cp-esc", "esc"));
    groupsEl = el("div", "cp-groups");
    var foot = el("div", "cp-foot");
    foot.appendChild(el("span", null, "\\u2191\\u2193 navigate"));
    foot.appendChild(el("span", null, "\\u21B5 open"));
    foot.appendChild(el("span", null, "one index across the console"));
    palette.appendChild(inputRow);
    palette.appendChild(groupsEl);
    palette.appendChild(foot);
    overlay.appendChild(palette);
    document.body.appendChild(overlay);

    overlay.addEventListener("mousedown", function (event) {
      if (event.target === overlay) close();
    });
    input.addEventListener("input", function () {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(function () { query(input.value); }, 150);
    });
    input.addEventListener("keydown", function (event) {
      if (event.key === "ArrowDown") { event.preventDefault(); move(1); }
      else if (event.key === "ArrowUp") { event.preventDefault(); move(-1); }
      else if (event.key === "Enter") {
        event.preventDefault();
        var row = rows[selected];
        if (row) window.location.href = row.getAttribute("href");
      }
    });
  }

  function open() {
    ensureDom();
    returnFocus = document.activeElement;
    overlay.classList.add("is-open");
    document.documentElement.classList.add("console-palette-open");
    input.value = "";
    input.focus();
    query("");
  }

  function close() {
    if (overlay) overlay.classList.remove("is-open");
    document.documentElement.classList.remove("console-palette-open");
    if (returnFocus && typeof returnFocus.focus === "function") returnFocus.focus();
    returnFocus = null;
  }

  function isOpen() {
    return Boolean(overlay && overlay.classList.contains("is-open"));
  }

  function move(delta) {
    if (!rows.length) return;
    rows[selected].classList.remove("is-selected");
    selected = (selected + delta + rows.length) % rows.length;
    rows[selected].classList.add("is-selected");
    rows[selected].scrollIntoView({ block: "nearest" });
  }

  function glyphFor(label) {
    var normalized = String(label || "").toLowerCase();
    if (normalized.indexOf("entit") !== -1) return "◆";
    if (normalized.indexOf("dashboard") !== -1) return "▤";
    if (normalized.indexOf("conversation") !== -1) return "◌";
    return "↗";
  }

  function appendHighlighted(node, title) {
    var value = input ? input.value.trim() : "";
    if (!value) { node.textContent = title; return; }
    var index = title.toLowerCase().indexOf(value.toLowerCase());
    if (index === -1) { node.textContent = title; return; }
    node.appendChild(document.createTextNode(title.slice(0, index)));
    node.appendChild(el("mark", null, title.slice(index, index + value.length)));
    node.appendChild(document.createTextNode(title.slice(index + value.length)));
  }

  function render(groups) {
    groupsEl.textContent = "";
    rows = [];
    selected = 0;
    groups.forEach(function (group) {
      if (!group || !group.items || !group.items.length) return;
      var groupEl = el("section", "cp-group");
      groupEl.appendChild(el("div", "cp-group-title", group.label));
      group.items.forEach(function (item) {
        var row = el("a", "cp-row");
        var title = el("span", "cp-title");
        row.setAttribute("href", item.href);
        row.appendChild(el("span", "cp-glyph", glyphFor(group.label)));
        appendHighlighted(title, item.title);
        row.appendChild(title);
        if (item.sub) row.appendChild(el("span", "cp-sub", item.sub));
        if (item.tag) row.appendChild(el("span", "cp-tag", item.tag));
        groupEl.appendChild(row);
        rows.push(row);
      });
      groupsEl.appendChild(groupEl);
    });
    if (!rows.length) {
      groupsEl.appendChild(el("div", "cp-empty", "Nothing matches yet."));
    } else {
      rows[0].classList.add("is-selected");
    }
  }

  function query(value) {
    var seq = ++requestSeq;
    fetch(ENDPOINT + "?q=" + encodeURIComponent(value), { credentials: "same-origin" })
      .then(function (response) {
        if (response.status === 401) {
          return { groups: [{ label: "Session", items: [{
            title: "Sign in to search the console",
            href: "/login?return_to=" + encodeURIComponent(window.location.pathname),
            tag: "passkey",
          }] }] };
        }
        return response.json();
      })
      .then(function (data) {
        if (seq !== requestSeq || !isOpen()) return;
        var groups = (data && data.groups) || [];
        var local = window.__consoleJumpLocal;
        if (typeof local === "function") {
          try { groups = groups.concat(local(value) || []); } catch (e) { /* local groups are best-effort */ }
        }
        render(groups);
      })
      .catch(function () {
        if (seq !== requestSeq || !isOpen()) return;
        render([]);
      });
  }

  document.addEventListener("keydown", function (event) {
    if ((event.metaKey || event.ctrlKey) && event.key === "k") {
      event.preventDefault();
      if (isOpen()) close(); else open();
    } else if (event.key === "Escape" && isOpen()) {
      close();
    }
  });

  document.addEventListener("click", function (event) {
    var chip = event.target && event.target.closest && event.target.closest(".command-chip");
    if (chip) { event.preventDefault(); open(); }
  });
})();`;
