# @brains/ui-library

## 0.2.0-alpha.368

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.368
  - @brains/operator-view-react@0.2.0-alpha.368
  - @brains/utils@0.2.0-alpha.368
  - @brains/plugins@0.2.0-alpha.368

## 0.2.0-alpha.367

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.367
  - @brains/operator-view-react@0.2.0-alpha.367
  - @brains/utils@0.2.0-alpha.367
  - @brains/plugins@0.2.0-alpha.367

## 0.2.0-alpha.366

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.366
  - @brains/operator-view-react@0.2.0-alpha.366
  - @brains/utils@0.2.0-alpha.366
  - @brains/plugins@0.2.0-alpha.366

## 0.2.0-alpha.365

### Patch Changes

- [#239](https://github.com/rizom-ai/brains/pull/239) [`4dba750`](https://github.com/rizom-ai/brains/commit/4dba750e83322faa22aa608c32504c115ea15907) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Refine Studio workspaces using existing theme fonts and public block contracts. Use provider-owned compositions with shared StyleX cards, columns, record typography, facts, and notices. Add validated record presentation roles and collapsible supporting sections instead of workspace-specific rendering branches. Place Overview activity alongside attention, prioritize publishing failures and sync issues, remove redundant pipeline diagrams, and separate Site preview and production into explicit tabs while retaining permission checks and production confirmation.

  Compose Overview as an attention list and compact activity feed, with technical and system details available on demand. Separate the publishing queue from failures, give Account independent profile and security columns, and place Chat's session list and conversation beneath a consistent workspace heading. Preserve passkey protections, session actions, and browser navigation preferences. On phones, open Chat sessions in a shared dialog with focus restoration rather than a second navigation dock. Match the mockup's authored-message typography, wrapped session titles, bounded workspace measure, and human-readable activity timestamps without introducing typefaces.

  Remove Account's two handwritten stylesheets and its local style injection in favor of compiled StyleX. Group Content sync diagnostics by operation, preserving every recorded message, path, and timestamp; app hosts disclose long warnings on demand. Flatten repository facts without repeated totals or meters, retain commit debounce and exact commit identifiers, and show readable working-tree statuses with their original codes. Explicitly disclose partial changed-file lists and disable Sync now during active runs. Use the production provider for Content sync visual fixtures.

  Begin the shared renderer and Dashboard StyleX migration with reusable fact rows, notices, cards, columns, record copy, and text links. Keep host density independent of schema-declared editorial, attention, activity, and standard roles. Compile the shared runtime entry and static stylesheet before consumption, deliver its CSS through Studio assets and Dashboard's stylesheet, and remove the migrated fact and notice selectors. SSR uses precompiled classes without a DOM or runtime compiler.

  Replace native Chat's handwritten layout sheet with compiled StyleX. Preserve per-session drafts and attachments in mounted Studio memory, guard departures, and retain received text when stopping a stream. Adopt new conversation routes only after acceptance so rejected first messages remain reachable. Keep the composer inside its working room when the Working set disclosure opens. Align Account profile and security records with the shared typography, timestamps, and supporting disclosures.

  Give Site publication a shared featured card, separate current build failures from the published generation, and fold render history and bounded route references beneath it. Pair the current environment's open link with its build control in a shared card footer. Keep preview and production actions distinct, disable duplicate UI requests during active builds, and retain production confirmation and permissions. Disclose Publishing failure diagnostics and retries behind an attention summary; show destinations as descriptions and queue position/schedule as metadata. Use production Site and Publishing providers over seeded source records in visual fixtures, rather than handwritten view payloads.

  Replace Administration's People, Invitations, and Audit tables with shared record lists and query-backed inspection. Keep Account, person management, protection, and review links in the trailing record controls; fold external brains, access reference, and delivery capabilities. Preserve filtered/deep-linked records, pagination, invitation lifecycle controls, protected Anchor actions, and exact audit identifiers. Resolve audit subjects from recorded user references without exposing arbitrary event metadata. Use actual providers over disposable auth data in browser fixtures instead of hand-composed Administration payloads. Give comfortable supporting disclosures separated, touch-sized triggers while retaining compact Dashboard density.

  Refine Overview and Inbox against the separate screen studies. Group attention metadata and source links beneath the copy, keep supporting disclosures contiguous, and avoid repeating current failure diagnostics in the activity feed. Give Inbox a concise totals line with source availability, inline priority/time metadata, and source-owned text actions beside flexible record copy. Move its pagination below the collection, omit redundant single-page controls, and retain navigation out of emptied later pages. Compile shared filters and pagination with StyleX, remove their old renderer/Studio responsive CSS, and use production providers over seeded source inputs for visual fixtures.

  Migrate Dashboard's public header, masthead, and section navigation to shared compiled StyleX components and delete their handwritten CSS. Preserve guest/sign-in destinations, climate control, no-JavaScript anchors, keyboard/hash navigation, and count badges. Style selected tabs from ARIA state and provide 44px phone entry-link targets. Keep long identities bounded and verify production SSR without a DOM or StyleX loader. Move page framing, section panels/headings, and the colophon into shared compiled components, deleting their old CSS. Preserve no-JavaScript section headings and host-owned documentation/operator destinations; give footer links 44px phone targets. Compile StyleX only once, then embed its collected stylesheet into the compiled JavaScript instead of recompiling source in the embedding pass.

  Move Dashboard's public summary, map, system, and widget card frames and headings to shared compiled panels. Preserve standard, tight-phone, and edge-aligned insets, direct status accessories, source copy, and native content/navigation. Compile the responsive public card grid, delete replaced global card/header/grid CSS and map/system padding overrides, and remove the unused class-based `CardHeader` export from the private UI library. Preserve the registered proximity visualization's responsive query using the shared `operator-panel` container. Require the CSS embedding pass to emit the public `dist/index.js` entry so builds cannot silently leave stale executable code behind.

  Compile Dashboard overview paragraphs, status copy, empty states, and linked/unlinked summaries through shared panel-body components. Reuse shared totals with a responsive ledger presentation and remove the entire legacy overview stylesheet. Preserve source ordering, positive-count filtering, URL safety, cross-source deduplication, limits, and native destinations. Give public contact links 44px phone targets and visible keyboard/hover feedback; bound long labels and badges without dropping their text.

  Move System's primary/supporting panel layout, reference facts, and public availability rows to shared compiled columns, facts, and status components. Delete their replaced layout/row/status selectors. Retain native exact timestamps, zero counts, public-only metadata, availability tones, ordering, deduplication, and the five-row bound; health and totals still consider all advertised surfaces. Keep reference presentation independent of density and bound long metadata values.

  Finish System's StyleX migration with shared snapshot summaries, binary readiness indicators, ordered stages, semantic checks, and status pills; reuse shared totals for the edge-aligned band and panel paragraphs for supporting notes. Delete the entire System stylesheet. Keep update metadata visible on phones, retain full operation identifiers/diagnostics and host-owned health interpretation, and verify degraded/waiting states through the production Dashboard renderer. Isolate the pinned Bun 1.4.0 media-tokenizer JIT workaround to the compiler subprocess so larger style collections compile reliably without changing application runtime settings.

  Move Dashboard map frames, atlas summaries, canvases, responsive SVG roots, decorative coordinates, and empty states into shared compiled components. Delete their replaced map selectors. Preserve source totals, independent territory/index/label limits, exact SVG descriptions and geometry, source-owned focus behavior, both Network rendering paths, and separate phone crops. Keep registered provider visualizations authoritative and verify full-width empty maps without fabricating readiness or data.

  Compile map legends and territory indexes through shared components with explicit marker/tone props and native ARIA selection. Keep legend category interpretation and precedence in Dashboard, preserve full source labels, ranking and counts, and remove replaced legend/index CSS plus the mirrored active button class. Give phone territory controls 44px targets and keep dense-list guidance in flow beneath remainder copy. Validate the dense fixture through the public runtime schema while retaining its point/zone/relationship references.

  Move the remaining Dashboard SVG paint, typography, and animations into shared native SVG components and remove the entire map stylesheet. Keep category/status interpretation, sighting precedence, archived dimming, geometry, and full source values in Dashboard. Contours follow explicit group state rather than a styling class; reduced-motion marks stay visible and drawn. Bound and separate crowded territory labels using grapheme-safe visible abbreviation, retaining exact source titles, accessibility names, counts, IDs, and index records without moving nodes or contours.

  Move line-tab strips, triggers, and counts into shared compiled components, composed by both static operator tabs and UI-library widget tabs. Preserve native IDs, panels, source labels/counts, and host keyboard routing; selection paint follows ARIA even on hover. Bound overflow in narrow desktop panels, provide 44px phone targets and unclipped focus rings, respect reduced motion, and delete the 59 replaced Dashboard tab CSS lines. UI-library consumes the compiled shared runtime rather than adding another StyleX build pipeline.

  Compile pill tabs and filter controls through shared native choice components, removing another 108 Dashboard CSS lines. Keep filtering, search text, the twelve-option initial limit, selected overflow options, and empty-state interpretation in UI-library. Style selection from native ARIA rather than active classes and supply attention counts explicitly. Preserve native hiding, bound long labels, provide 44px phone controls and visible focus, and check both tab variants plus search/overflow/row restoration in Chromium.

  Compose widget action links through shared compiled navigation/link components. Preserve exact destinations, external target/rel behavior, full labels, and decorative indicators; provide bounded wrapping, 44px phone targets, visible focus, and reduced-motion-aware hover. Delete the replaced widget action rules and exercise native keyboard focus, external-link attributes, long labels, and actual ancestor hover in Chromium.

  Finish widget list and status-label migration through shared compiled components and delete the remaining 126-line widget stylesheet. Align record titles/descriptions/metadata with the standard 16/12/11 hierarchy, preserve exact source segments and full tags, keep zero description/trailing values in semantic slots, and bound long trailing statuses. Retain native list/filter attributes and hiding; UI-library keeps ordering, serialization, and status-tone interpretation. Add explicit label presentation to the existing shared status pill rather than another status renderer.

  Compile Dashboard body typography and climate-aware decorative layers through a shared native document-body component. Preserve the Paper/Instrument grain, vignette, layering, and pointer behavior. Remove the unused compatibility tab stylesheet, obsolete column entrance animation, and old theme-button overrides. Keep only the document reset; browser-check computed pseudo-element treatment in both climates. Move registered-widget invalid-data, empty, and pending messages to shared compiled paragraph presentation without changing wording or source conditions. Supply the immutable stylesheet to the standalone proximity site section and remove the final `.muted` rule. Give the shared renderer CSS an asset-specific declaration so downstream consumers do not need ambient CSS shims.

  Migrate CSS-renderer segmented tabs to shared compiled controls. Preserve native selection, count text (including zero), callbacks, and active-panel rendering; bound long labels and provide 44px phone targets and inset keyboard focus. Remove the replaced tab selectors. Migrate list filters to the same shared controls, preserving custom all-values, unclassified rows, counts, and empty states. Correct the leftover filter-container selector from tab migration and remove all replaced filter CSS. Explicitly map the contract’s `gap` emphasis to attention presentation; the former stylesheet incorrectly expected an `attention` source value.

  Compile action-form input, select, and checkbox-label presentation through shared StyleX, removing their legacy selectors. Use the configured console UI font rather than the undefined console-sans token. Preserve host control adapters, query-select styling, native validation, typed defaults, conditional labels, secret-field handling, and submission behavior; provide bounded fields, visible keyboard focus, and 44px phone targets without stretching native checkboxes.

  Compile action disclosure presentation through a shared native details/summary component, replacing the legacy disclosure stylesheet rules. Preserve native state and form edits, use immediate-parent open-state selectors to isolate nested disclosures, and provide bounded labels, visible keyboard focus, and 44px phone targets. App hosts retain their dialog adapter; presentation is explicit rather than inferred from class names.

  Compile action-result frames and definition-list facts through shared StyleX. Preserve declared-field projection, zero/false/null values, sensitive markers, polite announcements, and exact copy behavior. Bound long titles and values, expose complete values in native titles, and keep copy controls available at phone widths. Replace the old result selectors and browser-test the real mounted renderer rather than parallel result markup.

  Compile action-form grids and submit alignment through shared StyleX. Preserve two-column primary forms and single-column phone/sidebar forms, with bounded tracks for narrow regions. A named operator-aside container replaces legacy-class coupling while preserving physical portal boundaries and existing column markup; remove the replaced form layout CSS.

  Replace CSS-host action and confirmation button class generation with the existing shared compiled button vocabulary. Preserve native callbacks, disabled states, consequential-action confirmation, and row text actions. Bound long labels and honor reduced motion in shared buttons, including primary hover translation; verify real disabled and confirmation paths in the browser fixture.

  Compile table framing, cell hierarchy, alignment, native current-row paint, and compact-row visibility through shared StyleX. Preserve source-owned rows, values, links, actions, and compact eligibility. Keep unannotated rows in bounded scrolling tables at phone widths and align row controls explicitly. Remove replaced shared and Dashboard table rules; browser-test real mixed, fully annotated, and ordinary tables with exact row-action inputs.

  Remove audited obsolete Dashboard stats, filter-summary, alignment-class, group, and notice-modifier rules. Keep still-active renderer presentation instead of deleting by class-name resemblance. Move the remaining grouped-action alignment into its compiled style definition and remove the legacy action-group selector; guard retired selectors and production markup with regression assertions.

  Compile meter/progress layouts, typography, tone text, and native progress tracks/fills through shared StyleX. Preserve exact values, maximums, units, states, diagnostics, timestamps, zero, and absent-bar behavior; name native bars from authored labels. Retain bounded two-column card meters through a shared structural attribute. Remove replaced shared/Dashboard rules and Dashboard-only meter overrides. Test native data and all tones, plus production browser fixtures across widths and climates.

  Compile flow stations, connecting lines, captions, and details through shared StyleX. Preserve source order, statuses, direction metadata, full text, host caption slots, and card caption suppression. Bound station widths and keep active halos inside the scrolling desktop track; preserve vertical phone tracks. Remove replaced shared/Dashboard flow selectors; verify relational state paint and mutation, final-station line suppression, card scope, and overflow in Chromium.

  Finish shared notice framing: remove Dashboard-only box/paragraph overrides and the legacy notice class, explicitly own the left rule and zero other borders/radius in StyleX, and make compact gutters consistently override the base frame. Export the shared notice primitive. Preserve full text, line breaks, tones, links, and diagnostic disclosures; test both densities, untitled notices, all tones, and production browser composition.

  Compile spatial framing, canvas/overlay layout, SVG boundaries and relationship presentation, and radial center labels through shared StyleX. Preserve source geometry, viewBox/scaling, radii, relationship admission/tone precedence, and full labels. Remove replaced shared/Dashboard framing selectors while retaining point controls and caption/detail rules for their own migration. Verify both coordinate layouts and unchanged selection, related highlighting, focus, and Escape behavior in real browser fixtures.

  Finish the renderer/Dashboard presentation consolidation: compile spatial controls/captions/details, heads and standing status, action feedback, link placement, matrix cells, and empty states. Replace spatial state classes with native/explicit state attributes without changing relationship interpretation. Remove both legacy operator stylesheets and the old renderer stylesheet export; hosts consume the compiled asset only. Preserve source matrix column counts with working responsive stacking. Reuse the app UI confirmation modal with viewport portals and explicit caller-owned outside dismissal, retaining pending protections and custom confirmation classes.

  Complete Studio-owned StyleX presentation: library/records, editor fields and uploads/tags, source/preview/assist controls, Streamdown prose slots, publication controls, save/conflict/pipeline feedback, document/page-head placement, and responsive editor layout. Remove the remaining legacy Studio sheets and React style tags; retain only host document viewport rules and a scoped static CodeMirror vendor boundary. Keep safe-link and code-block controls, editing/selection behavior, permissions, full values, and the single phone header Save action. Compose control overrides explicitly through shared `xstyle` props, preserving native classes and dynamic variables without atomic-class order conflicts. Check desktop/tablet/phone presentation, disabled structured values, tag targets, and real upload/delete/invalid/conflict workflows; keep PNG approval separate.

  Add validated provider-authored `actionsLabel` for grouped list/matrix actions and `disclosureLabel` for disclosure cards. Publishing supplies “Queue options” and “Review failure”; failure headings/metadata remain visible independently of the trigger. Preserve full diagnostics and retry/removal/reorder controls through host disclosure adapters. Remove menu labels when permissions remove all actions, reject invalid/misplaced labels, and retain existing generic presentation when labels are omitted.

  Use explicit lightweight link triggers for subordinate grouped row actions in both app sheets and native disclosures. Preserve available/disabled choices, source labels, action execution, native open state, and dialog behavior; keep phone targets at least 44px high. No workspace-specific styling or inferred provider labels are introduced.

  The joint workspace review also removes inherited responsive padding and scrolling from embedded renderer frames, with desktop/tablet/phone regression coverage, and presents Site publication status as a flat section rather than a feature card without changing its facts or actions.

  Include React UI sources in the lint task's cache inputs so UI-only edits cannot reuse stale lint results.

  Keep the Overview activity section visible with an honest empty state when attention exists but the in-memory activity feed is empty after restart. Retain the combined quiet state when both are empty. Cover this mixed state separately instead of relying only on populated synthetic activity.

  Check empty, streaming, outage, build-failure, and dense source states through disposable production-provider fixtures. Combine Overview's empty attention/activity explanation; show Chat's retained-draft guidance despite its disabled history query, without an empty Working set. Avoid claiming an Inbox all-clear when sources are unavailable. Admit complete diagnostic records using the existing 100,000-character source-text bound rather than the 4,000-character prose bound, preserving long build failures and their final identifiers. Give shared phone dialog close controls 44px targets and matching heading clearance. Remove empty Chat session rails and Publishing queue tabs, and give an empty Inbox actionable guidance without a redundant pager while retaining selected source content across filters. Place Site failures and active builds above the supporting columns, with shared spacing between successive tab blocks in both hosts. Preserve default visual cases and keep scenario captures separate from unapproved PNG baselines.

  Apply the reviewed Overview / Chat / Library / Work / Admin / System navigation. Keep Account profile-only, preserve admitted attention counts and collapse preferences, and remove empty leaves on direct destinations. Route Account through the existing draft guard; same-page profile and primary navigation retain edits and session/tab queries. Keep mobile Browse groups independently collapsible without a duplicate dock. Compile the complete shell header and profile menu styling with StyleX, delete its handwritten sheet, and let workspace headings use the available canvas instead of retaining the old two-rail width cap.

- Updated dependencies [[`4dba750`](https://github.com/rizom-ai/brains/commit/4dba750e83322faa22aa608c32504c115ea15907)]:
  - @brains/operator-view-react@0.2.0-alpha.365
  - @brains/plugins@0.2.0-alpha.365
  - @brains/contracts@0.2.0-alpha.365
  - @brains/utils@0.2.0-alpha.365

## 0.2.0-alpha.364

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.364
  - @brains/utils@0.2.0-alpha.364
  - @brains/plugins@0.2.0-alpha.364

## 0.2.0-alpha.363

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.363
  - @brains/utils@0.2.0-alpha.363
  - @brains/plugins@0.2.0-alpha.363

## 0.2.0-alpha.362

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.362
  - @brains/utils@0.2.0-alpha.362
  - @brains/plugins@0.2.0-alpha.362

## 0.2.0-alpha.361

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.361
  - @brains/utils@0.2.0-alpha.361
  - @brains/plugins@0.2.0-alpha.361

## 0.2.0-alpha.360

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.360
  - @brains/utils@0.2.0-alpha.360
  - @brains/plugins@0.2.0-alpha.360

## 0.2.0-alpha.359

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.359
  - @brains/utils@0.2.0-alpha.359
  - @brains/plugins@0.2.0-alpha.359

## 0.2.0-alpha.358

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.358
  - @brains/utils@0.2.0-alpha.358
  - @brains/plugins@0.2.0-alpha.358

## 0.2.0-alpha.357

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.357
  - @brains/utils@0.2.0-alpha.357
  - @brains/plugins@0.2.0-alpha.357

## 0.2.0-alpha.356

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.356
  - @brains/utils@0.2.0-alpha.356
  - @brains/plugins@0.2.0-alpha.356

## 0.2.0-alpha.355

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.355
  - @brains/utils@0.2.0-alpha.355

## 0.2.0-alpha.354

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.354
  - @brains/utils@0.2.0-alpha.354

## 0.2.0-alpha.353

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.353
  - @brains/utils@0.2.0-alpha.353

## 0.2.0-alpha.352

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.352
  - @brains/utils@0.2.0-alpha.352

## 0.2.0-alpha.351

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.351
  - @brains/utils@0.2.0-alpha.351

## 0.2.0-alpha.350

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.350
  - @brains/utils@0.2.0-alpha.350

## 0.2.0-alpha.349

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.349
  - @brains/utils@0.2.0-alpha.349

## 0.2.0-alpha.348

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.348
  - @brains/utils@0.2.0-alpha.348

## 0.2.0-alpha.347

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.347
  - @brains/utils@0.2.0-alpha.347

## 0.2.0-alpha.346

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.346
  - @brains/utils@0.2.0-alpha.346

## 0.2.0-alpha.345

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.345
  - @brains/utils@0.2.0-alpha.345

## 0.2.0-alpha.344

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.344
  - @brains/utils@0.2.0-alpha.344

## 0.2.0-alpha.343

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.343
  - @brains/utils@0.2.0-alpha.343

## 0.2.0-alpha.342

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.342
  - @brains/utils@0.2.0-alpha.342

## 0.2.0-alpha.341

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.341
  - @brains/utils@0.2.0-alpha.341

## 0.2.0-alpha.340

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.340
  - @brains/utils@0.2.0-alpha.340

## 0.2.0-alpha.339

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.339
  - @brains/utils@0.2.0-alpha.339

## 0.2.0-alpha.338

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.338
  - @brains/utils@0.2.0-alpha.338

## 0.2.0-alpha.337

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.337
  - @brains/utils@0.2.0-alpha.337

## 0.2.0-alpha.336

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.336
  - @brains/utils@0.2.0-alpha.336

## 0.2.0-alpha.335

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.335
  - @brains/utils@0.2.0-alpha.335

## 0.2.0-alpha.334

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.334
  - @brains/utils@0.2.0-alpha.334

## 0.2.0-alpha.333

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.333
  - @brains/utils@0.2.0-alpha.333

## 0.2.0-alpha.332

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.332
  - @brains/utils@0.2.0-alpha.332

## 0.2.0-alpha.331

### Patch Changes

- [#180](https://github.com/rizom-ai/brains/pull/180) [`62db779`](https://github.com/rizom-ai/brains/commit/62db77946a964aaba655d5fc68b40a13e1e9139d) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Keep Agent Network skill filtering valid by deriving both filter choices and row memberships from the complete normalized tag set. Shared tags and Brain-only gaps still rank first, but agent-only tags are no longer omitted and shared tags are no longer truncated.

  Declarative list filters now accept the complete bounded membership space. Filters initially show 12 choices, expose searchable overflow and a Show all control, and preserve the selected choice when collapsed. Skill ingestion independently limits each skill to 30 non-empty tags of at most 120 characters.

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.331
  - @brains/utils@0.2.0-alpha.331

## 0.2.0-alpha.330

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.330
  - @brains/utils@0.2.0-alpha.330

## 0.2.0-alpha.329

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.329
  - @brains/utils@0.2.0-alpha.329

## 0.2.0-alpha.328

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.328
  - @brains/utils@0.2.0-alpha.328

## 0.2.0-alpha.327

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.327
  - @brains/utils@0.2.0-alpha.327

## 0.2.0-alpha.326

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.326
  - @brains/utils@0.2.0-alpha.326

## 0.2.0-alpha.325

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.325
  - @brains/utils@0.2.0-alpha.325

## 0.2.0-alpha.324

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.324
  - @brains/utils@0.2.0-alpha.324

## 0.2.0-alpha.323

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.323
  - @brains/utils@0.2.0-alpha.323

## 0.2.0-alpha.322

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.322
  - @brains/utils@0.2.0-alpha.322

## 0.2.0-alpha.321

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.321
  - @brains/utils@0.2.0-alpha.321

## 0.2.0-alpha.320

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.320
  - @brains/utils@0.2.0-alpha.320

## 0.2.0-alpha.319

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.319
  - @brains/utils@0.2.0-alpha.319

## 0.2.0-alpha.318

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.318
  - @brains/utils@0.2.0-alpha.318

## 0.2.0-alpha.317

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.317
  - @brains/utils@0.2.0-alpha.317

## 0.2.0-alpha.316

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.316
  - @brains/utils@0.2.0-alpha.316

## 0.2.0-alpha.315

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.315
  - @brains/utils@0.2.0-alpha.315

## 0.2.0-alpha.314

### Patch Changes

- [`17507e8`](https://github.com/rizom-ai/brains/commit/17507e806efc5fde1c30496700de74b53575d350) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Renderer-neutral SSR contracts.

  `ImageRenderer` was `marked`'s `renderer.image` callback signature —
  `(href, title: string | null, text)` — re-exported from the component library
  and made the build engine's public contract, so swapping the markdown library
  would have been a breaking change to `@brains/site-engine`'s API.
  `HeadProps`/`HeadCollectorInterface` had the same inverted ownership.

  Both now live in `@brains/contracts` with library-neutral shapes:
  `ImageRenderer` takes a `RenderedImageRef` (`{href, alt, title?}`), and
  `markdown-html` adapts marked's AST to it at the boundary that owns the marked
  dependency. ui-library re-exports the types, so template imports are unchanged.

- [`b1263e7`](https://github.com/rizom-ai/brains/commit/b1263e72c9448cbff519732cf001a0cd1c2203ec) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Small internal dedups and surface fixes across the site rendering stack.

  - site-engine's head collector and HTML shell each carried their own copy of
    the essential head tags; they now share `essentialHeadTags()`, whose asset
    paths are declared inputs instead of strings buried in two modules. The
    collector's private `escapeHtml` gives way to the shared one, and the HTML
    shell's default title is now escaped (it was interpolated raw).
  - `resolvedSiteImageSchema` was declared twice inside site-engine; it now
    lives once next to the `ResolvedSiteImage` interface it validates.
    `UISlotRegistry.getSlot` returns the public registration shape instead of an
    unexported internal type, and its two unregister methods share one prune.
  - ui-library's `ContentSection` — a full component with zero usages, whose
    items branch reimplemented `ContentList` with drifted markup — is deleted;
    the `ContentItem` type it hosted moves to `ContentListItem`.
  - content-formatters' barrel enumerates its exports explicitly instead of
    three wildcard re-exports.

- Updated dependencies [[`9bd1925`](https://github.com/rizom-ai/brains/commit/9bd192562923351e62909c7a0662eeeb46453303), [`d339319`](https://github.com/rizom-ai/brains/commit/d339319dabea7f856b69c829e46d3937254880d3), [`ae06107`](https://github.com/rizom-ai/brains/commit/ae06107694a825378e23183c26261c91166edfdf), [`17507e8`](https://github.com/rizom-ai/brains/commit/17507e806efc5fde1c30496700de74b53575d350), [`497fbc0`](https://github.com/rizom-ai/brains/commit/497fbc0f6d672e23afd5263a519c4e73a740c2c5)]:
  - @brains/contracts@0.2.0-alpha.314
  - @brains/utils@0.2.0-alpha.314

## 0.2.0-alpha.313

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.313

## 0.2.0-alpha.312

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.312

## 0.2.0-alpha.311

### Patch Changes

- Updated dependencies [[`0b4d2bc`](https://github.com/rizom-ai/brains/commit/0b4d2bca39b83d60183c0040f63f4bb9c2f9d029)]:
  - @brains/utils@0.2.0-alpha.311

## 0.2.0-alpha.310

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.310

## 0.2.0-alpha.309

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.309

## 0.2.0-alpha.308

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.308

## 0.2.0-alpha.307

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.307

## 0.2.0-alpha.306

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.306

## 0.2.0-alpha.305

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.305

## 0.2.0-alpha.304

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.304

## 0.2.0-alpha.303

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.303

## 0.2.0-alpha.302

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.302

## 0.2.0-alpha.301

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.301

## 0.2.0-alpha.300

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.300

## 0.2.0-alpha.299

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.299

## 0.2.0-alpha.298

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.298

## 0.2.0-alpha.297

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.297

## 0.2.0-alpha.296

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.296

## 0.2.0-alpha.295

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.295

## 0.2.0-alpha.294

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.294

## 0.2.0-alpha.293

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.293

## 0.2.0-alpha.292

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.292

## 0.2.0-alpha.291

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.291

## 0.2.0-alpha.290

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.290

## 0.2.0-alpha.289

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.289

## 0.2.0-alpha.288

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.288

## 0.2.0-alpha.287

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.287

## 0.2.0-alpha.286

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.286

## 0.2.0-alpha.285

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.285

## 0.2.0-alpha.284

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.284

## 0.2.0-alpha.283

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.283

## 0.2.0-alpha.282

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.282

## 0.2.0-alpha.281

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.281

## 0.2.0-alpha.280

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.280

## 0.2.0-alpha.279

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.279

## 0.2.0-alpha.278

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.278

## 0.2.0-alpha.277

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.277

## 0.2.0-alpha.276

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.276

## 0.2.0-alpha.275

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.275

## 0.2.0-alpha.274

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.274

## 0.2.0-alpha.273

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.273

## 0.2.0-alpha.272

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.272

## 0.2.0-alpha.271

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.271

## 0.2.0-alpha.270

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.270

## 0.2.0-alpha.269

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.269

## 0.2.0-alpha.268

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.268

## 0.2.0-alpha.267

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.267

## 0.2.0-alpha.266

### Patch Changes

- Updated dependencies [[`e70ab12`](https://github.com/rizom-ai/brains/commit/e70ab12745c6cf757f685389f4cd6de8991de95f)]:
  - @brains/utils@0.2.0-alpha.266

## 0.2.0-alpha.265

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.265

## 0.2.0-alpha.264

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.264

## 0.2.0-alpha.263

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.263

## 0.2.0-alpha.262

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.262

## 0.2.0-alpha.261

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.261

## 0.2.0-alpha.260

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.260

## 0.2.0-alpha.259

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.259

## 0.2.0-alpha.258

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.258

## 0.2.0-alpha.257

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.257

## 0.2.0-alpha.256

### Patch Changes

- Updated dependencies [[`1e45eca`](https://github.com/rizom-ai/brains/commit/1e45ecaaed5351964cbf8a0754a301507b15c298)]:
  - @brains/utils@0.2.0-alpha.256

## 0.2.0-alpha.255

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.255

## 0.2.0-alpha.254

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.254

## 0.2.0-alpha.253

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.253

## 0.2.0-alpha.252

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.252

## 0.2.0-alpha.251

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.251

## 0.2.0-alpha.250

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.250

## 0.2.0-alpha.249

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.249

## 0.2.0-alpha.248

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.248

## 0.2.0-alpha.247

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.247

## 0.2.0-alpha.246

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.246

## 0.2.0-alpha.245

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.245

## 0.2.0-alpha.244

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.244

## 0.2.0-alpha.243

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.243

## 0.2.0-alpha.242

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.242

## 0.2.0-alpha.241

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.241

## 0.2.0-alpha.240

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.240

## 0.2.0-alpha.239

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.239

## 0.2.0-alpha.238

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.238

## 0.2.0-alpha.237

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.237

## 0.2.0-alpha.236

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.236

## 0.2.0-alpha.235

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.235

## 0.2.0-alpha.234

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.234

## 0.2.0-alpha.233

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.233

## 0.2.0-alpha.232

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.232

## 0.2.0-alpha.231

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.231

## 0.2.0-alpha.230

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.230

## 0.2.0-alpha.229

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.229

## 0.2.0-alpha.228

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.228

## 0.2.0-alpha.227

### Patch Changes

- Updated dependencies [[`5c1bed1`](https://github.com/rizom-ai/brains/commit/5c1bed1134f92701f4ead9b25a6f432cd208ac29)]:
  - @brains/utils@0.2.0-alpha.227

## 0.2.0-alpha.226

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.226

## 0.2.0-alpha.225

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.225

## 0.2.0-alpha.224

### Patch Changes

- Updated dependencies [[`b7c5df6`](https://github.com/rizom-ai/brains/commit/b7c5df61ebe0aa44f6b786695f16daa7ee151e61)]:
  - @brains/utils@0.2.0-alpha.224

## 0.2.0-alpha.223

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.223

## 0.2.0-alpha.222

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.222

## 0.2.0-alpha.221

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.221

## 0.2.0-alpha.220

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.220

## 0.2.0-alpha.219

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.219

## 0.2.0-alpha.218

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.218

## 0.2.0-alpha.217

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.217

## 0.2.0-alpha.216

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.216

## 0.2.0-alpha.215

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.215

## 0.2.0-alpha.214

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.214

## 0.2.0-alpha.213

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.213

## 0.2.0-alpha.212

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.212

## 0.2.0-alpha.211

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.211

## 0.2.0-alpha.210

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.210

## 0.2.0-alpha.209

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.209

## 0.2.0-alpha.208

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.208

## 0.2.0-alpha.207

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.207

## 0.2.0-alpha.206

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.206

## 0.2.0-alpha.205

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.205

## 0.2.0-alpha.204

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.204

## 0.2.0-alpha.203

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.203

## 0.2.0-alpha.202

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.202

## 0.2.0-alpha.201

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.201

## 0.2.0-alpha.200

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.200

## 0.2.0-alpha.199

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.199

## 0.2.0-alpha.198

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.198

## 0.2.0-alpha.197

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.197

## 0.2.0-alpha.196

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.196

## 0.2.0-alpha.195

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.195

## 0.2.0-alpha.194

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.194

## 0.2.0-alpha.193

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.193

## 0.2.0-alpha.192

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.192

## 0.2.0-alpha.191

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.191

## 0.2.0-alpha.190

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.190

## 0.2.0-alpha.189

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.189

## 0.2.0-alpha.188

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.188

## 0.2.0-alpha.187

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.187

## 0.2.0-alpha.186

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.186

## 0.2.0-alpha.185

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.185

## 0.2.0-alpha.184

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.184

## 0.2.0-alpha.183

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.183

## 0.2.0-alpha.182

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.182

## 0.2.0-alpha.181

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.181

## 0.2.0-alpha.180

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.180

## 0.2.0-alpha.179

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.179

## 0.2.0-alpha.178

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.178

## 0.2.0-alpha.177

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.177

## 0.2.0-alpha.176

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.176

## 0.2.0-alpha.175

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.175

## 0.2.0-alpha.174

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.174

## 0.2.0-alpha.173

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.173

## 0.2.0-alpha.172

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.172

## 0.2.0-alpha.171

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.171

## 0.2.0-alpha.170

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.170

## 0.2.0-alpha.169

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.169

## 0.2.0-alpha.168

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.168

## 0.2.0-alpha.167

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.167

## 0.2.0-alpha.166

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.166

## 0.2.0-alpha.165

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.165

## 0.2.0-alpha.164

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.164

## 0.2.0-alpha.163

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.163

## 0.2.0-alpha.162

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.162

## 0.2.0-alpha.161

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.161

## 0.2.0-alpha.160

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.160

## 0.2.0-alpha.159

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.159

## 0.2.0-alpha.158

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.158

## 0.2.0-alpha.157

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.157

## 0.2.0-alpha.156

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.156

## 0.2.0-alpha.155

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.155

## 0.2.0-alpha.154

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.154

## 0.2.0-alpha.153

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.153

## 0.2.0-alpha.152

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.152

## 0.2.0-alpha.151

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.151

## 0.2.0-alpha.150

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.150

## 0.2.0-alpha.149

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.149

## 0.2.0-alpha.148

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.148

## 0.2.0-alpha.147

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.147

## 0.2.0-alpha.146

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.146

## 0.2.0-alpha.145

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.145

## 0.2.0-alpha.144

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.144

## 0.2.0-alpha.143

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.143

## 0.2.0-alpha.142

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.142

## 0.2.0-alpha.141

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.141

## 0.2.0-alpha.140

### Patch Changes

- Updated dependencies [[`a30edc7`](https://github.com/rizom-ai/brains/commit/a30edc7ac66807c66cba2bc94e78206f133710d6), [`cea906c`](https://github.com/rizom-ai/brains/commit/cea906c689d40dee5f06ab949d5289c2660bfd37)]:
  - @brains/utils@0.2.0-alpha.140

## 0.2.0-alpha.139

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.139

## 0.2.0-alpha.138

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.138

## 0.2.0-alpha.137

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.137

## 0.2.0-alpha.136

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.136

## 0.2.0-alpha.135

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.135

## 0.2.0-alpha.134

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.134

## 0.2.0-alpha.133

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.133

## 0.2.0-alpha.132

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.132

## 0.2.0-alpha.131

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.131

## 0.2.0-alpha.130

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.130

## 0.2.0-alpha.129

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.129

## 0.2.0-alpha.128

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.128

## 0.2.0-alpha.127

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.127

## 0.2.0-alpha.126

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.126

## 0.2.0-alpha.125

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.125

## 0.2.0-alpha.124

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.124

## 0.2.0-alpha.123

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.123

## 0.2.0-alpha.122

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.122

## 0.2.0-alpha.121

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.121

## 0.2.0-alpha.120

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.120

## 0.2.0-alpha.119

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.119

## 0.2.0-alpha.118

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.118

## 0.2.0-alpha.117

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.117

## 0.2.0-alpha.116

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.116

## 0.2.0-alpha.115

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.115

## 0.2.0-alpha.114

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.114

## 0.2.0-alpha.113

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.113

## 0.2.0-alpha.112

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.112

## 0.2.0-alpha.111

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.111

## 0.2.0-alpha.110

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.110

## 0.2.0-alpha.109

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.109

## 0.2.0-alpha.108

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.108

## 0.2.0-alpha.107

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.107

## 0.2.0-alpha.106

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.106

## 0.2.0-alpha.105

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.105

## 0.2.0-alpha.104

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.104

## 0.2.0-alpha.103

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.103

## 0.2.0-alpha.102

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.102

## 0.2.0-alpha.101

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.101

## 0.2.0-alpha.100

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.100

## 0.2.0-alpha.99

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.99

## 0.2.0-alpha.98

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.98

## 0.2.0-alpha.97

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.97

## 0.2.0-alpha.96

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.96

## 0.2.0-alpha.95

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.95

## 0.2.0-alpha.94

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.94

## 0.2.0-alpha.93

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.93

## 0.2.0-alpha.92

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.92

## 0.2.0-alpha.91

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.91

## 0.2.0-alpha.90

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.90

## 0.2.0-alpha.89

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.89

## 0.2.0-alpha.88

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.88

## 0.2.0-alpha.87

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.87

## 0.2.0-alpha.86

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.86

## 0.2.0-alpha.85

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.85

## 0.2.0-alpha.84

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.84

## 0.2.0-alpha.83

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.83

## 0.2.0-alpha.82

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.82

## 0.2.0-alpha.81

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.81

## 0.2.0-alpha.80

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.80

## 0.2.0-alpha.79

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.79

## 0.2.0-alpha.78

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.78

## 0.2.0-alpha.77

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.77

## 0.2.0-alpha.76

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.76

## 0.2.0-alpha.75

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.75

## 0.2.0-alpha.74

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.74

## 0.2.0-alpha.73

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.73

## 0.2.0-alpha.72

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.72

## 0.2.0-alpha.71

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.71

## 0.2.0-alpha.70

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.70

## 0.2.0-alpha.69

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.69

## 0.2.0-alpha.68

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.68

## 0.2.0-alpha.67

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.67

## 0.2.0-alpha.66

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.66

## 0.2.0-alpha.65

## 0.2.0-alpha.64

## 0.2.0-alpha.63

## 0.2.0-alpha.62

## 0.2.0-alpha.61

## 0.2.0-alpha.60

## 0.2.0-alpha.59

## 0.2.0-alpha.58

## 0.2.0-alpha.57

## 0.2.0-alpha.56

## 0.2.0-alpha.55

## 0.2.0-alpha.54

## 0.2.0-alpha.53

## 0.2.0-alpha.52

### Patch Changes

- [`22bb0fc`](https://github.com/rizom-ai/brains/commit/22bb0fc26d76e6b48fa9952fe4eb0ce560d04cf0) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Generalize `@rizom/ui`'s `Wordmark` and add a wordmark slot to the brain header so non-rizom sites (like yeehaa.io) can render a structured `name.suffix` brand mark.
  - `Wordmark` now accepts an optional `name` prop (defaulting to `"rizom"`) and widens `brandSuffix` to `RizomBrandSuffix | string`. Unknown suffixes fall back to `text-accent` for the dot color.
  - Brain `Header` accepts a `wordmark?: ComponentChildren` prop that, when provided, replaces the default title/logo rendering.
  - `ProfessionalLayout` forwards a new `wordmark` prop through to `Header` so site packages can override the header brand mark without rewriting the layout.

## 0.2.0-alpha.51

### Patch Changes

- [`2988101`](https://github.com/rizom-ai/brains/commit/29881019994e060d8ae18d73586d98014bba1d66) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Tighten typography and editorial layout on the professional site to match the rizom-aligned mock. Load Fraunces with the SOFT axis range (was inert), introduce `--color-rule` / `--color-rule-strong` / `--color-accent-soft` / `--color-bg-deep` tokens and matching utilities, refine the light palette toward the mock's warmer cream, and wire `.hero-bg-pattern` / `.cta-bg-pattern` / `.section-divider` / `.section-rule` to actual CSS rules. UI library updates: 3-column header (wordmark | nav | toggle), `.nav-link` utility, single-moon ThemeToggle, editorial entry styling with hover→accent + 1px rule separators, mono pill CTA button, and a footer wordmark size override. Drop the unused `--font-serif` token + `.font-serif` utility.

## 0.2.0-alpha.50

## 0.2.0-alpha.49

## 0.2.0-alpha.48

## 0.2.0-alpha.47

## 0.2.0-alpha.46

## 0.2.0-alpha.45

## 0.2.0-alpha.44

## 0.2.0-alpha.43

## 0.2.0-alpha.42

## 0.2.0-alpha.41

## 0.2.0-alpha.40

## 0.2.0-alpha.39

## 0.2.0-alpha.38

## 0.2.0-alpha.37

## 0.2.0-alpha.36

## 0.2.0-alpha.35

## 0.2.0-alpha.34

## 0.2.0-alpha.33

## 0.2.0-alpha.32

## 0.2.0-alpha.31

## 0.2.0-alpha.30

## 0.2.0-alpha.29

## 0.2.0-alpha.28

## 0.2.0-alpha.27

## 0.2.0-alpha.26

## 0.2.0-alpha.25

## 0.2.0-alpha.24

## 0.2.0-alpha.23

## 0.2.0-alpha.22

## 0.2.0-alpha.21

## 0.2.0-alpha.20

## 0.2.0-alpha.19

## 0.2.0-alpha.18

## 0.2.0-alpha.17

## 0.2.0-alpha.16

## 0.2.0-alpha.15

## 0.2.0-alpha.14

## 0.2.0-alpha.13

## 0.2.0-alpha.12

## 0.2.0-alpha.11

## 0.2.0-alpha.10

## 0.2.0-alpha.9

## 0.2.0-alpha.8

## 0.2.0-alpha.7

## 0.2.0-alpha.6

## 0.2.0-alpha.5

## 0.2.0-alpha.4

## 0.2.0-alpha.3

## 0.2.0-alpha.2

## 0.2.0-alpha.1

## 1.0.1-alpha.17
