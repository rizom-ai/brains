/**
 * All CSS for the operator-console dashboard, as a single constant.
 * Kept out of the orchestrator to keep `dashboard-page.ts` focused on
 * composition.
 */
export const DASHBOARD_STYLES = `
:root {
  --ink:          #0a0819;
  --ink-raised:   #14112b;
  --ink-soft:     #1b1638;
  --ink-deep:     #05040f;
  --paper:        #f1eadd;
  --paper-dim:    #bfb7a6;
  --paper-mute:   #7a7263;
  --paper-faint:  #4a4459;
  --rule:         rgba(241, 234, 221, 0.07);
  --rule-strong:  rgba(241, 234, 221, 0.14);
  --rule-accent:  rgba(255, 139, 61, 0.45);
  --accent:       #ff8b3d;
  --accent-dim:   #c4611f;
  --accent-soft:  rgba(255, 139, 61, 0.12);
  --ok:           #68cc8b;
  --warn:         #f5c158;
  --err:          #e26d6d;
  --neutral:      #7a7263;
  --font-display: "Fraunces", "Times New Roman", serif;
  --font-body:    "IBM Plex Sans", -apple-system, system-ui, sans-serif;
  --font-mono:    "JetBrains Mono", ui-monospace, monospace;
  --shadow-card:  0 1px 0 rgba(255, 255, 255, 0.02) inset,
                  0 24px 48px -24px rgba(0, 0, 0, 0.55);
  color-scheme: dark;
}

[data-theme="light"] {
  --ink:          #ece3cd;
  --ink-raised:   #f6efdc;
  --ink-soft:     #e4dac1;
  --ink-deep:     #d4c8a8;
  --paper:        #1a1528;
  --paper-dim:    #4a4257;
  --paper-mute:   #7a7180;
  --paper-faint:  #a79d98;
  --rule:         rgba(26, 21, 40, 0.11);
  --rule-strong:  rgba(26, 21, 40, 0.22);
  --rule-accent:  rgba(180, 65, 12, 0.42);
  --accent:       #b8410c;
  --accent-dim:   #923208;
  --accent-soft:  rgba(184, 65, 12, 0.07);
  --ok:           #2f7b4d;
  --warn:         #8f5a10;
  --err:          #932f2f;
  --neutral:      #7a7180;
  --shadow-card:  0 1px 0 rgba(255, 250, 235, 0.6) inset,
                  0 1px 0 rgba(120, 90, 40, 0.05),
                  0 22px 40px -28px rgba(90, 60, 20, 0.28);
  color-scheme: light;
}

* { margin: 0; padding: 0; box-sizing: border-box; }
html, body { min-height: 100%; }
body {
  font-family: var(--font-body);
  font-size: 15px;
  line-height: 1.55;
  background: var(--ink);
  color: var(--paper);
  -webkit-font-smoothing: antialiased;
  position: relative;
}
body::before {
  content: "";
  position: fixed;
  inset: 0;
  pointer-events: none;
  opacity: 0.035;
  mix-blend-mode: overlay;
  background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.6 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>");
  z-index: 0;
}
[data-theme="light"] body::before { opacity: 0.06; mix-blend-mode: multiply; }
body::after {
  content: "";
  position: fixed;
  inset: 0;
  pointer-events: none;
  background: radial-gradient(ellipse at 50% 0%,
    transparent 0%, transparent 45%, var(--ink-deep) 110%);
  opacity: 0.55;
  z-index: 0;
}
[data-theme="light"] body::after {
  background: radial-gradient(ellipse at 50% -10%,
    rgba(255, 250, 235, 0.6) 0%,
    transparent 40%,
    var(--ink-deep) 115%);
  opacity: 0.7;
}

.console {
  --col-min: 360px;
  --col-max: 460px;
  --col-gap: 20px;
  --page-pad: clamp(28px, 5vw, 100px);
  --layout-cols: 6;
  --main-cols: 4;
  position: relative;
  z-index: 1;
  width: 100%;
  max-width: 3060px;
  margin: 0 auto;
  padding: 52px var(--page-pad) 72px;
}

.masthead {
  position: relative;
  margin-bottom: 40px;
  padding-bottom: 28px;
  border-bottom: 1px solid var(--rule-strong);
}
.masthead::after {
  content: "";
  position: absolute;
  left: 0; bottom: -1px;
  width: 120px; height: 1px;
  background: var(--accent);
}
.eyebrow {
  font-family: var(--font-mono);
  font-size: 10.5px;
  font-weight: 500;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: var(--paper-mute);
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 18px;
}
.eyebrow::before {
  content: "";
  width: 18px; height: 1px;
  background: var(--accent);
}
.brand {
  font-family: var(--font-display);
  font-variation-settings: "opsz" 144, "SOFT" 50, "wght" 380;
  font-size: clamp(2.75rem, 6vw, 5.5rem);
  line-height: 0.92;
  letter-spacing: -0.025em;
  color: var(--paper);
}
[data-theme="light"] .brand {
  font-variation-settings: "opsz" 144, "SOFT" 40, "wght" 420;
}
.brand em {
  font-style: italic;
  font-variation-settings: "opsz" 144, "SOFT" 100, "wght" 300;
  color: var(--accent);
}
.sub-deck {
  margin-top: 18px;
  max-width: 64ch;
  color: var(--paper-dim);
  font-size: 15px;
  line-height: 1.55;
}
.pulse {
  width: 6px; height: 6px; border-radius: 50%;
  background: var(--ok);
  animation: pulse 2.4s ease-in-out infinite;
}
@keyframes pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(104, 204, 139, 0.45); }
  50%      { box-shadow: 0 0 0 6px rgba(104, 204, 139, 0); }
}
.scoreboard {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 0;
  margin-top: 36px;
}
.scoreboard-tile { padding: 0 22px; }
.scoreboard-tile:first-child { padding-left: 0; }
.scoreboard-label {
  font-family: var(--font-mono);
  font-size: 9.5px;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: var(--paper-faint);
  margin-bottom: 6px;
}
.scoreboard-value {
  font-family: var(--font-mono);
  font-size: 14px;
  color: var(--paper);
  letter-spacing: 0.02em;
  font-variant-numeric: tabular-nums;
}
.scoreboard-value a { color: var(--accent); text-decoration: none; }
.scoreboard-value a:hover { text-decoration: underline; }
@media (max-width: 900px) {
  .scoreboard { grid-template-columns: 1fr 1fr; gap: 14px 0; }
  .scoreboard-tile { padding: 0 16px; }
  .scoreboard-tile:nth-child(odd) { padding-left: 0; }
}

.layout {
  display: grid;
  grid-template-columns: repeat(var(--layout-cols), minmax(var(--col-min), var(--col-max)));
  gap: var(--col-gap);
  align-items: flex-start;
  justify-content: center;
}
.identity-column,
.sidebar-column {
  display: flex;
  flex-direction: column;
  gap: 20px;
  min-width: 0;
}
.layout.has-identity .identity-column { grid-column: 1; grid-row: 1; }
.main-column {
  grid-column: 1 / span var(--main-cols);
  grid-row: 1;
  min-width: 0;
  display: grid;
  grid-template-columns: repeat(var(--main-cols), minmax(0, 1fr));
  gap: var(--col-gap);
  grid-auto-flow: dense;
}
.layout.has-identity .main-column { grid-column: 2 / span var(--main-cols); }
.sidebar-column { grid-column: -2; grid-row: 1; }
.layout:not(.has-identity) .main-column {
  grid-column: 1 / span 5;
  grid-template-columns: repeat(5, minmax(0, 1fr));
}

@media (max-width: 2539px) {
  .console { --layout-cols: 5; --main-cols: 3; }
  .layout:not(.has-identity) .main-column {
    grid-column: 1 / span 4;
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}
@media (max-width: 2100px) {
  .console { --layout-cols: 4; --main-cols: 2; }
  .layout:not(.has-identity) .main-column {
    grid-column: 1 / span 3;
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
@media (max-width: 1700px) {
  .console { --layout-cols: 3; --main-cols: 1; }
  .layout:not(.has-identity) .main-column {
    grid-column: 1 / span 2;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (max-width: 1280px) {
  .console { --layout-cols: 2; --main-cols: 1; }
  .layout { grid-template-columns: minmax(0, 1fr) minmax(var(--col-min), var(--col-max)); }
  .layout.has-identity .identity-column { grid-column: 2; grid-row: 1; }
  .main-column,
  .layout.has-identity .main-column {
    grid-column: 1;
    grid-row: 1 / span 2;
    grid-template-columns: 1fr;
  }
  .sidebar-column { grid-column: 2; grid-row: 2; }
  .layout:not(.has-identity) .main-column {
    grid-column: 1;
    grid-row: 1;
    grid-template-columns: 1fr;
  }
  .layout:not(.has-identity) .sidebar-column {
    grid-column: 2;
    grid-row: 1;
  }
}
@media (max-width: 900px) {
  .console { --layout-cols: 1; --main-cols: 1; }
  .layout { grid-template-columns: 1fr; }
  .main-column,
  .layout.has-identity .main-column,
  .layout:not(.has-identity) .main-column,
  .layout.has-identity .identity-column,
  .sidebar-column,
  .layout:not(.has-identity) .sidebar-column {
    grid-column: 1;
    grid-row: auto;
    width: 100%;
  }
  .layout:not(.has-identity) .main-column { grid-template-columns: 1fr; }
}
@media (max-width: 640px) {
  .console { padding: 28px 18px 56px; }
}

.card {
  background: var(--ink-raised);
  border: 1px solid var(--rule-strong);
  border-radius: 4px;
  padding: 22px 24px 24px;
  position: relative;
  box-shadow: var(--shadow-card);
}
.card--entity-summary { padding: 28px 32px 32px; }

.operator-gate {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 18px;
  align-items: center;
  background:
    linear-gradient(135deg, rgba(255, 139, 61, 0.12), transparent 42%),
    var(--ink-raised);
}
.operator-gate p {
  margin-top: 10px;
  color: var(--paper-dim);
  font-size: 13.5px;
}
.operator-gate-link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 38px;
  padding: 0 14px;
  border: 1px solid rgba(255, 139, 61, 0.55);
  border-radius: 999px;
  background: var(--accent);
  color: var(--ink-deep);
  font-family: var(--font-mono);
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  text-decoration: none;
  white-space: nowrap;
}
.operator-gate-link:hover { filter: brightness(1.06); transform: translateY(-1px); }
@media (max-width: 640px) {
  .operator-gate { grid-template-columns: 1fr; }
  .operator-gate-link { justify-self: start; }
}

.card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 18px;
}
.card-title {
  font-family: var(--font-mono);
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: var(--paper-mute);
  display: inline-flex;
  align-items: center;
  gap: 10px;
}
.card-title::before {
  content: "";
  width: 4px; height: 4px;
  background: var(--accent);
  border-radius: 50%;
}
.card-subtitle {
  font-family: var(--font-mono);
  font-size: 10.5px;
  letter-spacing: 0.12em;
  color: var(--paper-faint);
  text-transform: uppercase;
}

.muted { color: var(--paper-mute); font-size: 13px; }

.entities {
  display: grid;
  grid-template-columns: minmax(0, 1.05fr) minmax(0, 1.15fr);
  gap: 36px;
  align-items: end;
}
@media (max-width: 720px) {
  .entities { grid-template-columns: 1fr; gap: 24px; align-items: start; }
}
.entity-summary-number {
  font-family: var(--font-display);
  font-variation-settings: "opsz" 144, "SOFT" 20, "wght" 350;
  font-size: clamp(5rem, 10vw, 7.5rem);
  line-height: 0.85;
  letter-spacing: -0.04em;
  color: var(--paper);
  font-variant-numeric: tabular-nums;
}
[data-theme="light"] .entity-summary-number {
  font-variation-settings: "opsz" 144, "SOFT" 30, "wght" 420;
}
.entity-summary-label {
  margin-top: 14px;
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--paper-mute);
}
.breakdown {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0;
}
.breakdown-row {
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: baseline;
  gap: 12px;
  padding: 11px 0;
  border-top: 1px solid var(--rule);
}
.breakdown-row:nth-child(1),
.breakdown-row:nth-child(2) { border-top: none; }
.breakdown-row:nth-child(odd) { padding-right: 18px; }
.breakdown-row:nth-child(even) {
  padding-left: 18px;
  border-left: 1px solid var(--rule);
}
.breakdown-name { font-size: 13px; color: var(--paper-dim); }
.breakdown-count {
  font-family: var(--font-mono);
  font-size: 14px;
  font-weight: 500;
  color: var(--paper);
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.01em;
}
.breakdown-bar {
  grid-column: 1 / -1;
  margin-top: 6px;
  height: 1px;
  background: var(--rule);
  position: relative;
  overflow: hidden;
}
.breakdown-bar > i {
  position: absolute;
  inset: 0 auto 0 0;
  background: var(--accent);
  opacity: 0.55;
}
.main-column > .card--entity-summary,
.main-column > .widget-card--wide { grid-column: span 2; }
@media (max-width: 1700px) {
  .layout.has-identity .main-column > .card--entity-summary,
  .layout.has-identity .main-column > .widget-card--wide { grid-column: span 1; }
}
@media (max-width: 1280px) {
  .main-column > .card--entity-summary,
  .main-column > .widget-card--wide { grid-column: span 1; }
}

.identity-card {
  background:
    linear-gradient(135deg, rgba(255, 139, 61, 0.06), transparent 45%),
    var(--ink-raised);
}
.identity-sections {
  display: grid;
  gap: 16px;
}
.identity-section {
  padding-top: 14px;
  border-top: 1px solid var(--rule);
}
.identity-section:first-child {
  padding-top: 0;
  border-top: none;
}
.identity-label {
  margin-bottom: 7px;
  font-family: var(--font-mono);
  font-size: 9.5px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--paper-faint);
}
.identity-role {
  font-size: 15px;
  font-weight: 500;
  color: var(--paper);
  letter-spacing: -0.005em;
  line-height: 1.35;
}
.identity-purpose {
  margin: 0;
  font-size: 13px;
  line-height: 1.55;
  color: var(--paper-dim);
}
.values {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 6px;
}
.value {
  font-family: var(--font-mono);
  font-size: 10px;
  letter-spacing: 0.08em;
  text-transform: lowercase;
  color: var(--paper-dim);
  padding: 3px 8px;
  border: 1px solid var(--rule-strong);
  border-radius: 100px;
}

.kv { display: flex; flex-direction: column; }
.kv-row {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 16px;
  align-items: baseline;
  padding: 8px 0;
  border-top: 1px solid var(--rule);
}
.kv-row:first-child { border-top: none; }
.kv-row dt {
  font-size: 12px;
  color: var(--paper-mute);
  font-family: var(--font-mono);
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
.kv-row dd {
  font-size: 13px;
  color: var(--paper);
  font-variant-numeric: tabular-nums;
  text-align: right;
  word-break: break-word;
}
.runtime-card {
  background:
    linear-gradient(135deg, rgba(241, 234, 221, 0.025), transparent 48%),
    var(--ink-raised);
}
.runtime-card .kv-row { padding: 7px 0; }
.runtime-card .kv-row dt,
.runtime-card .kv-row dd { font-size: 11.5px; }

.list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; }
.list-item {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 16px;
  align-items: baseline;
  padding: 12px 4px;
  border-top: 1px solid var(--rule);
  transition: background 0.15s ease;
}
.list-item:first-child { border-top: none; }
.list-item:hover { background: var(--accent-soft); }
.list-main { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.list-name {
  font-size: 13.5px;
  color: var(--paper);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.list-desc {
  font-size: 12px;
  color: var(--paper-dim);
  line-height: 1.45;
}
.list-tags { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 2px; }
.tag {
  font-family: var(--font-mono);
  font-size: 9.5px;
  letter-spacing: 0.1em;
  text-transform: lowercase;
  color: var(--paper-mute);
  padding: 2px 7px;
  border: 1px solid var(--rule-strong);
  border-radius: 100px;
}
.list-meta { display: flex; align-items: center; gap: 6px; }
.list-meta-text {
  font-family: var(--font-mono);
  font-size: 10px;
  letter-spacing: 0.04em;
  color: var(--paper-mute);
  margin-top: 3px;
  font-variant-numeric: tabular-nums;
}
.list-meta-text .sep { color: var(--paper-faint); margin: 0 6px; }
.list-count {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--paper-dim);
  font-variant-numeric: tabular-nums;
}
.pill {
  font-family: var(--font-mono);
  font-size: 9.5px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  padding: 3px 8px;
  border-radius: 2px;
  color: var(--paper-mute);
  border: 1px solid var(--rule-strong);
}
.pill--warn { color: var(--warn); border-color: rgba(245, 193, 88, 0.35); }
.pill--err  { color: var(--err);  border-color: rgba(226, 109, 109, 0.4); }
.pill--ok   { color: var(--ok);   border-color: rgba(104, 204, 139, 0.35); }
.pill--mute { color: var(--paper-faint); }

.interactions-list,
.links { display: flex; flex-direction: column; }
.interaction-link {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 12px;
  align-items: center;
  padding: 12px 13px;
  border: 1px solid var(--rule);
  border-radius: 3px;
  background: rgba(255, 255, 255, 0.018);
  color: var(--paper);
  text-decoration: none;
  transition: border-color 0.15s ease, background 0.15s ease;
}
.interaction-link:hover {
  border-color: var(--rule-accent);
  background: var(--accent-soft);
}
.interaction-link strong,
.interaction-link em,
.interaction-link small { display: block; }
.interaction-link strong {
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}
.interaction-link em {
  margin-top: 4px;
  color: var(--paper-mute);
  font-size: 12.5px;
  font-style: normal;
  line-height: 1.35;
}
.interaction-link small {
  color: var(--accent);
  font-family: var(--font-mono);
  font-size: 9.5px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}
.link {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 3px 12px;
  align-items: baseline;
  padding: 10px 0;
  border-top: 1px solid var(--rule);
  text-decoration: none;
  color: inherit;
  transition: color 0.15s ease;
}
.link:first-child { border-top: none; }
.link dt {
  grid-column: 1;
  font-family: var(--font-mono);
  font-size: 10px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--paper-mute);
}
.link dd {
  grid-column: 1 / -1;
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--paper-dim);
  line-height: 1.35;
  overflow-wrap: anywhere;
}
.link .arrow {
  grid-column: 2;
  grid-row: 1;
  font-family: var(--font-mono);
  color: var(--paper-faint);
  font-size: 12px;
  transition: transform 0.2s ease, color 0.2s ease;
}
.link:hover dd { color: var(--accent); }
.link:hover .arrow { transform: translateX(3px); color: var(--accent); }

.pipeline-widget {
  min-width: 0;
}
.pipeline-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 12px;
}
.pipeline-tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 8px;
  border: 1px solid var(--rule-strong);
  border-radius: 100px;
  background: transparent;
  cursor: pointer;
  font-family: var(--font-mono);
  font-size: 9.5px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--paper-faint);
  transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
}
.pipeline-tab:hover {
  background: var(--accent-soft);
  border-color: var(--rule-accent);
  color: var(--paper);
}
.pipeline-tab.is-active {
  background: color-mix(in srgb, var(--ink-soft) 55%, transparent);
  border-color: var(--rule-accent);
  color: var(--paper);
}
.pipeline-summary-count {
  font-size: 11px;
  color: var(--paper);
  font-variant-numeric: tabular-nums;
}
.pipeline-summary-label {
  color: var(--paper-mute);
}
.pipeline-panel {
  display: none;
}
.pipeline-panel.is-active {
  display: block;
}
.pipeline-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 240px;
  overflow-y: auto;
  padding-right: 4px;
}
.pipeline-empty {
  padding: 8px 0;
  font-size: 12px;
  color: var(--paper-mute);
  font-style: italic;
}
.pipeline-item {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto auto;
  gap: 10px;
  align-items: center;
  padding: 8px 10px;
  border: 1px solid var(--rule);
  border-radius: 4px;
  background: color-mix(in srgb, var(--ink-soft) 35%, transparent);
}
.pipeline-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--neutral);
}
.pipeline-dot--draft { background: var(--neutral); }
.pipeline-dot--queued { background: var(--warn); }
.pipeline-dot--published { background: var(--ok); }
.pipeline-dot--failed { background: var(--err); }
.pipeline-name {
  min-width: 0;
  font-size: 13px;
  color: var(--paper);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.pipeline-type,
.pipeline-when {
  font-family: var(--font-mono);
  font-size: 10px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--paper-faint);
  white-space: nowrap;
}
.pipeline-type {
  font-size: 9px;
  letter-spacing: 0.06em;
  color: var(--paper-mute);
  opacity: 0.8;
}
.pipeline-when--err { color: var(--err); }
@media (max-width: 720px) {
  .pipeline-item {
    grid-template-columns: auto minmax(0, 1fr);
    align-items: start;
  }
  .pipeline-type,
  .pipeline-when {
    grid-column: 2;
    margin-top: 2px;
  }
}

.swot {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0;
}
.swot-cell {
  padding: 14px 18px 16px;
}
.swot-cell:nth-child(1) { padding-left: 0; padding-top: 2px; border-right: 1px solid var(--rule); border-bottom: 1px solid var(--rule); }
.swot-cell:nth-child(2) { padding-right: 0; padding-top: 2px; border-bottom: 1px solid var(--rule); }
.swot-cell:nth-child(3) { padding-left: 0; padding-bottom: 2px; border-right: 1px solid var(--rule); }
.swot-cell:nth-child(4) { padding-right: 0; padding-bottom: 2px; }
@media (max-width: 540px) {
  .swot { grid-template-columns: 1fr; }
  .swot-cell { padding: 14px 0; border-right: none !important; border-bottom: 1px solid var(--rule); }
  .swot-cell:last-child { border-bottom: none; }
}
.swot-head {
  font-family: var(--font-display);
  font-variation-settings: "opsz" 72, "SOFT" 50, "wght" 380;
  font-style: italic;
  font-size: 17px;
  letter-spacing: -0.005em;
  color: var(--paper);
  margin-bottom: 12px;
  line-height: 1;
  display: inline-flex;
  align-items: center;
  gap: 9px;
}
.swot-head::before {
  content: "";
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
}
.swot-cell.is-s .swot-head::before { background: var(--ok); }
.swot-cell.is-w .swot-head::before { background: var(--warn); }
.swot-cell.is-o .swot-head::before { background: var(--accent); }
.swot-cell.is-t .swot-head::before { background: var(--err); }
.swot-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 7px;
}
.swot-item {
  font-size: 13px;
  line-height: 1.5;
  color: var(--paper-dim);
}
.swot-item b {
  color: var(--paper);
  font-weight: 500;
}
.swot-empty {
  color: var(--paper-mute);
  font-size: 12.5px;
}

.view-tabs {
  display: flex;
  gap: 24px;
  margin-bottom: 20px;
  border-bottom: 1px solid var(--rule);
  padding-bottom: 2px;
}
.view-tab {
  background: transparent;
  border: none;
  padding: 2px 0 10px;
  margin-bottom: -1px;
  cursor: pointer;
  font-family: var(--font-mono);
  font-size: 10.5px;
  font-weight: 500;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--paper-faint);
  border-bottom: 1px solid transparent;
  transition: color 0.2s ease, border-color 0.2s ease;
  display: inline-flex;
  align-items: baseline;
  gap: 8px;
}
.view-tab:hover { color: var(--paper-dim); }
.view-tab.is-active {
  color: var(--paper);
  border-bottom-color: var(--accent);
}
.view-tab-count {
  font-size: 10px;
  color: var(--paper-mute);
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.04em;
}
.view-tab.is-active .view-tab-count {
  color: var(--paper-dim);
}

.agent-network-view-tabs {
  display: flex;
  gap: 24px;
  margin-bottom: 20px;
  border-bottom: 1px solid var(--rule);
  padding-bottom: 2px;
}
.agent-network-view-tab {
  background: transparent;
  border: none;
  padding: 2px 0 10px;
  margin-bottom: -1px;
  cursor: pointer;
  font-family: var(--font-mono);
  font-size: 10.5px;
  font-weight: 500;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--paper-faint);
  border-bottom: 1px solid transparent;
  transition: color 0.2s ease, border-color 0.2s ease;
  display: inline-flex;
  align-items: baseline;
  gap: 8px;
}
.agent-network-view-tab:hover { color: var(--paper-dim); }
.agent-network-view-tab.is-active {
  color: var(--paper);
  border-bottom-color: var(--accent);
}
.agent-network-view-count {
  font-size: 10px;
  color: var(--paper-mute);
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.04em;
}
.agent-network-view-tab.is-active .agent-network-view-count {
  color: var(--paper-dim);
}
.agent-network-kind-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 14px;
}
.agent-network-kind-tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 10px;
  border: 1px solid var(--rule-strong);
  border-radius: 100px;
  background: transparent;
  cursor: pointer;
  font-family: var(--font-mono);
  font-size: 9.5px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--paper-faint);
  transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
}
.agent-network-kind-tab:hover {
  background: var(--accent-soft);
  border-color: var(--rule-accent);
  color: var(--paper);
}
.agent-network-kind-tab.is-active {
  background: color-mix(in srgb, var(--ink-soft) 55%, transparent);
  border-color: var(--rule-accent);
  color: var(--paper);
}
.agent-network-kind-count {
  font-size: 11px;
  color: var(--paper);
  font-variant-numeric: tabular-nums;
}
.agent-network-kind-label { color: var(--paper-mute); }
.agent-network-kind-tab.is-active .agent-network-kind-label {
  color: var(--paper-dim);
}
.agent-network-panel { display: none; }
.agent-network-panel.is-active { display: block; }
.agent-network-empty {
  padding: 18px 4px;
  font-size: 12.5px;
  color: var(--paper-mute);
  font-style: italic;
}
.agent-network-list {
  max-height: 320px;
  overflow-y: auto;
  padding-right: 4px;
  scrollbar-width: thin;
  scrollbar-color: var(--rule-strong) transparent;
}
.agent-network-list::-webkit-scrollbar { width: 6px; }
.agent-network-list::-webkit-scrollbar-thumb {
  background: var(--rule-strong);
  border-radius: 3px;
}
.agent-network-list::-webkit-scrollbar-track { background: transparent; }
.agent-network-source {
  display: inline-flex;
  align-items: center;
  font-family: var(--font-mono);
  font-size: 9.5px;
  letter-spacing: 0.1em;
  text-transform: lowercase;
  padding: 2px 7px;
  border: 1px solid var(--rule-strong);
  border-radius: 100px;
  color: var(--paper-mute);
}
.agent-network-source.is-brain {
  color: var(--accent);
  border-color: var(--rule-accent);
  background: var(--accent-soft);
}
.agent-network-filter-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 12px;
}
.agent-network-filter {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 8px;
  border: 1px solid var(--rule-strong);
  border-radius: 100px;
  background: transparent;
  cursor: pointer;
  font-family: var(--font-mono);
  font-size: 9.5px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--paper-faint);
  transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
}
.agent-network-filter:hover {
  background: var(--accent-soft);
  border-color: var(--rule-accent);
  color: var(--paper);
}
.agent-network-filter.is-active {
  background: color-mix(in srgb, var(--ink-soft) 55%, transparent);
  border-color: var(--rule-accent);
  color: var(--paper);
}
.agent-network-filter .count {
  font-size: 11px;
  color: var(--paper);
  font-variant-numeric: tabular-nums;
}
.agent-network-filter .label { color: var(--paper-mute); }
.agent-network-filter.is-active .label { color: var(--paper-dim); }
.agent-network-filter.is-gap .count { color: var(--warn); }
.agent-network-skill-row[data-hidden] { display: none; }
[data-agent-network-view="overview"] .agent-network-kind-tabs,
[data-agent-network-view="skills"] .agent-network-kind-tabs { display: none; }
@media (prefers-reduced-motion: no-preference) {
  [data-agent-network-view="overview"] .agent-network-panel.is-active,
  [data-agent-network-view="skills"] .agent-network-panel.is-active {
    animation: panelRise 0.32s cubic-bezier(0.2, 0.7, 0.2, 1);
  }
  @keyframes panelRise {
    from { opacity: 0; transform: translateY(4px); }
    to   { opacity: 1; transform: translateY(0); }
  }
}

.colophon {
  margin-top: 56px;
  padding-top: 18px;
  border-top: 1px solid var(--rule);
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 18px;
  font-family: var(--font-mono);
  font-size: 10px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--paper-faint);
}
.colophon-mark { color: var(--paper-faint); }
.colophon-actions {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 16px;
  justify-content: flex-end;
}
.colophon a,
.colophon button {
  color: var(--paper-mute);
  background: none;
  border: none;
  font: inherit;
  letter-spacing: inherit;
  text-transform: inherit;
  cursor: pointer;
  padding: 0;
  text-decoration: none;
}
.colophon a:hover,
.colophon button:hover { color: var(--accent); }
@media (max-width: 700px) {
  .colophon { flex-direction: column; align-items: flex-start; }
  .colophon-actions { justify-content: flex-start; }
}

@media (prefers-reduced-motion: no-preference) {
  .identity-column > *,
  .main-column > *,
  .sidebar-column > * {
    opacity: 0;
    transform: translateY(8px);
    animation: rise 0.6s cubic-bezier(0.2, 0.7, 0.2, 1) forwards;
  }
  .identity-column > *:nth-child(1) { animation-delay: 0.05s; }
  .identity-column > *:nth-child(2) { animation-delay: 0.18s; }
  .identity-column > *:nth-child(3) { animation-delay: 0.30s; }
  .main-column    > *:nth-child(1) { animation-delay: 0.10s; }
  .main-column    > *:nth-child(2) { animation-delay: 0.22s; }
  .main-column    > *:nth-child(3) { animation-delay: 0.34s; }
  .sidebar-column > *:nth-child(1) { animation-delay: 0.14s; }
  .sidebar-column > *:nth-child(2) { animation-delay: 0.26s; }
  .sidebar-column > *:nth-child(3) { animation-delay: 0.38s; }
  .masthead { animation: rise 0.6s cubic-bezier(0.2, 0.7, 0.2, 1) both; }
  @keyframes rise { to { opacity: 1; transform: translateY(0); } }
}
`;
