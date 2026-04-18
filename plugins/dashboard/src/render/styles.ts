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
  position: relative;
  z-index: 1;
  max-width: 1240px;
  margin: 0 auto;
  padding: 44px 32px 72px;
}

.masthead {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 24px;
  align-items: end;
  padding-bottom: 20px;
  margin-bottom: 36px;
  border-bottom: 1px solid var(--rule-strong);
  position: relative;
}
.masthead::after {
  content: "";
  position: absolute;
  left: 0; bottom: -1px;
  width: 84px; height: 1px;
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
  margin-bottom: 14px;
}
.eyebrow::before {
  content: "";
  width: 18px; height: 1px;
  background: var(--accent);
}
.brand {
  font-family: var(--font-display);
  font-variation-settings: "opsz" 144, "SOFT" 50, "wght" 380;
  font-size: clamp(2.75rem, 5.5vw, 4rem);
  line-height: 0.95;
  letter-spacing: -0.02em;
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
  margin-top: 14px;
  max-width: 56ch;
  color: var(--paper-dim);
  font-size: 14.5px;
  line-height: 1.5;
}
.masthead-meta {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 6px;
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--paper-mute);
  letter-spacing: 0.04em;
}
.masthead-meta .line { display: flex; align-items: center; gap: 8px; }
.masthead-meta .label {
  text-transform: uppercase;
  font-size: 9.5px;
  letter-spacing: 0.2em;
  color: var(--paper-faint);
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

.layout {
  display: flex;
  gap: 20px;
  align-items: flex-start;
}
.main-column {
  flex: 1 1 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 20px;
}
.sidebar-column {
  flex: 0 0 300px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}
@media (max-width: 1024px) {
  .layout { flex-direction: column; align-items: stretch; }
  .sidebar-column { flex: 1 1 auto; width: 100%; }
}
@media (max-width: 640px) {
  .console { padding: 28px 18px 56px; }
  .masthead { grid-template-columns: 1fr; align-items: start; }
  .masthead-meta { align-items: flex-start; }
}

.card {
  background: var(--ink-raised);
  border: 1px solid var(--rule-strong);
  border-radius: 4px;
  padding: 22px 24px 24px;
  position: relative;
  box-shadow: var(--shadow-card);
}
.card--hero { padding: 28px 32px 32px; }

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
.hero-number {
  font-family: var(--font-display);
  font-variation-settings: "opsz" 144, "SOFT" 20, "wght" 350;
  font-size: clamp(5rem, 10vw, 7.5rem);
  line-height: 0.85;
  letter-spacing: -0.04em;
  color: var(--paper);
  font-variant-numeric: tabular-nums;
}
[data-theme="light"] .hero-number {
  font-variation-settings: "opsz" 144, "SOFT" 30, "wght" 420;
}
.hero-label {
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

.identity-role {
  font-size: 14px;
  font-weight: 500;
  color: var(--paper);
  letter-spacing: -0.005em;
}
.identity-purpose {
  margin-top: 10px;
  font-size: 13px;
  line-height: 1.55;
  color: var(--paper-dim);
}
.values {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 6px;
  margin-top: 14px;
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

.links { display: flex; flex-direction: column; }
.link {
  display: grid;
  grid-template-columns: 72px 1fr auto;
  gap: 12px;
  align-items: baseline;
  padding: 10px 0;
  border-top: 1px solid var(--rule);
  text-decoration: none;
  color: inherit;
  transition: color 0.15s ease;
}
.link:first-child { border-top: none; }
.link dt {
  font-family: var(--font-mono);
  font-size: 10px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--paper-mute);
}
.link dd {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--paper-dim);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.link .arrow {
  font-family: var(--font-mono);
  color: var(--paper-faint);
  font-size: 12px;
  transition: transform 0.2s ease, color 0.2s ease;
}
.link:hover dd { color: var(--accent); }
.link:hover .arrow { transform: translateX(3px); color: var(--accent); }

.pipeline-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 14px;
}
.pipeline-summary-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 8px;
  border: 1px solid var(--rule-strong);
  border-radius: 100px;
  font-family: var(--font-mono);
  font-size: 9.5px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--paper-faint);
}
.pipeline-summary-count {
  font-size: 11px;
  color: var(--paper);
  font-variant-numeric: tabular-nums;
}
.pipeline-summary-label {
  color: var(--paper-mute);
}
.pipeline-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.pipeline-item {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto auto;
  gap: 10px;
  align-items: center;
  padding: 9px 10px;
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

.colophon {
  margin-top: 48px;
  padding-top: 20px;
  border-top: 1px solid var(--rule);
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 24px;
  font-family: var(--font-mono);
  font-size: 10.5px;
  color: var(--paper-faint);
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.theme-toggle {
  position: fixed;
  bottom: 20px;
  right: 20px;
  background: var(--ink-raised);
  border: 1px solid var(--rule-strong);
  color: var(--paper-dim);
  padding: 8px 14px;
  border-radius: 100px;
  cursor: pointer;
  font-family: var(--font-mono);
  font-size: 10px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  z-index: 50;
  transition: color 0.15s ease, border-color 0.15s ease;
}
.theme-toggle:hover { color: var(--accent); border-color: var(--rule-accent); }

@media (prefers-reduced-motion: no-preference) {
  .main-column > *,
  .sidebar-column > * {
    opacity: 0;
    transform: translateY(8px);
    animation: rise 0.6s cubic-bezier(0.2, 0.7, 0.2, 1) forwards;
  }
  .main-column    > *:nth-child(1) { animation-delay: 0.05s; }
  .main-column    > *:nth-child(2) { animation-delay: 0.20s; }
  .main-column    > *:nth-child(3) { animation-delay: 0.35s; }
  .sidebar-column > *:nth-child(1) { animation-delay: 0.15s; }
  .sidebar-column > *:nth-child(2) { animation-delay: 0.30s; }
  .masthead { animation: rise 0.6s cubic-bezier(0.2, 0.7, 0.2, 1) both; }
  @keyframes rise { to { opacity: 1; transform: translateY(0); } }
}
`;
