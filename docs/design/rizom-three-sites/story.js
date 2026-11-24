(function () {
  var ROOM = "data-ask-room",
    MARK = "data-ask-mark",
    CITED = "data-ask-cited";
  var SOURCE = "data-ask-source",
    SHEET = "data-ask-sheet",
    FLASH = "data-ask-flash";
  var SVG = "http://www.w3.org/2000/svg";
  var TURN = 1000; // a drawing's turn towards its sources, and a frame
  var GAP = 6; // between a listed source and its lead
  var GLYPH = 9; // a lead stops short of the mark it points at
  function media(query) {
    return typeof window.matchMedia === "function"
      ? window.matchMedia(query)
      : { matches: false };
  }
  var narrow = media("(max-width: 60rem)");
  var still = media("(prefers-reduced-motion: reduce)");
  function tell(target, name, detail) {
    target.dispatchEvent(
      new window.CustomEvent(name, { bubbles: true, detail: detail }),
    );
  }
  function flag(element, name, ms) {
    element.removeAttribute(name);
    // A fresh attribute restarts its animation.
    void element.offsetWidth;
    element.setAttribute(name, "");
    window.setTimeout(function () {
      element.removeAttribute(name);
    }, ms);
  }
  // A point is in view when it is on screen and no scrolling box hides it.
  function shown(element, middle) {
    if (middle < 0 || middle > window.innerHeight) return false;
    var parent = element.parentElement;
    while (parent && parent !== document.body) {
      var overflow = window.getComputedStyle(parent).overflowY;
      if (overflow === "auto" || overflow === "scroll") {
        var area = parent.getBoundingClientRect();
        if (middle < area.top || middle > area.bottom) return false;
      }
      parent = parent.parentElement;
    }
    return true;
  }

  Array.prototype.forEach.call(
    document.querySelectorAll("[" + ROOM + "]"),
    function (root) {
      var host = root.querySelector("[data-ask-box]");
      var drawing = root.querySelector("[data-ask-drawing]");
      var layer = root.querySelector("[data-ask-leads]");
      function marks() {
        return Array.prototype.slice.call(
          root.querySelectorAll("[" + MARK + "]"),
        );
      }
      function keyed(all, key) {
        return all.filter(function (m) {
          return m.getAttribute(MARK) === key;
        });
      }
      function label(mark) {
        var named = mark.hasAttribute("aria-label")
          ? mark
          : mark.querySelector("[aria-label]");
        return named
          ? String(named.getAttribute("aria-label")).toLowerCase()
          : "";
      }
      // The marks a source cites: by its id, by its brain's address, by its brain's name.
      function match(source) {
        var all = marks();
        var byId = keyed(all, source.id);
        if (byId.length) return { source: source, key: source.id, marks: byId };
        var brain = source.brain;
        if (!brain) return null;
        var address = "";
        if (brain.url) {
          try {
            address = new URL(brain.url).host;
          } catch (e) {
            address = "";
          }
        }
        var byAddress = address ? keyed(all, address) : [];
        if (byAddress.length)
          return { source: source, key: address, marks: byAddress };
        var name = String(brain.name || "").toLowerCase();
        var byName = name
          ? all.filter(function (m) {
              return label(m) === name;
            })
          : [];
        if (byName.length)
          return {
            source: source,
            key: byName[0].getAttribute(MARK),
            marks: byName,
          };
        return null;
      }
      var cited = [];
      function cite(sources) {
        var unmatched = [];
        var lit = [];
        cited = [];
        sources.forEach(function (source) {
          var found = match(source);
          if (!found) {
            unmatched.push(source);
            return;
          }
          cited.push(found);
          found.marks.forEach(function (m) {
            if (lit.indexOf(m) < 0) lit.push(m);
          });
        });
        marks().forEach(function (m) {
          if (lit.indexOf(m) >= 0) m.setAttribute(CITED, "");
          else m.removeAttribute(CITED);
        });
        tell(root, "ask:cited", {
          sources: sources,
          cited: cited,
          marks: lit,
          unmatched: unmatched,
        });
      }

      // The latest listing of a source in the box, and where its lead starts:
      // the listing, or its list's summary while the list is closed.
      function listed(id) {
        if (!host) return null;
        var rows = Array.prototype.filter.call(
          host.querySelectorAll("[" + SOURCE + "]"),
          function (row) {
            return row.getAttribute(SOURCE) === id;
          },
        );
        return rows.length ? rows[rows.length - 1] : null;
      }
      function anchor(id) {
        var row = listed(id);
        if (!row) return null;
        var list = row.closest("details");
        var from =
          list && !list.open ? list.querySelector("summary") || list : row;
        var box = from.getBoundingClientRect();
        return box.height && shown(from, box.top + box.height / 2) ? box : null;
      }
      function target(entry) {
        var own = drawing
          ? entry.marks.filter(function (m) {
              return drawing.contains(m);
            })
          : entry.marks;
        return own[0] || null;
      }
      function drawLeads() {
        if (!layer) return;
        while (layer.firstChild) layer.removeChild(layer.firstChild);
        if (narrow.matches || !host) return;
        var frame = layer.getBoundingClientRect();
        layer.setAttribute(
          "viewBox",
          "0 0 " + frame.width + " " + frame.height,
        );
        cited.forEach(function (entry) {
          var mark = target(entry);
          var from = mark ? anchor(entry.source.id) : null;
          if (!from) return;
          var to = mark.getBoundingClientRect();
          var y2 = to.top + to.height / 2;
          if (!shown(mark, y2)) return;
          var x1 = from.right + GAP - frame.left;
          var y1 = from.top + from.height / 2 - frame.top;
          var toward = to.left + to.width / 2 - frame.left;
          var x2 = toward > x1 ? toward - GLYPH : toward + GLYPH;
          y2 -= frame.top;
          var bend = Math.max(40, Math.abs(x2 - x1) / 2);
          var lead = document.createElementNS(SVG, "path");
          lead.setAttribute("data-lead", entry.source.id);
          lead.setAttribute(
            "d",
            "M" +
              x1 +
              " " +
              y1 +
              " C" +
              (x1 + bend) +
              " " +
              y1 +
              " " +
              (x2 - bend) +
              " " +
              y2 +
              " " +
              x2 +
              " " +
              y2,
          );
          layer.appendChild(lead);
        });
      }
      var pending = false;
      function scheduleLeads() {
        if (pending || !layer) return;
        pending = true;
        window.requestAnimationFrame(function () {
          pending = false;
          drawLeads();
        });
      }
      // While the drawing turns towards its sources, its marks move under the leads every frame.
      function followLeads(until) {
        drawLeads();
        if (layer && cited.length && Date.now() < until)
          window.requestAnimationFrame(function () {
            followLeads(until);
          });
      }
      if (layer) {
        window.addEventListener("resize", scheduleLeads);
        // Scrolling the page or the conversation moves the listed sources.
        document.addEventListener("scroll", scheduleLeads, true);
        // Opening or closing a source list moves where its leads start.
        document.addEventListener("toggle", scheduleLeads, true);
        if (narrow.addEventListener)
          narrow.addEventListener("change", scheduleLeads);
        if (host && typeof window.ResizeObserver === "function")
          new window.ResizeObserver(scheduleLeads).observe(host);
      }

      document.addEventListener("ask:sources", function (event) {
        if (event.target !== document && !root.contains(event.target)) return;
        var detail = event.detail || {};
        cite(Array.isArray(detail.sources) ? detail.sources : []);
        followLeads(Date.now() + TURN);
      });

      function sheetOpen() {
        return !!host && host.hasAttribute(SHEET);
      }
      var slot = null;
      function lend() {
        var dock = host.querySelector("[data-ask-dock]");
        if (!drawing || !dock || drawing.parentElement === dock) return;
        slot = document.createElement("div");
        slot.setAttribute("data-ask-slot", "");
        slot.setAttribute("aria-hidden", "true");
        drawing.parentNode.insertBefore(slot, drawing);
        dock.appendChild(drawing);
        tell(root, "ask:lent", { drawing: drawing, dock: dock });
      }
      function giveBack() {
        if (!slot) return;
        slot.parentNode.insertBefore(drawing, slot);
        slot.parentNode.removeChild(slot);
        slot = null;
        tell(root, "ask:returned", { drawing: drawing });
      }
      if (host && drawing && typeof window.MutationObserver === "function") {
        // The box mounts, and so its dock appears, after the sheet has opened.
        new window.MutationObserver(function () {
          if (sheetOpen()) lend();
          else giveBack();
        }).observe(host, {
          attributes: true,
          attributeFilter: [SHEET],
          childList: true,
          subtree: true,
        });
      }

      root.addEventListener("click", function (event) {
        var hit = event.target;
        if (!sheetOpen() || !hit || !hit.closest) return;
        var mark = hit.closest("[" + MARK + "]");
        if (
          !mark ||
          !mark.hasAttribute(CITED) ||
          (drawing && !drawing.contains(mark))
        )
          return;
        var aim = mark.querySelector("[data-ask-aim]");
        if (aim && !aim.contains(hit)) return;
        var entry = cited.filter(function (e) {
          return e.marks.indexOf(mark) >= 0;
        })[0];
        var area = host.querySelector(".brain-box-scroll");
        var row = entry ? listed(entry.source.id) : null;
        if (!row || !area) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        var at = row.getBoundingClientRect(),
          box = area.getBoundingClientRect();
        // Its source in the middle of the conversation, flashing.
        var top =
          area.scrollTop +
          at.top -
          box.top -
          area.clientHeight / 2 +
          at.height / 2;
        if (area.scrollTo)
          area.scrollTo({
            top: top,
            behavior: still.matches ? "auto" : "smooth",
          });
        else area.scrollTop = top;
        flag(row, FLASH, 1500);
        tell(root, "ask:aimed", { mark: mark, source: row });
      });
    },
  );
})();
(function () {
  function currentChapter(tops, line, stageCount = Number.POSITIVE_INFINITY) {
    const passed = tops.reduce(
      (current, top, i) => (top <= line ? i : current),
      0,
    );
    return Math.min(passed, Math.max(0, stageCount - 1));
  }
  function readingLine(viewportHeight, stripBottom) {
    const beside = 0.45;
    return stripBottom === null ? viewportHeight * beside : stripBottom + 1;
  }
  function init() {
    var story = document.querySelector(".story");
    if (!story) return;
    var chapters = Array.prototype.slice.call(
      story.querySelectorAll(".chapter"),
    );
    if (!chapters.length) return;
    var figure = story.querySelector(".figure");
    var stageCount = figure
      ? Number(figure.dataset.stages || chapters.length)
      : chapters.length;
    var rail = document.querySelector(".rail");
    var railNodes = [];
    var railRoot, railSpark, railSvg;
    if (rail) {
      railSvg = rail.querySelector(".rail__svg");
      railRoot = rail.querySelector(".rail__root");
      railSpark = rail.querySelector(".rail__spark");
      var list = rail.querySelector(".rail__nodes");
      chapters.forEach(function (chapter, i) {
        if (!chapter.id) chapter.id = "chapter-" + (i + 1);
        var name =
          chapter.querySelector(".eyebrow") || chapter.querySelector("h2, h1");
        var text =
          chapter.dataset.title || (name ? name.textContent.trim() : "");
        var li = document.createElement("li");
        li.className = "rail__node";
        li.innerHTML =
          '<a href="#' +
          chapter.id +
          '"><span class="rail__dot"></span><span class="rail__name"></span></a>';
        li.querySelector(".rail__name").textContent = text || "Top";
        list.appendChild(li);
        railNodes.push(li);
      });
    }
    var railLength = railRoot ? railRoot.getTotalLength() : 0;
    function railPoint(t) {
      return railRoot.getPointAtLength(
        Math.min(1, Math.max(0, t)) * railLength,
      );
    }
    function placeRail() {
      if (!rail) return;
      var box = railSvg.viewBox.baseVal,
        rect = railSvg.getBoundingClientRect();
      var max = document.documentElement.scrollHeight - innerHeight;
      chapters.forEach(function (chapter, i) {
        var t =
          max > 0
            ? (chapter.getBoundingClientRect().top +
                scrollY -
                readingLine(innerHeight, null)) /
              max
            : 0;
        var p = railPoint(t);
        railNodes[i].style.left = (p.x / box.width) * rect.width + "px";
        railNodes[i].style.top = (p.y / box.height) * rect.height + "px";
      });
    }
    function stripBottom() {
      if (
        !figure ||
        !getComputedStyle(figure).getPropertyValue("--strip").trim()
      )
        return null;
      return figure.getBoundingClientRect().bottom;
    }
    function read() {
      var line = readingLine(innerHeight, stripBottom());
      var tops = chapters.map(function (chapter) {
        return chapter.getBoundingClientRect().top;
      });
      var current = currentChapter(tops, line);
      var stage = currentChapter(tops, line, stageCount);
      if (figure) figure.dataset.stage = String(stage);
      chapters.forEach(function (chapter, i) {
        chapter.classList.toggle("is-current", i === current);
      });
      // A chapter that lights the network keeps the live drawing in view while it is read.
      story.classList.toggle(
        "is-asked",
        !!(
          chapters[current] &&
          chapters[current].hasAttribute("data-lights-network")
        ),
      );
      if (!rail) return;
      var max = document.documentElement.scrollHeight - innerHeight;
      var progress = max > 0 ? Math.min(1, scrollY / max) : 0;
      rail.style.setProperty("--read", progress.toFixed(4));
      var tip = railPoint(progress);
      railSpark.setAttribute("cx", tip.x);
      railSpark.setAttribute("cy", tip.y);
      railNodes.forEach(function (node, i) {
        node.classList.toggle("is-passed", i < current);
        node.classList.toggle("is-current", i === current);
      });
    }
    placeRail();
    read();
    addEventListener("scroll", read, { passive: true });
    addEventListener("resize", function () {
      placeRail();
      read();
    });
    addEventListener("load", function () {
      placeRail();
      read();
    });
  }
  // The homepage's drawings listen to the Ask room: an answer's sources name
  // the brains whose published memory they came from (the room matches them
  // to the opening's dots, keyed by brain, and tells the page), and those
  // brains light in every drawing while the rest dim. A source the room
  // matched to no brain is this brain's own and lights the center. Pointing
  // works both ways: a listed source lights its brain, a brain flags its
  // listed sources. Leads, the lending of the drawing to a phone's open
  // conversation and the tap on a lit dot are the room's.
  function listen() {
    // The opening draws the network, and a chapter may draw it again beside
    // its own words: every drawing answers the same events.
    var layers = Array.prototype.slice.call(
      document.querySelectorAll(".net-layer"),
    );
    if (!layers.length) return;
    function all(selector) {
      return layers.reduce(function (found, layer) {
        return found.concat(
          Array.prototype.slice.call(layer.querySelectorAll(selector)),
        );
      }, []);
    }
    var marks = all(".net-mark[data-brain]");
    var threads = all(".net-thread[data-brain]");
    var replies = all(".net-reply[data-brain]");
    var names = all(".net-name[data-brain]");
    var sourceBrain = {};
    function light(id, on) {
      [marks, threads, replies, names].forEach(function (list) {
        list.forEach(function (el) {
          if (el.getAttribute("data-brain") === id)
            el.classList.toggle("is-lit", on);
        });
      });
    }
    function hot(id, on) {
      marks.concat(threads).forEach(function (el) {
        if (el.getAttribute("data-brain") === id)
          el.classList.toggle("is-hot", on);
      });
    }
    document.addEventListener("ask:cited", function (event) {
      var detail = event.detail || {};
      var lit = {};
      sourceBrain = {};
      (detail.cited || []).forEach(function (entry) {
        lit[entry.key] = true;
        sourceBrain[entry.source.id] = entry.key;
      });
      marks.forEach(function (m) {
        light(
          m.getAttribute("data-brain"),
          !!lit[m.getAttribute("data-brain")],
        );
      });
      var rizom =
        (detail.unmatched || []).length > 0 &&
        (detail.sources || []).length > 0;
      layers.forEach(function (layer) {
        layer.classList.toggle("has-replies", Object.keys(lit).length > 0);
        layer.classList.toggle("is-rizom", rizom);
      });
    });
    function listed(target) {
      var row =
        target && target.closest ? target.closest("[data-ask-source]") : null;
      return row ? row : null;
    }
    function point(event, on) {
      var row = listed(event.target);
      if (row) {
        var id = sourceBrain[row.getAttribute("data-ask-source")];
        if (id) hot(id, on);
        return;
      }
      var mark =
        event.target && event.target.closest
          ? event.target.closest(".net-mark[data-brain]")
          : null;
      if (!mark) return;
      var brain = mark.getAttribute("data-brain");
      hot(brain, on);
      Object.keys(sourceBrain).forEach(function (key) {
        if (sourceBrain[key] !== brain) return;
        Array.prototype.forEach.call(
          document.querySelectorAll("[data-ask-source]"),
          function (row) {
            if (row.getAttribute("data-ask-source") !== key) return;
            if (on) row.setAttribute("data-ask-hot", "");
            else row.removeAttribute("data-ask-hot");
          },
        );
      });
    }
    // "Asked before": an open question's kept sources light the drawing the
    // way a fresh answer's do; with no question open, the drawing rests.
    function askedSources() {
      var open = document.querySelector("details[data-ask-answer][open]");
      if (!open) return [];
      try {
        var kept = JSON.parse(open.getAttribute("data-ask-answer") || "[]");
        return Array.isArray(kept) ? kept : [];
      } catch (e) {
        return [];
      }
    }
    document.addEventListener(
      "toggle",
      function (event) {
        var target = event.target;
        if (
          !target ||
          !target.hasAttribute ||
          !target.hasAttribute("data-ask-answer")
        )
          return;
        document.dispatchEvent(
          new CustomEvent("ask:sources", {
            detail: { sources: askedSources() },
          }),
        );
      },
      true,
    );
    document.addEventListener("mouseover", function (e) {
      point(e, true);
    });
    document.addEventListener("mouseout", function (e) {
      point(e, false);
    });
    document.addEventListener("focusin", function (e) {
      point(e, true);
    });
    document.addEventListener("focusout", function (e) {
      point(e, false);
    });
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      init();
      listen();
    });
  } else {
    init();
    listen();
  }
})();
