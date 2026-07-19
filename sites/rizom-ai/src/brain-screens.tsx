/** @jsxImportSource preact */
import type { JSX } from "preact";

/**
 * The /brain product screens — fixed-instrument-climate mocks of the real
 * interfaces (dashboard, chat, its integrations, the studio), used as
 * illustrations for the four chapters. Like the growth diagram, these are
 * self-contained presentational components with illustrative fixture data;
 * the surrounding editorial copy is content-authored per section.
 *
 * They keep a dark palette in both site themes on purpose — they read as
 * screenshots of a product, not as site chrome — so their styles are inlined
 * and scoped under `.brain-screen`, only borrowing the theme's font stacks.
 */

export const SCREEN_STYLES = `
.brain-screen { --scr-mono: var(--font-mono); --scr-display: var(--font-display); --scr-ui: var(--font-body); }
.brain-screen .ifc-frame { background: #0a0819; border: 1px solid rgba(241,234,221,.13); border-radius: 10px; overflow: hidden; box-shadow: 0 34px 80px -26px rgba(0,0,0,.85); color: #f1eadd; font-size: 13px; line-height: 1.5; }
.brain-screen .ifc-bar { display: flex; align-items: center; gap: 7px; padding: 9px 14px; border-bottom: 1px solid rgba(241,234,221,.09); background: rgba(241,234,221,.03); }
.brain-screen .ifc-bar i { width: 8px; height: 8px; border-radius: 50%; background: rgba(241,234,221,.13); }
.brain-screen .ifc-bar span { margin-left: 8px; font-family: var(--scr-mono); font-size: 10px; letter-spacing: .06em; color: rgba(241,234,221,.35); }
.brain-screen .ifc-strip { display: flex; align-items: center; gap: 16px; padding: 10px 16px; border-bottom: 1px solid rgba(241,234,221,.12); font-family: var(--scr-mono); font-size: 10.5px; }
.brain-screen .ifc-strip .mark { display: inline-flex; align-items: center; gap: 8px; letter-spacing: .14em; text-transform: uppercase; color: rgba(241,234,221,.6); }
.brain-screen .ifc-strip .mark::before { content: ""; width: 6px; height: 6px; border-radius: 50%; background: #ff8b3d; }
.brain-screen .ifc-strip .snav { display: flex; gap: 4px; font-family: var(--scr-ui); font-size: 12px; }
.brain-screen .ifc-strip .snav span { padding: 4px 10px; border-radius: 6px; color: rgba(241,234,221,.4); }
.brain-screen .ifc-strip .snav span.on { color: #f1eadd; background: rgba(241,234,221,.08); }
.brain-screen .ifc-strip .admin { margin-left: auto; display: inline-flex; align-items: center; gap: 6px; padding: 3px 10px; border-radius: 999px; background: rgba(104,204,139,.13); color: #68cc8b; font-size: 10px; }
.brain-screen .ifc-strip .admin::before { content: ""; width: 5px; height: 5px; border-radius: 50%; background: #68cc8b; }
.brain-screen .ifc-tabs { display: flex; gap: 2px; padding: 8px 16px 0; border-bottom: 1px solid rgba(241,234,221,.12); font-family: var(--scr-mono); font-size: 10.5px; }
.brain-screen .ifc-tabs span { padding: 6px 12px 8px; color: rgba(241,234,221,.38); border-bottom: 2px solid transparent; transform: translateY(1px); }
.brain-screen .ifc-tabs span.on { color: #f1eadd; border-bottom-color: #ff8b3d; }
.brain-screen .ifc-card { background: #14112b; border: 1px solid rgba(241,234,221,.12); border-radius: 8px; padding: 10px 12px 12px; min-width: 0; }
.brain-screen .ifc-card .ct { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; font-family: var(--scr-mono); font-size: 9px; letter-spacing: .16em; text-transform: uppercase; color: rgba(241,234,221,.4); margin-bottom: 8px; }
.brain-screen .ifc-card .ct small { letter-spacing: .04em; text-transform: none; color: rgba(241,234,221,.22); }
.brain-screen .ifc-chat .body { padding: 16px 16px 14px; }
.brain-screen .ifc-eyebrow { font-family: var(--scr-mono); font-size: 9px; letter-spacing: .2em; text-transform: uppercase; color: rgba(241,234,221,.35); }
.brain-screen .ifc-chat h6 { font-family: var(--scr-display); font-variation-settings: "SOFT" 80, "opsz" 72; font-weight: 520; font-size: 21px; margin: 4px 0 0; }
.brain-screen .ifc-chat h6 em { font-style: italic; color: #ff8b3d; font-weight: 450; }
.brain-screen .ifc-msgs { margin-top: 14px; display: flex; flex-direction: column; gap: 10px; }
.brain-screen .ifc-msg { max-width: 88%; padding: 9px 13px; border-radius: 10px; font-size: 12.5px; }
.brain-screen .ifc-msg .who { display: block; font-family: var(--scr-mono); font-size: 8.5px; letter-spacing: .18em; text-transform: uppercase; color: rgba(241,234,221,.35); margin-bottom: 4px; }
.brain-screen .ifc-msg.you { align-self: flex-end; background: rgba(255,139,61,.13); border: 1px solid rgba(255,139,61,.25); }
.brain-screen .ifc-msg.brain { align-self: flex-start; background: rgba(241,234,221,.05); border: 1px solid rgba(241,234,221,.1); }
.brain-screen .ifc-msg .src { display: inline-block; margin-top: 6px; font-family: var(--scr-mono); font-size: 9px; color: rgba(255,163,102,.75); }
.brain-screen .ifc-status { margin-top: 12px; font-family: var(--scr-display); font-style: italic; font-size: 12.5px; color: rgba(241,234,221,.4); }
.brain-screen .ifc-status i { display: inline-block; width: 5px; height: 5px; border-radius: 50%; background: #ff8b3d; margin-right: 7px; vertical-align: 2px; animation: brainScreenFlicker 2.2s ease-in-out infinite; }
.brain-screen .ifc-prompt { display: flex; align-items: center; gap: 10px; margin-top: 10px; padding: 10px 12px; border: 1px solid rgba(241,234,221,.16); border-radius: 9px; background: rgba(241,234,221,.03); font-size: 12.5px; color: rgba(241,234,221,.35); }
.brain-screen .ifc-prompt b { margin-left: auto; width: 24px; height: 24px; display: grid; place-items: center; border-radius: 6px; background: #ff8b3d; color: #0a0819; font-weight: 600; }
.brain-screen .dash-canvas { padding: 14px 16px 16px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
.brain-screen .krow { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; padding: 5.5px 0; border-top: 1px solid rgba(241,234,221,.06); font-size: 11.5px; }
.brain-screen .krow:first-child { border-top: none; }
.brain-screen .krow dt { font-family: var(--scr-mono); font-size: 9.5px; letter-spacing: .08em; color: rgba(241,234,221,.38); white-space: nowrap; }
.brain-screen .krow dd { color: rgba(241,234,221,.8); text-align: right; }
.brain-screen .krow dd.ok { color: #68cc8b; }
.brain-screen .dim-arrow { color: rgba(255,163,102,.7); font-size: 10px; }
.brain-screen .ifc-card .big { font-family: var(--scr-display); font-variation-settings: "opsz" 144, "SOFT" 20; font-weight: 330; font-size: 38px; line-height: .9; letter-spacing: -.03em; text-shadow: 0 0 26px rgba(255,163,102,.18); }
.brain-screen .ifc-card .biglabel { margin-top: 7px; font-family: var(--scr-mono); font-size: 8.5px; letter-spacing: .2em; text-transform: uppercase; color: rgba(241,234,221,.4); }
.brain-screen .vals { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 10px; }
.brain-screen .vals i { font-style: normal; font-family: var(--scr-mono); font-size: 9px; padding: 2px 9px; border: 1px solid rgba(241,234,221,.16); border-radius: 100px; color: rgba(241,234,221,.6); }
.brain-screen .intg { display: flex; flex-direction: column; gap: 14px; }
.brain-screen .dsc { padding: 12px 14px; display: flex; flex-direction: column; gap: 11px; }
.brain-screen .dsc-row { display: flex; gap: 10px; font-size: 12px; }
.brain-screen .dsc-av { flex: none; width: 26px; height: 26px; border-radius: 50%; display: grid; place-items: center; font-family: var(--scr-mono); font-size: 10px; color: #f1eadd; }
.brain-screen .dsc-name { font-weight: 600; font-size: 12px; }
.brain-screen .dsc-bot { font-style: normal; font-family: var(--scr-mono); font-size: 8px; background: #5865f2; padding: 1px 5px; border-radius: 3px; margin-left: 6px; vertical-align: 1px; }
.brain-screen .dsc-text { color: rgba(241,234,221,.72); margin-top: 2px; font-size: 12px; }
.brain-screen .dsc-text u { text-decoration-color: rgba(255,163,102,.6); }
.brain-screen .mcp { background: #f4eee1; color: #33291c; border-color: rgba(51,41,28,.22); }
.brain-screen .mcp .ifc-bar { border-color: rgba(51,41,28,.12); background: rgba(51,41,28,.04); }
.brain-screen .mcp .ifc-bar i { background: rgba(51,41,28,.16); }
.brain-screen .mcp .ifc-bar span { color: rgba(51,41,28,.5); }
.brain-screen .mcp .body2 { padding: 12px 14px 13px; font-size: 12.5px; line-height: 1.55; }
.brain-screen .mcp .tool { font-family: var(--scr-mono); font-size: 10px; background: rgba(51,41,28,.05); border: 1px solid rgba(51,41,28,.14); border-radius: 7px; padding: 7px 10px; margin: 9px 0; color: #5c4a2e; }
.brain-screen .mcp .tool b { color: #a8551e; font-weight: 600; }
.brain-screen .term-mock { padding: 12px 14px; font-family: var(--scr-mono); font-size: 11.5px; line-height: 1.85; color: rgba(241,234,221,.72); }
.brain-screen .term-mock .ps { color: #ff8b3d; }
.brain-screen .term-mock .who { color: #8c82c8; }
.brain-screen .cms-appbar { display: flex; align-items: center; gap: 14px; padding: 9px 14px; border-bottom: 1px solid rgba(241,234,221,.1); }
.brain-screen .cms-appbar .crumbs { font-family: var(--scr-mono); font-size: 10px; color: rgba(241,234,221,.4); }
.brain-screen .cms-appbar .crumbs b { color: rgba(241,234,221,.85); font-weight: 500; }
.brain-screen .cms-appbar .pub { margin-left: auto; font-size: 11.5px; font-weight: 600; background: #ff8b3d; color: #0a0819; padding: 4px 13px; border-radius: 5px; }
.brain-screen .cms-cols { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.9fr); }
.brain-screen .cms-list { border-right: 1px solid rgba(241,234,221,.09); padding: 8px 0; }
.brain-screen .cms-item { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; padding: 7px 14px; font-size: 11.5px; color: rgba(241,234,221,.65); border-left: 2px solid transparent; }
.brain-screen .cms-item.on { background: rgba(255,139,61,.08); border-left-color: #ff8b3d; color: #f1eadd; }
.brain-screen .cms-kind { font-family: var(--scr-mono); font-size: 8.5px; color: rgba(241,234,221,.32); }
.brain-screen .cms-md { padding: 13px 18px 15px; font-family: var(--scr-mono); font-size: 11px; line-height: 1.85; color: rgba(241,234,221,.7); }
.brain-screen .cms-md .mh { color: #ffa366; }
.brain-screen .cms-md .mfm { color: rgba(140,130,200,.85); }
.brain-screen .cms-md .msy { color: rgba(241,234,221,.28); }
.brain-screen .cms-md .mem { font-style: italic; color: #f1eadd; }
.brain-screen .cms-foot { display: flex; align-items: center; gap: 12px; padding: 8px 14px; border-top: 1px solid rgba(241,234,221,.09); font-family: var(--scr-mono); font-size: 9.5px; color: rgba(241,234,221,.35); }
.brain-screen .cms-foot .fate { margin-left: auto; display: flex; gap: 6px; }
.brain-screen .cms-foot .fate span { padding: 2.5px 10px; border: 1px solid rgba(241,234,221,.16); border-radius: 100px; font-size: 8.5px; letter-spacing: .08em; }
.brain-screen .cms-foot .fate .on { background: #ff8b3d; color: #0a0819; border-color: #ff8b3d; }
@keyframes brainScreenFlicker { 0%, 100% { opacity: .75; } 50% { opacity: 1; } }
@media (prefers-reduced-motion: reduce) { .brain-screen .ifc-status i { animation: none; } }
@media (max-width: 900px) { .brain-screen .dash-canvas { grid-template-columns: 1fr; } .brain-screen .dash-canvas .ifc-card { grid-column: auto !important; } }
@media (max-width: 640px) {
  .brain-screen .ifc-strip { flex-wrap: wrap; row-gap: 6px; }
  .brain-screen .ifc-tabs { overflow-x: auto; }
  /* The studio's library pane becomes a horizontal file strip above the
     manuscript instead of a crushed side column. */
  .brain-screen .cms-cols { grid-template-columns: 1fr; }
  .brain-screen .cms-list { display: flex; gap: 2px; overflow-x: auto; padding: 8px 10px; border-right: 0; border-bottom: 1px solid rgba(241,234,221,.09); }
  .brain-screen .cms-item { flex: none; gap: 6px; padding: 5px 10px; border-left: 0; border-radius: 6px; }
}
`;

/** Emitted once per page; scopes all screen styles under `.brain-screen`. */
export function BrainScreenStyles(): JSX.Element {
  return <style>{SCREEN_STYLES}</style>;
}

/** The CMS studio: a markdown manuscript with the draft→publish flow. */
export function StudioScreen(): JSX.Element {
  return (
    <div class="brain-screen">
      <div class="ifc-frame">
        <div class="ifc-bar">
          <i />
          <i />
          <i />
          <span>mira.studio/studio</span>
        </div>
        <div class="cms-appbar">
          <span class="crumbs">
            library / essays / <b>distributed-teams.md</b>
          </span>
          <span class="pub">Publish</span>
        </div>
        <div class="cms-cols">
          <div class="cms-list">
            <div class="cms-item">
              <span>coordination-unit.md</span>
              <span class="cms-kind">essay</span>
            </div>
            <div class="cms-item on">
              <span>distributed-teams.md</span>
              <span class="cms-kind">essay</span>
            </div>
            <div class="cms-item">
              <span>calculator-launch.md</span>
              <span class="cms-kind">post</span>
            </div>
            <div class="cms-item">
              <span>tms-reading-list.md</span>
              <span class="cms-kind">note</span>
            </div>
          </div>
          <div class="cms-md">
            <span class="mfm">
              ---
              <br />
              title: Distributed teams outperform
              <br />
              series: essays · status: draft
              <br />
              ---
            </span>
            <br />
            <span class="mh"># Distributed teams outperform</span>
            <br />
            Teams don't fail because people are
            <br />
            <span class="msy">**</span>untalented<span class="msy">**</span>.
            They fail because nobody
            <br />
            mapped <span class="mem">who knows what</span> — and AI just
            <br />
            automates the confusion.
            <br />
          </div>
        </div>
        <div class="cms-foot">
          <span>committed a41f2c9 → rizom-ai/mira-content</span>
          <span class="fate">
            <span>draft</span>
            <span class="on">review</span>
            <span>publish</span>
          </span>
        </div>
      </div>
    </div>
  );
}

/** The web chat: an exchange that answers with sources and writes drafts back. */
export function ChatScreen(): JSX.Element {
  return (
    <div class="brain-screen">
      <div class="ifc-frame ifc-chat">
        <div class="ifc-bar">
          <i />
          <i />
          <i />
          <span>mira.studio/chat</span>
        </div>
        <div class="body">
          <span class="ifc-eyebrow">connected · Admin session</span>
          <h6>
            Talk to <em>your brain</em>
          </h6>
          <div class="ifc-msgs">
            <div class="ifc-msg you">
              <span class="who">you</span>What did we decide about the pricing
              page last month?
            </div>
            <div class="ifc-msg brain">
              <span class="who">mira</span>Three decisions, all in your March
              notes: keep the single tier, publish the calculator, park
              enterprise until Q3.<span class="src">→ 3 sources</span>
            </div>
            <div class="ifc-msg you">
              <span class="who">you</span>Draft a changelog entry for the
              calculator.
            </div>
            <div class="ifc-msg brain">
              <span class="who">mira</span>Drafted in your voice and saved as{" "}
              <b>posts/calculator-launch.md</b> — status: draft. Want it queued
              for review?
            </div>
          </div>
          <div class="ifc-status">
            <i />
            the rhizome is listening
          </div>
          <div class="ifc-prompt">
            Ask anything you've ever written down…<b>↑</b>
          </div>
        </div>
      </div>
    </div>
  );
}

/** The integrations stack: Discord, Claude over MCP, the terminal REPL. */
export function IntegrationsScreen(): JSX.Element {
  return (
    <div class="brain-screen">
      <div class="intg">
        <div class="ifc-frame">
          <div class="ifc-bar">
            <i />
            <i />
            <i />
            <span>Discord — #ask-mira</span>
          </div>
          <div class="dsc">
            <div class="dsc-row">
              <span class="dsc-av" style="background:#3d4a8a">
                T
              </span>
              <div>
                <span class="dsc-name">Tomás</span>
                <div class="dsc-text">
                  @mira what did the pilot retro conclude?
                </div>
              </div>
            </div>
            <div class="dsc-row">
              <span class="dsc-av" style="background:#7a4a12">
                M
              </span>
              <div>
                <span class="dsc-name">
                  mira<i class="dsc-bot">BOT</i>
                </span>
                <div class="dsc-text">
                  Two blockers: onboarding docs and the missing staging env.
                  Full notes → <u>retro-2026-06</u>.
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="ifc-frame mcp">
          <div class="ifc-bar">
            <i />
            <i />
            <i />
            <span>Claude — connected via MCP</span>
          </div>
          <div class="body2">
            Let me check Mira's brain for that.
            <div class="tool">
              ▸ <b>mira · system_search</b> "pilot retro blockers" → 6 entities
            </div>
            From the June retro notes: the pilot stalled on onboarding docs —
            Mira flagged the same pattern in two client engagements.
          </div>
        </div>
        <div class="ifc-frame">
          <div class="ifc-bar">
            <i />
            <i />
            <i />
            <span>terminal — brain chat</span>
          </div>
          <div class="term-mock">
            <span class="ps">$</span> brain chat
            <br />
            <span class="who">mira ›</span> corpus loaded — 2,847 entities
            <br />
            <span class="who">you ›</span> oldest open decision?
            <br />
            <span class="who">mira ›</span> "Pricing tiers" — open since March
            (decisions/pricing.md)
          </div>
        </div>
      </div>
    </div>
  );
}

/** The dashboard overview: the brain's real widget cards over fixture data. */
export function DashboardScreen(): JSX.Element {
  return (
    <div class="brain-screen">
      <div class="ifc-frame">
        <div class="ifc-bar">
          <i />
          <i />
          <i />
          <span>mira.studio/dashboard</span>
        </div>
        <div class="ifc-strip">
          <span class="mark">mira · console</span>
          <div class="snav">
            <span class="on">Dashboard</span>
            <span>Chat</span>
            <span>Library</span>
          </div>
          <span class="admin">Admin</span>
        </div>
        <div class="ifc-tabs">
          <span class="on">overview</span>
          <span>content</span>
          <span>network</span>
          <span>system</span>
        </div>
        <div class="dash-canvas">
          <div class="ifc-card">
            <div class="ct">
              <span>Identity</span>
            </div>
            <dl>
              <div class="krow">
                <dt>Role</dt>
                <dd>Research partner — media theory &amp; praxis</dd>
              </div>
              <div class="krow">
                <dt>Purpose</dt>
                <dd>Turn a working library into a public practice</dd>
              </div>
            </dl>
            <div class="vals">
              <i>open source</i>
              <i>rigor</i>
              <i>reciprocity</i>
            </div>
          </div>
          <div class="ifc-card">
            <div class="ct">
              <span>Entities</span>
              <small>corpus · by volume</small>
            </div>
            <div class="big">2,847</div>
            <div class="biglabel">indexed entities</div>
            <dl style="margin-top:8px">
              <div class="krow">
                <dt>notes</dt>
                <dd>1,204</dd>
              </div>
              <div class="krow">
                <dt>links</dt>
                <dd>486</dd>
              </div>
              <div class="krow">
                <dt>posts</dt>
                <dd>412</dd>
              </div>
              <div class="krow">
                <dt>essays</dt>
                <dd>118</dd>
              </div>
            </dl>
          </div>
          <div class="ifc-card">
            <div class="ct">
              <span>Runtime</span>
              <small>core</small>
            </div>
            <dl>
              <div class="krow">
                <dt>Version</dt>
                <dd>0.2.0</dd>
              </div>
              <div class="krow">
                <dt>Model</dt>
                <dd>anthropic · sonnet</dd>
              </div>
              <div class="krow">
                <dt>Uptime</dt>
                <dd>41d 6h</dd>
              </div>
              <div class="krow">
                <dt>Embeddings</dt>
                <dd class="ok">✓ current</dd>
              </div>
              <div class="krow">
                <dt>Daemons</dt>
                <dd>4 running</dd>
              </div>
            </dl>
          </div>
          <div class="ifc-card" style="grid-column: span 2">
            <div class="ct">
              <span>Endpoints</span>
              <small>machine faces of the same brain</small>
            </div>
            <dl>
              <div class="krow">
                <dt>MCP</dt>
                <dd>
                  mira.studio/mcp <span class="dim-arrow">↗</span>
                </dd>
              </div>
              <div class="krow">
                <dt>A2A</dt>
                <dd>
                  /.well-known/agent-card <span class="dim-arrow">↗</span>
                </dd>
              </div>
              <div class="krow">
                <dt>ATProto</dt>
                <dd>
                  @mira.studio — essays as records{" "}
                  <span class="dim-arrow">↗</span>
                </dd>
              </div>
              <div class="krow">
                <dt>RSS</dt>
                <dd>
                  /rss.xml <span class="dim-arrow">↗</span>
                </dd>
              </div>
            </dl>
          </div>
          <div class="ifc-card">
            <div class="ct">
              <span>Ways to connect</span>
            </div>
            <dl>
              <div class="krow">
                <dt>Chat</dt>
                <dd>mira.studio/chat</dd>
              </div>
              <div class="krow">
                <dt>Discord</dt>
                <dd>#ask-mira</dd>
              </div>
              <div class="krow">
                <dt>Terminal</dt>
                <dd>brain chat</dd>
              </div>
            </dl>
          </div>
        </div>
      </div>
    </div>
  );
}
