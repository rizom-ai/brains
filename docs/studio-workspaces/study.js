// Capability-aligned interaction study. No requests, credentials, or live mutations.
const app = document.getElementById("app");
const browser = document.getElementById("browser");
const review = document.getElementById("review");
const browse = document.getElementById("browseDialog");
const screen = document.body.dataset.workspace;
// Shared prototype profile popover; no account/session mutations.
const profileButton = document.getElementById("profileButton");
const profileMenu = document.createElement("div");
profileMenu.id = "profileMenu";
profileMenu.className = "profile-menu";
profileMenu.setAttribute("popover", "auto");
profileMenu.setAttribute("aria-label", "Profile menu");
profileMenu.setAttribute("role", "group");
profileMenu.innerHTML =
  '<p class="profile-menu-name">Mira Reyes</p><p class="profile-menu-role">Admin</p><button data-screen="account" autofocus>Account <span aria-hidden="true">→</span></button>';
document.querySelector(".chrome").append(profileMenu);
function positionProfileMenu() {
  const rect = profileButton.getBoundingClientRect();
  profileMenu.style.left = `${Math.max(16, Math.min(rect.right - profileMenu.offsetWidth, innerWidth - profileMenu.offsetWidth - 16))}px`;
  profileMenu.style.top = `${rect.bottom + 8}px`;
}
profileMenu.addEventListener("toggle", (event) => {
  const open = event.newState === "open";
  profileButton.setAttribute("aria-expanded", String(open));
  if (open) positionProfileMenu();
});
window.addEventListener("resize", () => {
  if (profileMenu.matches(":popover-open")) positionProfileMenu();
});
window.addEventListener(
  "scroll",
  () => {
    if (profileMenu.matches(":popover-open")) profileMenu.hidePopover();
  },
  true,
);
const names = {
  overview: "Overview",
  chat: "Chat",
  inbox: "Inbox",
  publishing: "Publishing",
  site: "Site",
  sync: "Content sync",
  administration: "Administration",
  account: "Account",
};
const screenAreas = {
  overview: "overview",
  chat: "chat",
  inbox: "work",
  publishing: "work",
  site: "work",
  sync: "work",
  administration: "administration",
  account: null,
};
const facts = (rows) =>
  `<dl class="facts">${rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join("")}</dl>`;
const action = (label, id, disabled = false) =>
  `<button type="button" class="button" data-action="${id}" ${disabled ? "disabled" : ""}>${label}</button>`;
const field = (label, name, value = "", type = "text") =>
  `<label>${label}<input name="${name}" type="${type}" value="${value}" required></label>`;
const select = (label, name, values) =>
  `<label>${label}<select name="${name}">${values.map((v) => `<option>${v}</option>`).join("")}</select></label>`;
const inviteFields =
  field("Display name", "displayName", "Grace Hopper") +
  select("Role", "role", ["Trusted", "Admin"]) +
  select("Delivery channel", "deliveryType", ["Email"]) +
  field("Delivery destination", "destination", "grace@example.com", "email") +
  field("Delivery label (optional)", "deliveryLabel", "Grace’s email").replace(
    " required",
    "",
  ) +
  select("Delivery mode", "deliveryMode", ["Manual", "Automatic"]);
const actions = {
  sync: {
    title: "Sync now",
    description:
      "Queue a directory-sync request. This does not compare file versions or guarantee a successful sync.",
    submit: "Queue sync request",
    result:
      "The live action returns queued/request state. This mockup did not start a sync.",
  },
  "sync-diagnostics": {
    title: "Repository sync diagnostics",
    description:
      "Two recorded issues, newest first. These are illustrative stored records—not a live repository log.",
    body: '<pre class="source-copy">Occurred: 2026-09-05T09:15:00.000Z\nPath: brain-data\ngit push origin main exited with 1: the remote contains newer commits.\n\nOccurred: 2026-09-05T09:13:00.000Z\nPath: brain-data\ngit pull origin main failed: the remote was unavailable.</pre>',
  },
  "run-diagnostics": {
    title: "Manual sync · failed",
    description: "Recorded run summary and metrics.",
    body:
      facts([
        ["Source", "manual"],
        ["Outcome", "failed"],
        ["Started", "5 Sept, 09:14 UTC"],
        ["Completed", "5 Sept, 09:15 UTC"],
        ["Imported", "12"],
        ["Exported", "4"],
      ]) +
      '<pre class="source-copy">The remote rejected the push. The local export remains in the working tree.</pre>',
  },
  "publication-failure": {
    title: "Notes from the rhizome",
    description:
      "Stored publication error. Retry count is attempts recorded—not a promise of two retries remaining.",
    body:
      '<pre class="source-copy">Publication transport rejected the payload.</pre>' +
      facts([["Retries", "1"]]),
    submit: "Retry publication",
    result: "Preview only — publication was not retried.",
  },
  "queue-first": {
    title: "Quiet infrastructure",
    description:
      "Newsletter · position 1 of 2. Reorder stays within this destination.",
    body:
      action("Move up", "reorder", true) +
      action("Move down", "reorder") +
      action("Remove from queue", "remove-queue") +
      action("Open document", "entity"),
  },
  "queue-only": {
    title: "Alpha release log",
    description: "Site · position 1 of 1.",
    body:
      action("Move up", "reorder", true) +
      action("Move down", "reorder", true) +
      action("Remove from queue", "remove-queue") +
      action("Open document", "entity"),
  },
  "queue-last": {
    title: "A console that travels well",
    description: "Newsletter · position 2 of 2.",
    body:
      action("Move up", "reorder") +
      action("Move down", "reorder", true) +
      action("Remove from queue", "remove-queue") +
      action("Open document", "entity"),
  },
  reorder: {
    title: "Reorder queued entity",
    description:
      "The action submits the entity type, entity ID and new position within the destination queue.",
    submit: "Reorder",
    result: "Preview only — queue order unchanged.",
  },
  "remove-queue": {
    title: "Remove from queue",
    description: "Remove the queue entry, not the underlying document.",
    submit: "Remove from queue",
    result: "Preview only — entry retained.",
  },
  entity: {
    title: "Open document",
    description:
      "In Studio this navigates to the entity editor. The editor is outside these eight workspace mockups; unsaved changes still require a navigation guard.",
  },
  "inbox-done": {
    title: "Done",
    description:
      "Email supplies mark-handled. This updates source-owned state; it is not a universal Inbox resolved state.",
    submit: "Done",
    result: "Preview only — source item unchanged.",
  },
  "inbox-dismiss": {
    title: "Dismiss email item?",
    description:
      "Email supplies archive with confirmation. Other sources may expose different actions or none.",
    confirm: "Confirm the source-owned Dismiss action for this item.",
    submit: "Dismiss",
    result: "Preview only — email item retained.",
  },
  "site-failure": {
    title: "Preview build details",
    description:
      "A failed render is separate from the published generation. The earlier preview remains available.",
    body:
      facts([
        ["Environment", "Preview"],
        ["Outcome", "Failed"],
        ["Completed", "5 Sept, 10:42 UTC"],
        ["Job ID", "sample-preview-failed"],
      ]) +
      '<pre class="source-copy">Render failed for /notes/quiet-infrastructure.\nPublished generation: preview-previous.\nA failed attempt does not establish a newly published generation.</pre>',
  },
  "site-url": {
    title: "Open configured site URL",
    description:
      "The live link uses the configured preview or live URL. Omitted when unavailable. No page thumbnail or reconstructed site preview is implied by this mockup.",
  },
  "site-settings": {
    title: "Edit site settings",
    description:
      "Opens the site-info entity in Studio. This is an editor link, not an inline deployment form.",
  },
  "build-preview": {
    title: "Build preview",
    description:
      "Trusted or Admin can request a preview build. The view exposes active build state, then the recorded outcome.",
    submit: "Build preview",
    result: "Preview only — no build queued.",
  },
  "build-production": {
    title: "Build production",
    description:
      "Admin only. This operation affects the production environment, not just preview.",
    confirm:
      "Review the production build before confirming. A Trusted actor must not be offered this action.",
    submit: "Build production",
    result: "Preview only — production unchanged.",
  },
  "manage-person": {
    title: "Alex Morgan",
    description:
      "Trusted · Active · Not Anchor · Not you. Actions depend on the selected person’s protections.",
    body:
      action("Change role", "change-role") +
      action("Suspend person", "suspend") +
      action("Delete person", "delete-person") +
      action("Create setup link", "setup-link") +
      action("Revoke all sessions", "person-sessions") +
      action("Attach channel", "attach-channel") +
      facts([
        ["Passkeys", "1 — final credential protected"],
        ["Channel", "Email · alex@example.com"],
      ]) +
      action("Detach channel", "detach-channel"),
  },
  "change-role": {
    title: "Change role",
    description: "The server prepares and revalidates this permission change.",
    fields: select("Role", "role", ["Trusted", "Admin", "Public"]),
    confirm:
      "Review the selected role. Anchor and self protections can reject this change.",
    submit: "Change role",
  },
  suspend: {
    title: "Suspend person",
    description:
      "Prepared confirmation is required. Protected accounts cannot be suspended through this action.",
    confirm: "Suspend Alex Morgan’s local access?",
    submit: "Suspend person",
  },
  "delete-person": {
    title: "Delete person",
    description:
      "Prepared confirmation is required; the server checks account protections.",
    confirm: "Delete Alex Morgan? This is not a session-only action.",
    submit: "Delete person",
  },
  "setup-link": {
    title: "Create setup link",
    description:
      "Creates a single-use credential setup link for the selected person.",
    confirm:
      "A setup link grants credential enrollment. Treat its returned URL as sensitive.",
    submit: "Create setup link",
    result: "Preview only — no credential enrollment link generated.",
  },
  "person-sessions": {
    title: "Revoke all sessions",
    description: "Prepared confirmation for the selected person.",
    confirm: "End Alex Morgan’s sessions?",
    submit: "Revoke all sessions",
  },
  "attach-channel": {
    title: "Attach channel",
    description: "Only registered channel types can be selected.",
    fields:
      select("Channel type", "type", ["Email"]) +
      field("Channel subject", "subject", "alex@example.com") +
      field("Issuer (optional)", "issuer", "", "url").replace(" required", "") +
      field("Display label (optional)", "label", "Alex").replace(
        " required",
        "",
      ),
    confirm: "Confirm this channel identity belongs to the selected person.",
    submit: "Attach channel",
  },
  "detach-channel": {
    title: "Detach channel",
    description: "Prepared confirmation for the selected channel identity.",
    confirm: "Detach alex@example.com from Alex Morgan?",
    submit: "Detach channel",
  },
  invite: {
    title: "Add a person",
    description:
      "Configured sample delivery: Email. Manual delivery returns a single-use setup URL; automatic delivery uses the configured sender.",
    fields: inviteFields,
    submit: "Add a person",
    result:
      "Preview only — no person, delivery or setup URL was created. The live manual result contains a sensitive single-use URL and expiration.",
  },
  invitation: {
    title: "Grace Hopper",
    description:
      "Trusted · manual delivery pending. Expires 6 Sept, 09:00 UTC.",
    body:
      action("Confirm delivered", "delivered") +
      action("Resend", "resend") +
      action("Cancel", "cancel-invite"),
  },
  delivered: {
    title: "Confirm delivered",
    description:
      "Acknowledge that the setup link was delivered manually. Only valid invitation states expose this action.",
    submit: "Confirm delivered",
  },
  resend: {
    title: "Resend invitation",
    description: "Create a replacement setup link for the invitation.",
    confirm:
      "The previous setup link will no longer be the current link. Confirm resend.",
    submit: "Resend",
  },
  "cancel-invite": {
    title: "Cancel invitation",
    description:
      "Prepared confirmation. This is not deletion of an active person.",
    confirm: "Cancel Grace Hopper’s pending invitation?",
    submit: "Cancel invitation",
  },
  "link-peer": {
    title: "Link an existing person",
    description:
      "Record an external-brain relationship without granting local access.",
    fields:
      field("External peer ID", "peerId", "peer:sample") +
      select("Local person", "userId", ["Alex Morgan", "Mira Reyes"]),
    confirm: "Review the peer and local person before linking.",
    submit: "Link peer to person",
  },
  "invite-peer": {
    title: "Invite peer person",
    description: "Create a local invitation associated with an external peer.",
    fields: field("External peer ID", "peerId", "peer:sample") + inviteFields,
    confirm: "Review the invitation and external peer relationship.",
    submit: "Invite peer person",
  },
  "audit-event": {
    title: "Person invited",
    description: "Audit event detail. Read-only.",
    body: facts([
      ["Actor", "Mira Reyes"],
      ["Action", "Person invited"],
      ["Target", "Grace Hopper"],
      ["Occurred", "5 Sept, 08:30 UTC"],
      ["Event ID", "sample-audit-1"],
    ]),
  },
  "audit-role": {
    title: "Role changed",
    description: "Audit event detail. Read-only.",
    body: facts([
      ["Actor", "Mira Reyes"],
      ["Action", "Role changed"],
      ["Target", "Alex Morgan"],
      ["Occurred", "4 Sept, 15:40 UTC"],
      ["Event ID", "sample-audit-2"],
    ]),
  },
  "revoke-passkey": {
    title: "Revoke passkey",
    description:
      "This sample has two credentials. The final passkey must not have a revoke action.",
    confirm: "Revoke this credential? Another passkey must remain.",
    submit: "Revoke passkey",
  },
  passkey: {
    title: "Add passkey",
    description:
      "The live flow uses a browser WebAuthn enrollment ceremony. This mockup does not prompt your authenticator.",
    submit: "Preview enrollment",
    result: "No passkey was created.",
  },
  "end-session": {
    title: "End this browser session?",
    description: "That browser will need a passkey to sign in again.",
    confirm: "End the selected other session?",
    submit: "End session",
  },
  "end-others": {
    title: "End every other browser session?",
    description: "The current session is retained.",
    confirm: "End all other sessions?",
    submit: "End other sessions",
  },
  "sign-out": {
    title: "Sign out everywhere?",
    description:
      "This ends every session, including this one. You will need a passkey to return.",
    confirm: "Confirm sign-out from all browsers.",
    submit: "Sign out everywhere",
  },
  "anchor-profile": {
    title: "Open Anchor profile",
    description:
      "The Anchor’s display name is owned by its profile entity. The account form must not offer an independent name change.",
  },
  "archive-chat": {
    title: "Archive conversation",
    description:
      "The live action archives the selected session. This prototype preserves the sample transcript and your composer draft.",
    submit: "Archive conversation",
  },
  attachments: {
    title: "Attach files",
    description:
      "The live composer uploads selected files and displays their attachment state. This prototype does not read or upload local files.",
  },
  Commands: {
    title: "Commands",
    description:
      "Shared Studio navigation. Command-palette design is outside this workspace content revision.",
  },
};
actions["stop-chat"] = {
  title: "Stop generating",
  description:
    "The live composer cancels the active response. Drafts and existing transcript content remain.",
  submit: "Stop",
  result: "Preview only — no live response was running.",
};
for (const [i, minute] of [15, 13, 11, 9, 7].entries())
  actions[`dense-run-${i}`] = {
    title: `${i === 0 ? "Manual" : "Periodic"} sync · failed`,
    description: "Recorded run, not a per-document event.",
    body:
      facts([
        ["Source", i === 0 ? "manual" : "periodic"],
        ["Outcome", "failed"],
        ["Imported", "0"],
        ["Exported", "0"],
        ["Completed", `5 Sept, 09:${String(minute).padStart(2, "0")} UTC`],
      ]) +
      '<pre class="source-copy">The remote rejected the push. Local changes are retained.</pre>',
  };
for (const [kind, count] of [
  ["git", 5],
  ["export", 3],
])
  actions[`dense-${kind}`] = {
    title:
      kind === "git"
        ? "Repository sync diagnostics"
        : "Content export diagnostics",
    description: `${count} recorded issues. Every sample timestamp, path and message is retained.`,
    body:
      '<pre class="source-copy">' +
      Array.from(
        { length: count },
        (_, i) =>
          `Occurred: 2026-09-05T09:${String(15 - i * 2).padStart(2, "0")}:00.000Z\nPath: brain-data\n${kind === "git" ? "git push origin main exited with 1: the remote contains newer commits." : "Export could not complete because repository publication failed."}`,
      ).join("\n\n") +
      "</pre>",
  };
actions["leave-draft"] = {
  title: "Leave this draft?",
  description:
    "Your unsent message or unsaved profile edit remains if you cancel.",
  confirm:
    "Discard the local prototype draft and navigate away? No live content is affected.",
  submit: "Discard draft and leave",
};
actions["anchor-person"] = {
  title: "Rover collective",
  description:
    "Admin · Active · Anchor. The brain identity is protected from role changes, suspension and deletion.",
  body: facts([
    ["Role", "Admin"],
    ["Status", "Active"],
    ["Anchor", "Yes"],
  ]),
};
let pendingNavigation;
let currentAction;
let confirmed = false;
function openAction(id) {
  const data = actions[id];
  if (!data) throw new Error(`Unspecified mockup action: ${id}`);
  currentAction = data;
  confirmed = false;
  document.getElementById("reviewTitle").textContent = data.title;
  document.getElementById("reviewDescription").textContent = data.description;
  document.getElementById("reviewBody").innerHTML = data.body || "";
  document.getElementById("reviewFields").innerHTML = data.fields || "";
  document.getElementById("reviewConfirmation").textContent = "";
  document.getElementById("reviewAction").textContent = data.confirm
    ? "Review confirmation"
    : data.submit || "Close";
  document.getElementById("actionForm").hidden = !data.submit;
  document.getElementById("feedback").textContent = "";
  if (!review.open) review.showModal();
}
function selectControls(group, value) {
  document
    .querySelectorAll(`[data-control="${group}"] button`)
    .forEach((b) =>
      b.setAttribute("aria-pressed", String(b.dataset.value === value)),
    );
}
function setArea(area) {
  const hasLeaf = ["overview", "work", "system"].includes(area);
  app.classList.toggle("direct-destination", !hasLeaf);
  document.querySelector(".leaf").hidden = !hasLeaf;
  document.getElementById("leafTitle").textContent =
    {
      work: "Work",
      overview: "Overview",
      system: "System",
    }[area] ?? "";
  for (const [id, key] of [
    ["homeLeaf", "overview"],
    ["workLeaf", "work"],
    ["systemLeaf", "system"],
  ])
    document.getElementById(id).hidden = key !== area;
  document
    .querySelectorAll("[data-area]")
    .forEach((b) =>
      b.setAttribute("aria-pressed", String(b.dataset.area === area)),
    );
}
function setCollapsed(value) {
  app.classList.toggle("collapsed", value);
  const b = document.getElementById("collapse");
  b.textContent = value ? "⇥" : "⇤";
  b.setAttribute("aria-expanded", String(!value));
  b.setAttribute(
    "aria-label",
    value ? "Expand navigation" : "Collapse navigation",
  );
  localStorage.setItem("studio.mockup.collapsed", String(value));
}
function navigate(value, tab) {
  if (profileMenu.matches(":popover-open")) profileMenu.hidePopover();
  if (value === screen && !tab) {
    setArea(screenAreas[screen]);
    return;
  }
  const url = new URL(`${value}.html`, location.href);
  url.searchParams.set(
    "viewport",
    browser.classList.contains("phone") ? "phone" : "desktop",
  );
  url.searchParams.set(
    "climate",
    document.documentElement.dataset.climate || "paper",
  );
  if (tab) url.searchParams.set("tab", tab);
  const message = document.getElementById("message");
  const profile = document.getElementById("displayName");
  if (
    message?.value.trim() ||
    (profile && profile.value !== profile.defaultValue)
  ) {
    pendingNavigation = url.href;
    openAction("leave-draft");
    return;
  }
  location.assign(url.href);
}
function showTab(button) {
  const scope = button.closest("[data-tabs]");
  scope
    .querySelectorAll("[data-panel]")
    .forEach((b) => b.setAttribute("aria-pressed", String(b === button)));
  scope
    .querySelectorAll("[data-tab-panel]")
    .forEach((p) => (p.hidden = p.id !== button.dataset.panel));
}
function scenario(value) {
  document
    .querySelectorAll("[data-scenario]")
    .forEach((p) => (p.hidden = p.dataset.scenario !== value));
  document.getElementById("scenario").value = value;
  document.getElementById("workspace").scrollTop = 0;
  if (screen === "inbox") {
    document
      .querySelectorAll(".summary-line b")
      .forEach(
        (b, i) =>
          (b.textContent = value !== "sample" ? "0" : ["3", "1", "3"][i]),
      );
    document.querySelector(".summary-line > span:last-child").textContent =
      value === "outage" ? "0 of 1 sources online" : "1 of 1 sources online";
    if (value === "sample") filterInbox();
  }
  if (screen === "chat") {
    const send = document.querySelector(
      '#chatForm button[type="submit"],#chatForm [data-action="stop-chat"]',
    );
    send.type = value === "busy" ? "button" : "submit";
    send.textContent = value === "busy" ? "Stop" : "Send";
    if (value === "busy") send.dataset.action = "stop-chat";
    else delete send.dataset.action;
  }
}
const inboxItems = [
  [
    "Could we share your field notes?",
    "Hi Mira, could we share your field notes with the reading group? We would credit the original source. — Grace",
  ],
  [
    "A question about the next gathering",
    "Hi Mira, have you settled the September dates? — Alex",
  ],
  [
    "Feedback on Quiet infrastructure",
    "The draft is clear. I added a few suggestions about the examples. — Sam",
  ],
];
document.addEventListener("click", (event) => {
  const b = event.target.closest("button");
  if (!b) return;
  const control = b.closest("[data-control]");
  if (control) {
    const group = control.dataset.control,
      value = b.dataset.value;
    selectControls(group, value);
    if (group === "viewport")
      browser.classList.toggle("phone", value === "phone");
    if (group === "climate") {
      document.documentElement.dataset.climate = value;
      document.documentElement.dataset.theme =
        value === "instrument" ? "dark" : "light";
    }
  }
  if (b.dataset.screen) navigate(b.dataset.screen, b.dataset.destinationTab);
  else if (b.dataset.area) {
    if (b.dataset.area === "overview") navigate("overview");
    else {
      setArea(b.dataset.area);
      setCollapsed(false);
    }
  }
  if (b.dataset.panel) showTab(b);
  if (b.dataset.action === "new-chat") scenario("empty");
  else if (b.dataset.action) openAction(b.dataset.action);
  if (b.dataset.preview) openAction(b.dataset.preview);
  if (b.dataset.item !== undefined) {
    const [title, text] = inboxItems[Number(b.dataset.item)];
    document.getElementById("inboxReadingTitle").textContent = title;
    document.getElementById("inboxReadingText").textContent = text;
    document.getElementById("inboxReading").hidden = false;
    document.querySelector(".inbox-layout").classList.add("has-reading");
    document
      .getElementById("inboxReading")
      .scrollIntoView({ block: "nearest" });
  }
  if (b.id === "closeReading") {
    document.getElementById("inboxReading").hidden = true;
    document.querySelector(".inbox-layout").classList.remove("has-reading");
  }
  if (b.dataset.session && screen === "chat") {
    scenario("sample");
    const voice = b.dataset.session === "voice";
    document.getElementById("conversationTitle").textContent = voice
      ? "Finding our voice"
      : "The weekly review";
    const turns = document.querySelectorAll("#conversationBody .turn p");
    turns[0].textContent = voice
      ? "How can our writing feel more like us?"
      : "Help me prepare a weekly review.";
    turns[1].textContent = voice
      ? "Lead with a concrete observation and a useful example."
      : "Start with what changed, what remains blocked, and what you want to do next. Which part would you like to work through?";
    document
      .querySelectorAll("[data-session]")
      .forEach((x) =>
        x.setAttribute(
          "aria-pressed",
          String(x.dataset.session === b.dataset.session),
        ),
      );
    document.getElementById("sessionDialog").close();
  }
  if (b.hasAttribute("data-close")) b.closest("dialog").close();
});
document.getElementById("actionForm").addEventListener("submit", (event) => {
  event.preventDefault();
  if (currentAction.confirm && !confirmed) {
    confirmed = true;
    document.getElementById("reviewConfirmation").textContent =
      currentAction.confirm +
      " Live actions enforce their declared confirmation and permission checks; prepared actions also use a server-issued token.";
    document.getElementById("reviewAction").textContent = currentAction.submit;
    return;
  }
  if (currentAction === actions["leave-draft"] && pendingNavigation) {
    location.assign(pendingNavigation);
    return;
  }
  document.getElementById("feedback").textContent =
    currentAction.result ||
    "Preview only — no live action performed. Sample data unchanged.";
});
document
  .getElementById("collapse")
  .addEventListener("click", () =>
    setCollapsed(!app.classList.contains("collapsed")),
  );
document
  .getElementById("browseButton")
  .addEventListener("click", () => browse.showModal());
document
  .getElementById("scenario")
  .addEventListener("change", (e) => scenario(e.target.value));
document
  .getElementById("sessionsButton")
  ?.addEventListener("click", () =>
    document.getElementById("sessionDialog").showModal(),
  );
document.getElementById("profileForm")?.addEventListener("submit", (e) => {
  e.preventDefault();
  document.getElementById("profileFeedback").textContent =
    "Preview only — account unchanged; your edited name remains in the form.";
});
document.getElementById("chatForm")?.addEventListener("submit", (e) => {
  e.preventDefault();
  document.getElementById("chatFeedback").textContent =
    "Preview only — message not sent. Your draft stays here.";
});
function filterInbox() {
  let count = 0;
  const urgency = document.getElementById("inboxUrgency").value;
  const email = document.getElementById("inboxSource").value === "Email";
  const facet = document.querySelector("#mailFacet select").value;
  document.getElementById("mailFacet").hidden = !email;
  document.querySelectorAll("[data-urgency]").forEach((row) => {
    row.hidden =
      (urgency !== "all" && row.dataset.urgency !== urgency) ||
      (email &&
        facet !== "All" &&
        row.dataset.needsReply !== String(facet === "Yes"));
    if (!row.hidden) count++;
  });
  document.getElementById("matching").textContent = String(count);
}
document.getElementById("inboxSource")?.addEventListener("change", filterInbox);
document
  .getElementById("inboxUrgency")
  ?.addEventListener("change", filterInbox);
document
  .querySelector("#mailFacet select")
  ?.addEventListener("change", filterInbox);
document.getElementById("invitationState")?.addEventListener("change", (e) => {
  document.getElementById("pendingInvitations").hidden =
    e.target.value !== "pending";
  document.getElementById("invitationHistory").hidden =
    e.target.value !== "history";
});
document.querySelectorAll("#admin-audit select").forEach((select) =>
  select.addEventListener("change", () => {
    const [actor, action] = document.querySelectorAll("#admin-audit select");
    document
      .querySelectorAll("#admin-audit .record")
      .forEach(
        (row) =>
          (row.hidden =
            (action.value !== "All actions" &&
              row.querySelector("h3").textContent !== action.value) ||
            (actor.value !== "All actors" &&
              !row.querySelector("p").textContent.includes(actor.value))),
      );
  }),
);
const options = new URLSearchParams(location.search);
const viewport = options.get("viewport") === "phone" ? "phone" : "desktop";
const climate =
  options.get("climate") === "instrument" ? "instrument" : "paper";
browser.classList.toggle("phone", viewport === "phone");
document.documentElement.dataset.climate = climate;
document.documentElement.dataset.theme =
  climate === "instrument" ? "dark" : "light";
selectControls("viewport", viewport);
selectControls("climate", climate);
setArea(screenAreas[screen]);
setCollapsed(localStorage.getItem("studio.mockup.collapsed") === "true");
document.getElementById("location").textContent = [
  "overview",
  "chat",
  "administration",
  "account",
].includes(screen)
  ? names[screen]
  : `Work · ${names[screen]}`;
if (screen === "account") profileButton.setAttribute("aria-current", "page");
document.querySelectorAll("[data-screen]").forEach((b) => {
  if (b.dataset.screen === screen) b.setAttribute("aria-current", "page");
  else b.removeAttribute("aria-current");
});
const tab = options.get("tab");
if (tab) {
  const button = [...document.querySelectorAll("[data-panel]")].find(
    (b) => b.dataset.panel === tab,
  );
  if (button) showTab(button);
}
if (options.get("state") === "empty") scenario("empty");
