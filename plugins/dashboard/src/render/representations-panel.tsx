/** @jsxImportSource preact */
import type { JSX } from "preact";

export function RepresentationsPanel(): JSX.Element {
  return (
    <section
      id="my-agents"
      class="dashboard-tab-panel people-panel"
      data-dashboard-tab-panel
      data-representations-panel="true"
      data-representations-endpoint="/auth/representations"
    >
      <header class="people-head">
        <div>
          <div class="eyebrow">Your consent</div>
          <h2>My agents</h2>
          <p>
            Review agents that represent your person. Pending links remain
            inactive until you approve them.
          </p>
        </div>
      </header>
      <div class="card people-roster" data-representations-list>
        <p class="people-empty">Loading representation requests…</p>
      </div>
      <p class="people-feedback" data-representations-feedback hidden />
    </section>
  );
}

export const DASHBOARD_REPRESENTATIONS_SCRIPT = `(function () {
  var panel = document.querySelector("[data-representations-panel]");
  if (!panel) return;
  var endpoint = panel.getAttribute("data-representations-endpoint");
  var list = panel.querySelector("[data-representations-list]");
  var feedback = panel.querySelector("[data-representations-feedback]");

  function node(tag, className, text) {
    var element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function label(value) {
    return value.slice(0, 1).toUpperCase() + value.slice(1);
  }

  function setFeedback(message, tone) {
    feedback.textContent = message;
    feedback.className = "people-feedback" + (tone ? " people-feedback--" + tone : "");
    feedback.hidden = false;
  }

  async function parseResponse(response) {
    var body;
    try { body = await response.json(); } catch (_) { body = {}; }
    if (!response.ok) throw new Error(body.error || "Representation request failed");
    return body;
  }

  async function accept(agentId) {
    if (!window.confirm("Allow this agent to represent your person?")) return;
    await parseResponse(await fetch(endpoint, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "acceptRepresentation",
        confirmation: "acceptRepresentation",
        agentId: agentId
      })
    }));
    await load();
    setFeedback("Agent representation accepted", "good");
  }

  function render(representations) {
    list.replaceChildren();
    if (!representations.length) {
      list.append(node("p", "people-empty", "No agents are linked to your person."));
      return;
    }
    representations.forEach(function (representation) {
      var row = node("div", "people-access-item");
      var copy = node("div");
      copy.append(node("div", "people-access-kind", "Agent"));
      copy.append(node("div", "people-access-value", representation.agentId + " · " + label(representation.status)));
      row.append(copy);
      if (representation.status === "pending") {
        var button = node("button", "people-button people-button--primary", "Accept");
        button.type = "button";
        button.addEventListener("click", function () {
          accept(representation.agentId).catch(function (error) {
            setFeedback(error.message, "error");
          });
        });
        row.append(button);
      }
      list.append(row);
    });
  }

  async function load() {
    try {
      var data = await parseResponse(await fetch(endpoint, {
        credentials: "same-origin",
        cache: "no-store"
      }));
      render(data.representations || []);
    } catch (error) {
      list.replaceChildren(node("p", "people-empty people-empty--error", error.message));
    }
  }

  load();
})();`;
