/** @jsxImportSource preact */
import type { JSX } from "preact";

export function PeoplePanel(): JSX.Element {
  return (
    <section
      id="people"
      class="dashboard-tab-panel people-panel"
      data-dashboard-tab-panel
      data-people-panel="true"
      data-users-endpoint="/auth/admin/users"
      data-mutations-endpoint="/auth/admin/mutations"
    >
      <header class="people-head">
        <div>
          <div class="eyebrow">Anchor access</div>
          <h2>People</h2>
          <p>
            Manage each person’s profile, access, and linked agent
            representatives.
          </p>
        </div>
        <button
          class="people-button people-button--primary"
          type="button"
          data-people-add
        >
          Add person
        </button>
      </header>

      <div class="people-layout">
        <section class="card people-roster" aria-label="People list">
          <header class="people-card-head">
            <span class="people-card-title">Access roster</span>
            <span class="people-count" data-people-count>
              —
            </span>
          </header>
          <div class="people-list" data-people-list="true" aria-live="polite">
            <p class="people-empty">Loading people…</p>
          </div>
        </section>

        <section
          class="card people-detail"
          data-people-detail="true"
          aria-live="polite"
        >
          <div class="people-detail-empty">
            <p>Select a person to inspect their access.</p>
          </div>
        </section>
      </div>

      <p class="people-feedback" data-people-feedback role="status" hidden />

      <dialog id="people-add-dialog" class="people-dialog">
        <form method="dialog" data-people-add-form>
          <header>
            <div class="eyebrow">New access</div>
            <h3>Add a person</h3>
            <p>Create access first; attach an identity or passkey next.</p>
          </header>
          <div class="people-dialog-body">
            <label>
              <span>Display name</span>
              <input name="displayName" maxlength={200} required />
            </label>
            <label>
              <span>Initial role</span>
              <select name="role">
                <option value="public">Public</option>
                <option value="trusted" selected>
                  Trusted
                </option>
                <option value="anchor">Anchor</option>
              </select>
            </label>
            <p class="people-warning">
              Adding an Anchor grants full administration and restricted-content
              access.
            </p>
          </div>
          <footer>
            <button
              class="people-button"
              value="cancel"
              type="button"
              data-dialog-cancel
            >
              Cancel
            </button>
            <button class="people-button people-button--primary" type="submit">
              Create person
            </button>
          </footer>
        </form>
      </dialog>

      <dialog id="people-promote-agent-dialog" class="people-dialog">
        <form method="dialog" data-people-promote-agent-form>
          <header>
            <div class="eyebrow">Agent → user promotion</div>
            <h3>Grant represented person access</h3>
            <p>
              Create an invited user from this agent’s represented person, then
              send the one-time claim link privately.
            </p>
          </header>
          <div class="people-dialog-body">
            <label>
              <span>Agent</span>
              <input name="agentLabel" readOnly />
              <input name="agentId" type="hidden" />
            </label>
            <label>
              <span>Represented person</span>
              <input name="displayName" maxlength={200} required />
            </label>
            <label>
              <span>Initial role</span>
              <select name="role">
                <option value="public">Public</option>
                <option value="trusted" selected>
                  Trusted
                </option>
                <option value="anchor">Anchor</option>
              </select>
            </label>
            <p class="people-warning">
              Agent assertions do not authenticate this person. Access activates
              only after they register a passkey with the targeted claim link.
            </p>
          </div>
          <footer>
            <button
              class="people-button"
              value="cancel"
              type="button"
              data-dialog-cancel
            >
              Cancel
            </button>
            <button class="people-button people-button--primary" type="submit">
              Create invitation
            </button>
          </footer>
        </form>
      </dialog>

      <dialog id="people-identity-dialog" class="people-dialog">
        <form method="dialog" data-people-identity-form>
          <header>
            <div class="eyebrow">Recognition</div>
            <h3>Attach identity</h3>
            <p>Connect a verified provider identity to this person.</p>
          </header>
          <div class="people-dialog-body">
            <label>
              <span>Identity type</span>
              <select name="type">
                <option value="email">Email</option>
                <option value="discord">Discord</option>
                <option value="oauth">OAuth</option>
                <option value="mcp">MCP</option>
                <option value="did">DID</option>
                <option value="a2a">A2A</option>
              </select>
            </label>
            <label>
              <span>Provider subject</span>
              <input name="subject" maxlength={2000} required />
            </label>
            <label>
              <span>Issuer (optional)</span>
              <input name="issuer" maxlength={2000} />
            </label>
            <label>
              <span>Safe display label (optional)</span>
              <input name="label" maxlength={200} />
            </label>
            <p class="people-warning">
              Provider subjects are sensitive. They remain private in auth
              storage and are never shown in this dashboard.
            </p>
          </div>
          <footer>
            <button
              class="people-button"
              value="cancel"
              type="button"
              data-dialog-cancel
            >
              Cancel
            </button>
            <button class="people-button people-button--primary" type="submit">
              Attach identity
            </button>
          </footer>
        </form>
      </dialog>

      <dialog id="people-confirm-dialog" class="people-dialog">
        <form method="dialog" data-people-confirm-form>
          <header>
            <div class="eyebrow">Confirm access change</div>
            <h3 data-confirm-title>Confirm change</h3>
            <p data-confirm-copy>This change takes effect immediately.</p>
          </header>
          <div class="people-dialog-body">
            <p class="people-warning" data-confirm-warning>
              Existing access may stop working.
            </p>
          </div>
          <footer>
            <button
              class="people-button"
              value="cancel"
              type="button"
              data-dialog-cancel
            >
              Cancel
            </button>
            <button
              class="people-button people-button--danger"
              value="confirm"
              type="submit"
              data-confirm-submit
            >
              Confirm
            </button>
          </footer>
        </form>
      </dialog>

      <dialog id="people-setup-dialog" class="people-dialog">
        <form method="dialog">
          <header>
            <div class="eyebrow">Private delivery</div>
            <h3>Passkey setup link</h3>
            <p data-setup-copy>
              Send this single-use link through a private channel.
            </p>
          </header>
          <div class="people-dialog-body">
            <div class="people-setup-link">
              <code data-setup-link />
              <button
                class="people-button"
                type="button"
                data-setup-copy-button
              >
                Copy
              </button>
            </div>
            <p class="people-warning">
              Anyone holding this link can register a passkey for this person
              until it expires or is used.
            </p>
          </div>
          <footer>
            <button class="people-button people-button--primary" value="done">
              Done
            </button>
          </footer>
        </form>
      </dialog>
    </section>
  );
}

export const DASHBOARD_PEOPLE_SCRIPT = `(function () {
  var panel = document.querySelector("[data-people-panel]");
  if (!panel) return;

  var usersEndpoint = panel.getAttribute("data-users-endpoint");
  var mutationsEndpoint = panel.getAttribute("data-mutations-endpoint");
  var list = panel.querySelector("[data-people-list]");
  var detail = panel.querySelector("[data-people-detail]");
  var count = panel.querySelector("[data-people-count]");
  var feedback = panel.querySelector("[data-people-feedback]");
  var addDialog = document.getElementById("people-add-dialog");
  var identityDialog = document.getElementById("people-identity-dialog");
  var promoteAgentDialog = document.getElementById("people-promote-agent-dialog");
  var confirmDialog = document.getElementById("people-confirm-dialog");
  var setupDialog = document.getElementById("people-setup-dialog");
  var users = [];
  var selectedUserId = null;
  var pendingConfirmation = null;

  function node(tag, className, text) {
    var element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function roleLabel(role) {
    return role.slice(0, 1).toUpperCase() + role.slice(1);
  }

  function initials(displayName) {
    return displayName.split(/\\s+/).filter(Boolean).slice(0, 2).map(function (part) {
      return part.slice(0, 1).toUpperCase();
    }).join("");
  }

  function formatDate(value) {
    if (!value) return "Unknown";
    return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(value));
  }

  function setFeedback(message, tone) {
    feedback.textContent = message;
    feedback.className = "people-feedback" + (tone ? " people-feedback--" + tone : "");
    feedback.hidden = false;
    window.clearTimeout(setFeedback.timer);
    setFeedback.timer = window.setTimeout(function () { feedback.hidden = true; }, 5000);
  }

  async function parseResponse(response) {
    var body;
    try { body = await response.json(); } catch (_) { body = {}; }
    if (!response.ok) throw new Error(body.error || "Access request failed");
    return body;
  }

  async function mutate(payload) {
    return parseResponse(await fetch(mutationsEndpoint, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }));
  }

  function actionButton(label, action, danger) {
    var button = node("button", danger ? "people-text-action people-text-action--danger" : "people-text-action", label);
    button.type = "button";
    button.addEventListener("click", action);
    return button;
  }

  function openConfirmation(config) {
    confirmDialog.querySelector("[data-confirm-title]").textContent = config.title;
    confirmDialog.querySelector("[data-confirm-copy]").textContent = config.copy;
    confirmDialog.querySelector("[data-confirm-warning]").textContent = config.warning;
    confirmDialog.querySelector("[data-confirm-submit]").textContent = config.submitLabel || "Confirm";
    pendingConfirmation = config.confirm;
    confirmDialog.showModal();
  }

  function item(kind, value, action) {
    var row = node("div", "people-access-item");
    var copy = node("div");
    copy.append(node("div", "people-access-kind", kind));
    copy.append(node("div", "people-access-value", value));
    row.append(copy);
    if (action) row.append(action);
    return row;
  }

  function section(title, description, content) {
    var wrapper = node("section", "people-detail-section");
    var label = node("div", "people-section-label");
    label.append(node("h3", "", title));
    label.append(node("p", "", description));
    wrapper.append(label, content);
    return wrapper;
  }

  function selectedUser() {
    return users.find(function (user) { return user.userId === selectedUserId; });
  }

  function renderRoster() {
    list.replaceChildren();
    count.textContent = users.length + (users.length === 1 ? " person" : " people");
    if (!users.length) {
      list.append(node("p", "people-empty", "No people have been added."));
      return;
    }

    users.forEach(function (user) {
      var button = node("button", "people-row" + (user.userId === selectedUserId ? " is-selected" : ""));
      button.type = "button";
      button.setAttribute("aria-current", user.userId === selectedUserId ? "true" : "false");
      button.append(node("span", "people-avatar", initials(user.displayName)));

      var identity = node("span", "people-row-identity");
      identity.append(node("span", "people-row-name", user.displayName));
      var agentCount = (user.agents || []).filter(function (agent) { return agent.status !== "revoked"; }).length;
      identity.append(node("span", "people-row-meta", agentCount + (agentCount === 1 ? " linked agent · " : " linked agents · ") + user.identities.length + " identities"));
      button.append(identity);

      var access = node("span", "people-row-access");
      access.append(node("span", "people-role people-role--" + user.role, roleLabel(user.role)));
      access.append(node("span", "people-status people-status--" + user.status, roleLabel(user.status)));
      button.append(access);
      button.addEventListener("click", function () {
        selectedUserId = user.userId;
        renderRoster();
        renderDetail();
      });
      list.append(button);
    });
  }

  function agentContent(user) {
    var content = node("div", "people-stack");
    var agents = user.agents || [];
    agents.forEach(function (agent) {
      content.append(item("Agent", agent.agentId + " · " + roleLabel(agent.status)));
    });
    if (!agents.length) {
      content.append(node("p", "people-empty", "No linked agents. Promotion begins from an agent dossier."));
    }
    return content;
  }

  function identityContent(user) {
    var content = node("div", "people-stack");
    user.identities.forEach(function (identity) {
      var value = identity.label || "Private verified identity";
      var detach = actionButton("Detach", function () {
        openConfirmation({
          title: "Detach this identity?",
          copy: user.displayName + " will no longer be recognized through this identity.",
          warning: "Any sessions associated with this person will end.",
          submitLabel: "Detach identity",
          confirm: async function () {
            await mutate({ action: "detachIdentity", confirmation: "detachIdentity", identityId: identity.id });
            await loadUsers(user.userId);
            setFeedback("Identity detached", "good");
          }
        });
      }, true);
      content.append(item(roleLabel(identity.type), value, detach));
    });
    if (!user.identities.length) content.append(node("p", "people-empty", "No identities attached."));
    var actions = node("div", "people-inline-actions");
    actions.append(actionButton("Attach identity", function () { identityDialog.showModal(); }, false));
    content.append(actions);
    return content;
  }

  function passkeyContent(user) {
    var content = node("div", "people-stack");
    user.passkeys.forEach(function (passkey) {
      var device = passkey.credentialDeviceType ? roleLabel(passkey.credentialDeviceType) : "Passkey";
      var value = device + " · added " + formatDate(passkey.createdAt);
      var revoke = actionButton("Revoke", function () {
        openConfirmation({
          title: "Revoke this passkey?",
          copy: "This passkey will stop working immediately.",
          warning: user.displayName + " will need another passkey or identity to sign in.",
          submitLabel: "Revoke passkey",
          confirm: async function () {
            await mutate({ action: "revokePasskey", confirmation: "revokePasskey", credentialId: passkey.id });
            await loadUsers(user.userId);
            setFeedback("Passkey revoked", "good");
          }
        });
      }, true);
      content.append(item("Passkey", value, revoke));
    });
    if (!user.passkeys.length) content.append(node("p", "people-empty", "No passkeys registered."));
    var actions = node("div", "people-inline-actions");
    actions.append(actionButton("Create setup link", async function () {
      try {
        var result = await mutate({ action: "startPasskeyRegistration", confirmation: "startPasskeyRegistration", userId: user.userId });
        var link = setupDialog.querySelector("[data-setup-link]");
        link.textContent = result.registration.setupUrl;
        setupDialog.querySelector("[data-setup-copy]").textContent = "Send this single-use link to " + user.displayName + " through a private channel. It expires " + formatDate(result.registration.expiresAt * 1000) + ".";
        setupDialog.showModal();
      } catch (error) { setFeedback(error.message, "error"); }
    }, false));
    content.append(actions);
    return content;
  }

  function sessionContent(user) {
    var content = node("div", "people-stack");
    content.append(item("Authenticated sessions", "Revoke current browser and OAuth access", actionButton("Revoke all", function () {
      openConfirmation({
        title: "Revoke all sessions?",
        copy: user.displayName + " will be signed out everywhere.",
        warning: "This does not remove passkeys or identities.",
        submitLabel: "Revoke sessions",
        confirm: async function () {
          await mutate({ action: "revokeUserSessions", confirmation: "revokeUserSessions", userId: user.userId });
          setFeedback("Sessions revoked", "good");
        }
      });
    }, true)));
    return content;
  }

  function renderDetail() {
    detail.replaceChildren();
    var user = selectedUser();
    if (!user) {
      var empty = node("div", "people-detail-empty");
      empty.append(node("p", "", "Select a person to inspect their access."));
      detail.append(empty);
      return;
    }

    var heading = node("div", "people-detail-identity");
    var person = node("div", "people-detail-person");
    person.append(node("span", "people-avatar people-avatar--large", initials(user.displayName)));
    var personCopy = node("span");
    personCopy.append(node("span", "people-detail-name", user.displayName));
    personCopy.append(node("span", "people-detail-id", user.personId + " · " + user.userId + " · " + roleLabel(user.status)));
    person.append(personCopy);
    heading.append(person);

    var roleControl = node("label", "people-role-control");
    roleControl.append(node("span", "", "Role"));
    var roleSelect = node("select");
    ["public", "trusted", "anchor"].forEach(function (role) {
      var option = node("option", "", roleLabel(role));
      option.value = role;
      option.selected = role === user.role;
      roleSelect.append(option);
    });
    roleSelect.addEventListener("change", function () {
      var nextRole = roleSelect.value;
      roleSelect.value = user.role;
      openConfirmation({
        title: "Change " + user.displayName + "’s role?",
        copy: roleLabel(user.role) + " → " + roleLabel(nextRole) + " changes permissions immediately.",
        warning: nextRole === "anchor" ? "Anchor grants full administration and restricted-content access." : "Existing sessions will end and must be reauthenticated.",
        submitLabel: "Change role",
        confirm: async function () {
          await mutate({ action: "updateUserRole", confirmation: "updateUserRole", userId: user.userId, role: nextRole });
          await loadUsers(user.userId);
          setFeedback("Role updated", "good");
        }
      });
    });
    roleControl.append(roleSelect);
    heading.append(roleControl);
    detail.append(heading);

    var sections = node("div", "people-detail-sections");
    sections.append(section("Linked agents", "Representatives sharing this person’s canonical profile and identity claims.", agentContent(user)));
    sections.append(section("Identities", "Ways this person is recognized.", identityContent(user)));
    sections.append(section("Passkeys", "Private authentication credentials.", passkeyContent(user)));
    sections.append(section("Sessions", "Current authenticated access.", sessionContent(user)));
    detail.append(sections);

    var footer = node("footer", "people-detail-footer");
    footer.append(node("small", "", user.role === "anchor" && user.status === "active" ? "At least one active Anchor must remain." : "Access changes are audited."));
    var suspended = user.status === "suspended";
    var statusButton = node("button", suspended ? "people-button" : "people-button people-button--danger", suspended ? "Reactivate person" : "Suspend person");
    statusButton.type = "button";
    statusButton.addEventListener("click", function () {
      var nextStatus = suspended ? "active" : "suspended";
      openConfirmation({
        title: (suspended ? "Reactivate " : "Suspend ") + user.displayName + "?",
        copy: suspended ? "Authenticated access will be available again." : "Authenticated access will end immediately.",
        warning: suspended ? "Existing passkeys and identities remain attached." : "Sessions and refresh tokens will be revoked. You can reactivate this person later.",
        submitLabel: suspended ? "Reactivate person" : "Suspend person",
        confirm: async function () {
          await mutate({ action: "updateUserStatus", confirmation: "updateUserStatus", userId: user.userId, status: nextStatus });
          await loadUsers(user.userId);
          setFeedback(suspended ? "Person reactivated" : "Person suspended", "good");
        }
      });
    });
    footer.append(statusButton);
    detail.append(footer);
  }

  async function loadUsers(preferredUserId) {
    try {
      var data = await parseResponse(await fetch(usersEndpoint, { credentials: "same-origin", cache: "no-store" }));
      users = data.users || [];
      selectedUserId = preferredUserId && users.some(function (user) { return user.userId === preferredUserId; })
        ? preferredUserId
        : (selectedUserId && users.some(function (user) { return user.userId === selectedUserId; }) ? selectedUserId : (users[0] && users[0].userId));
      renderRoster();
      renderDetail();
    } catch (error) {
      list.replaceChildren(node("p", "people-empty people-empty--error", error.message));
      detail.replaceChildren();
      count.textContent = "Unavailable";
    }
  }

  window.addEventListener("brains:agent-promote", function (event) {
    if (!event.detail || !event.detail.agentId) return;
    var form = panel.querySelector("[data-people-promote-agent-form]");
    form.elements.agentId.value = event.detail.agentId;
    form.elements.agentLabel.value = event.detail.displayName || event.detail.agentId;
    form.elements.displayName.value = event.detail.displayName || "";
    promoteAgentDialog.showModal();
  });

  panel.querySelector("[data-people-add]").addEventListener("click", function () { addDialog.showModal(); });
  panel.querySelectorAll("[data-dialog-cancel]").forEach(function (button) {
    button.addEventListener("click", function () { button.closest("dialog").close("cancel"); });
  });

  panel.querySelector("[data-people-add-form]").addEventListener("submit", async function (event) {
    event.preventDefault();
    var form = event.currentTarget;
    var formData = new FormData(form);
    try {
      var result = await mutate({
        action: "createUser",
        confirmation: "createUser",
        displayName: String(formData.get("displayName") || ""),
        role: String(formData.get("role") || "trusted"),
        status: "active"
      });
      addDialog.close("confirm");
      form.reset();
      await loadUsers(result.user.userId);
      setFeedback("Person created", "good");
    } catch (error) { setFeedback(error.message, "error"); }
  });

  panel.querySelector("[data-people-promote-agent-form]").addEventListener("submit", async function (event) {
    event.preventDefault();
    var form = event.currentTarget;
    var formData = new FormData(form);
    try {
      var result = await mutate({
        action: "promoteAgentPerson",
        confirmation: "promoteAgentPerson",
        agentId: String(formData.get("agentId") || ""),
        displayName: String(formData.get("displayName") || ""),
        role: String(formData.get("role") || "trusted")
      });
      promoteAgentDialog.close("confirm");
      form.reset();
      await loadUsers(result.user.userId);
      setupDialog.querySelector("[data-setup-link]").textContent = result.registration.setupUrl;
      setupDialog.querySelector("[data-setup-copy]").textContent = "Send this single-use link to " + result.user.displayName + " through a private channel. It expires " + formatDate(result.registration.expiresAt * 1000) + ".";
      setupDialog.showModal();
      setFeedback("Invitation created", "good");
    } catch (error) { setFeedback(error.message, "error"); }
  });

  panel.querySelector("[data-people-identity-form]").addEventListener("submit", async function (event) {
    event.preventDefault();
    var user = selectedUser();
    if (!user) return;
    var form = event.currentTarget;
    var formData = new FormData(form);
    var payload = {
      action: "attachIdentity",
      confirmation: "attachIdentity",
      userId: user.userId,
      type: String(formData.get("type")),
      subject: String(formData.get("subject") || "")
    };
    var issuer = String(formData.get("issuer") || "").trim();
    var label = String(formData.get("label") || "").trim();
    if (issuer) payload.issuer = issuer;
    if (label) payload.label = label;
    try {
      await mutate(payload);
      identityDialog.close("confirm");
      form.reset();
      await loadUsers(user.userId);
      setFeedback("Identity attached", "good");
    } catch (error) { setFeedback(error.message, "error"); }
  });

  panel.querySelector("[data-people-confirm-form]").addEventListener("submit", async function (event) {
    event.preventDefault();
    var confirm = pendingConfirmation;
    pendingConfirmation = null;
    confirmDialog.close("confirm");
    if (!confirm) return;
    try { await confirm(); } catch (error) { setFeedback(error.message, "error"); }
  });

  panel.querySelector("[data-setup-copy-button]").addEventListener("click", async function (event) {
    var link = setupDialog.querySelector("[data-setup-link]").textContent;
    try {
      await navigator.clipboard.writeText(link);
      event.currentTarget.textContent = "Copied";
    } catch (_) { setFeedback("Copy failed; select the link manually.", "error"); }
  });

  loadUsers();
})();`;
