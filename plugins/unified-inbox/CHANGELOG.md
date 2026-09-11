# @brains/unified-inbox

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
  - @brains/ui-library@0.2.0-alpha.365
  - @brains/plugins@0.2.0-alpha.365
  - @brains/utils@0.2.0-alpha.365

## 0.2.0-alpha.364

### Patch Changes

- Updated dependencies []:
  - @brains/ui-library@0.2.0-alpha.364
  - @brains/utils@0.2.0-alpha.364
  - @brains/plugins@0.2.0-alpha.364

## 0.2.0-alpha.363

### Patch Changes

- Updated dependencies []:
  - @brains/ui-library@0.2.0-alpha.363
  - @brains/utils@0.2.0-alpha.363
  - @brains/plugins@0.2.0-alpha.363

## 0.2.0-alpha.362

### Patch Changes

- Updated dependencies []:
  - @brains/ui-library@0.2.0-alpha.362
  - @brains/utils@0.2.0-alpha.362
  - @brains/plugins@0.2.0-alpha.362

## 0.2.0-alpha.361

### Patch Changes

- Updated dependencies []:
  - @brains/ui-library@0.2.0-alpha.361
  - @brains/utils@0.2.0-alpha.361
  - @brains/plugins@0.2.0-alpha.361

## 0.2.0-alpha.360

### Patch Changes

- Updated dependencies []:
  - @brains/ui-library@0.2.0-alpha.360
  - @brains/utils@0.2.0-alpha.360
  - @brains/plugins@0.2.0-alpha.360

## 0.2.0-alpha.359

### Patch Changes

- Updated dependencies []:
  - @brains/ui-library@0.2.0-alpha.359
  - @brains/utils@0.2.0-alpha.359
  - @brains/plugins@0.2.0-alpha.359

## 0.2.0-alpha.358

### Patch Changes

- Updated dependencies []:
  - @brains/ui-library@0.2.0-alpha.358
  - @brains/utils@0.2.0-alpha.358
  - @brains/plugins@0.2.0-alpha.358

## 0.2.0-alpha.357

### Patch Changes

- Updated dependencies []:
  - @brains/ui-library@0.2.0-alpha.357
  - @brains/utils@0.2.0-alpha.357
  - @brains/plugins@0.2.0-alpha.357

## 0.2.0-alpha.356

### Patch Changes

- Updated dependencies []:
  - @brains/ui-library@0.2.0-alpha.356
  - @brains/utils@0.2.0-alpha.356
  - @brains/plugins@0.2.0-alpha.356

## 0.2.0-alpha.355

### Patch Changes

- Updated dependencies []:
  - @brains/ui-library@0.2.0-alpha.355
  - @brains/utils@0.2.0-alpha.355
  - @brains/plugins@0.2.0-alpha.355

## 0.2.0-alpha.354

### Patch Changes

- Updated dependencies []:
  - @brains/ui-library@0.2.0-alpha.354
  - @brains/utils@0.2.0-alpha.354
  - @brains/plugins@0.2.0-alpha.354

## 0.2.0-alpha.353

### Patch Changes

- Updated dependencies []:
  - @brains/ui-library@0.2.0-alpha.353
  - @brains/utils@0.2.0-alpha.353
  - @brains/plugins@0.2.0-alpha.353

## 0.2.0-alpha.352

### Patch Changes

- Updated dependencies []:
  - @brains/ui-library@0.2.0-alpha.352
  - @brains/utils@0.2.0-alpha.352
  - @brains/plugins@0.2.0-alpha.352

## 0.2.0-alpha.351

### Patch Changes

- Updated dependencies []:
  - @brains/ui-library@0.2.0-alpha.351
  - @brains/utils@0.2.0-alpha.351
  - @brains/plugins@0.2.0-alpha.351

## 0.2.0-alpha.350

### Patch Changes

- Updated dependencies []:
  - @brains/ui-library@0.2.0-alpha.350
  - @brains/utils@0.2.0-alpha.350
  - @brains/plugins@0.2.0-alpha.350

## 0.2.0-alpha.349

### Patch Changes

- Updated dependencies []:
  - @brains/ui-library@0.2.0-alpha.349
  - @brains/utils@0.2.0-alpha.349
  - @brains/plugins@0.2.0-alpha.349

## 0.2.0-alpha.348

### Patch Changes

- Updated dependencies []:
  - @brains/ui-library@0.2.0-alpha.348
  - @brains/utils@0.2.0-alpha.348
  - @brains/plugins@0.2.0-alpha.348

## 0.2.0-alpha.347

### Patch Changes

- Updated dependencies []:
  - @brains/ui-library@0.2.0-alpha.347
  - @brains/utils@0.2.0-alpha.347
  - @brains/plugins@0.2.0-alpha.347

## 0.2.0-alpha.346

### Patch Changes

- Updated dependencies []:
  - @brains/ui-library@0.2.0-alpha.346
  - @brains/utils@0.2.0-alpha.346
  - @brains/plugins@0.2.0-alpha.346

## 0.2.0-alpha.345

### Patch Changes

- Updated dependencies []:
  - @brains/ui-library@0.2.0-alpha.345
  - @brains/utils@0.2.0-alpha.345
  - @brains/plugins@0.2.0-alpha.345

## 0.2.0-alpha.344

### Patch Changes

- Updated dependencies []:
  - @brains/ui-library@0.2.0-alpha.344
  - @brains/utils@0.2.0-alpha.344
  - @brains/plugins@0.2.0-alpha.344

## 0.2.0-alpha.343

### Patch Changes

- Updated dependencies []:
  - @brains/ui-library@0.2.0-alpha.343
  - @brains/utils@0.2.0-alpha.343
  - @brains/plugins@0.2.0-alpha.343

## 0.2.0-alpha.342

### Patch Changes

- Updated dependencies []:
  - @brains/ui-library@0.2.0-alpha.342
  - @brains/utils@0.2.0-alpha.342
  - @brains/plugins@0.2.0-alpha.342

## 0.2.0-alpha.341

### Patch Changes

- Updated dependencies []:
  - @brains/ui-library@0.2.0-alpha.341
  - @brains/utils@0.2.0-alpha.341
  - @brains/plugins@0.2.0-alpha.341

## 0.2.0-alpha.340

### Patch Changes

- Updated dependencies []:
  - @brains/ui-library@0.2.0-alpha.340
  - @brains/utils@0.2.0-alpha.340
  - @brains/plugins@0.2.0-alpha.340

## 0.2.0-alpha.339

### Patch Changes

- Updated dependencies []:
  - @brains/ui-library@0.2.0-alpha.339
  - @brains/utils@0.2.0-alpha.339
  - @brains/plugins@0.2.0-alpha.339

## 0.2.0-alpha.338

### Patch Changes

- Updated dependencies []:
  - @brains/ui-library@0.2.0-alpha.338
  - @brains/utils@0.2.0-alpha.338
  - @brains/plugins@0.2.0-alpha.338

## 0.2.0-alpha.337

### Patch Changes

- Updated dependencies []:
  - @brains/plugins@0.2.0-alpha.337
  - @brains/ui-library@0.2.0-alpha.337
  - @brains/utils@0.2.0-alpha.337

## 0.2.0-alpha.336

### Patch Changes

- Updated dependencies []:
  - @brains/ui-library@0.2.0-alpha.336
  - @brains/utils@0.2.0-alpha.336
  - @brains/plugins@0.2.0-alpha.336

## 0.2.0-alpha.335

### Patch Changes

- Updated dependencies []:
  - @brains/ui-library@0.2.0-alpha.335
  - @brains/utils@0.2.0-alpha.335
  - @brains/plugins@0.2.0-alpha.335

## 0.2.0-alpha.334

### Patch Changes

- Updated dependencies []:
  - @brains/ui-library@0.2.0-alpha.334
  - @brains/utils@0.2.0-alpha.334
  - @brains/plugins@0.2.0-alpha.334

## 0.2.0-alpha.333

### Patch Changes

- Updated dependencies []:
  - @brains/ui-library@0.2.0-alpha.333
  - @brains/utils@0.2.0-alpha.333
  - @brains/plugins@0.2.0-alpha.333

## 0.2.0-alpha.332

### Patch Changes

- Updated dependencies []:
  - @brains/ui-library@0.2.0-alpha.332
  - @brains/utils@0.2.0-alpha.332
  - @brains/plugins@0.2.0-alpha.332

## 0.2.0-alpha.331

### Patch Changes

- Updated dependencies [[`62db779`](https://github.com/rizom-ai/brains/commit/62db77946a964aaba655d5fc68b40a13e1e9139d)]:
  - @brains/plugins@0.2.0-alpha.331
  - @brains/ui-library@0.2.0-alpha.331
  - @brains/utils@0.2.0-alpha.331

## 0.2.0-alpha.330

### Patch Changes

- Updated dependencies []:
  - @brains/plugins@0.2.0-alpha.330
  - @brains/ui-library@0.2.0-alpha.330
  - @brains/utils@0.2.0-alpha.330

## 0.2.0-alpha.329

### Patch Changes

- Updated dependencies []:
  - @brains/ui-library@0.2.0-alpha.329
  - @brains/utils@0.2.0-alpha.329
  - @brains/plugins@0.2.0-alpha.329

## 0.2.0-alpha.328

### Patch Changes

- Updated dependencies []:
  - @brains/ui-library@0.2.0-alpha.328
  - @brains/utils@0.2.0-alpha.328
  - @brains/plugins@0.2.0-alpha.328

## 0.2.0-alpha.327

### Patch Changes

- Updated dependencies [[`27fb6be`](https://github.com/rizom-ai/brains/commit/27fb6beee8c2fb4b4c60a95114b8560ac5620cad)]:
  - @brains/plugins@0.2.0-alpha.327
  - @brains/ui-library@0.2.0-alpha.327
  - @brains/utils@0.2.0-alpha.327

## 0.2.0-alpha.326

### Patch Changes

- Updated dependencies []:
  - @brains/ui-library@0.2.0-alpha.326
  - @brains/utils@0.2.0-alpha.326
  - @brains/plugins@0.2.0-alpha.326

## 0.2.0-alpha.325

### Patch Changes

- Updated dependencies []:
  - @brains/ui-library@0.2.0-alpha.325
  - @brains/utils@0.2.0-alpha.325
  - @brains/plugins@0.2.0-alpha.325

## 0.2.0-alpha.324

### Patch Changes

- Updated dependencies []:
  - @brains/ui-library@0.2.0-alpha.324
  - @brains/utils@0.2.0-alpha.324
  - @brains/plugins@0.2.0-alpha.324

## 0.2.0-alpha.323

### Patch Changes

- Updated dependencies []:
  - @brains/ui-library@0.2.0-alpha.323
  - @brains/utils@0.2.0-alpha.323
  - @brains/plugins@0.2.0-alpha.323

## 0.2.0-alpha.322

### Patch Changes

- [#166](https://github.com/rizom-ai/brains/pull/166) [`d57dbb6`](https://github.com/rizom-ai/brains/commit/d57dbb68b9cd84a5007bbea40c933efab7a581ad) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Dispatch durable entity-export intents created by worker processes through the web-owned Git checkpoint path, and register Unified Inbox recurring-check execution dependencies in worker runtimes.

- Updated dependencies []:
  - @brains/ui-library@0.2.0-alpha.322
  - @brains/utils@0.2.0-alpha.322
  - @brains/plugins@0.2.0-alpha.322

## 0.2.0-alpha.321

### Patch Changes

- Updated dependencies []:
  - @brains/plugins@0.2.0-alpha.321
  - @brains/ui-library@0.2.0-alpha.321
  - @brains/utils@0.2.0-alpha.321

## 0.2.0-alpha.320

### Patch Changes

- Updated dependencies []:
  - @brains/ui-library@0.2.0-alpha.320
  - @brains/utils@0.2.0-alpha.320
  - @brains/plugins@0.2.0-alpha.320

## 0.2.0-alpha.319

### Patch Changes

- Updated dependencies [[`df1af02`](https://github.com/rizom-ai/brains/commit/df1af02e2e0f0e1c3c7fe0580bde1aa65edbccc7)]:
  - @brains/plugins@0.2.0-alpha.319
  - @brains/ui-library@0.2.0-alpha.319
  - @brains/utils@0.2.0-alpha.319

## 0.2.0-alpha.318

### Patch Changes

- Updated dependencies []:
  - @brains/ui-library@0.2.0-alpha.318
  - @brains/utils@0.2.0-alpha.318
  - @brains/plugins@0.2.0-alpha.318

## 0.2.0-alpha.317

### Patch Changes

- Updated dependencies []:
  - @brains/ui-library@0.2.0-alpha.317
  - @brains/utils@0.2.0-alpha.317
  - @brains/plugins@0.2.0-alpha.317

## 0.2.0-alpha.316

### Patch Changes

- Updated dependencies []:
  - @brains/ui-library@0.2.0-alpha.316
  - @brains/utils@0.2.0-alpha.316
  - @brains/plugins@0.2.0-alpha.316

## 0.2.0-alpha.315

### Patch Changes

- Updated dependencies [[`efa711c`](https://github.com/rizom-ai/brains/commit/efa711cfa7a63fc9fac9da586f9e7f749fe53b76)]:
  - @brains/plugins@0.2.0-alpha.315
  - @brains/ui-library@0.2.0-alpha.315
  - @brains/utils@0.2.0-alpha.315

## 0.2.0-alpha.314

### Patch Changes

- Updated dependencies [[`9bd1925`](https://github.com/rizom-ai/brains/commit/9bd192562923351e62909c7a0662eeeb46453303), [`ae06107`](https://github.com/rizom-ai/brains/commit/ae06107694a825378e23183c26261c91166edfdf), [`ae06107`](https://github.com/rizom-ai/brains/commit/ae06107694a825378e23183c26261c91166edfdf), [`17507e8`](https://github.com/rizom-ai/brains/commit/17507e806efc5fde1c30496700de74b53575d350), [`b1263e7`](https://github.com/rizom-ai/brains/commit/b1263e72c9448cbff519732cf001a0cd1c2203ec)]:
  - @brains/plugins@0.2.0-alpha.314
  - @brains/ui-library@0.2.0-alpha.314
  - @brains/utils@0.2.0-alpha.314

## 0.2.0-alpha.313

### Patch Changes

- Updated dependencies []:
  - @brains/ui-library@0.2.0-alpha.313
  - @brains/utils@0.2.0-alpha.313
  - @brains/plugins@0.2.0-alpha.313

## 0.2.0-alpha.312

### Patch Changes

- Updated dependencies []:
  - @brains/ui-library@0.2.0-alpha.312
  - @brains/utils@0.2.0-alpha.312
  - @brains/plugins@0.2.0-alpha.312

## 0.2.0-alpha.311

### Patch Changes

- Updated dependencies [[`0b4d2bc`](https://github.com/rizom-ai/brains/commit/0b4d2bca39b83d60183c0040f63f4bb9c2f9d029)]:
  - @brains/utils@0.2.0-alpha.311
  - @brains/ui-library@0.2.0-alpha.311
  - @brains/plugins@0.2.0-alpha.311

## 0.2.0-alpha.310

### Patch Changes

- Updated dependencies []:
  - @brains/ui-library@0.2.0-alpha.310
  - @brains/utils@0.2.0-alpha.310
  - @brains/plugins@0.2.0-alpha.310

## 0.2.0-alpha.309

### Patch Changes

- Updated dependencies []:
  - @brains/ui-library@0.2.0-alpha.309
  - @brains/utils@0.2.0-alpha.309
  - @brains/plugins@0.2.0-alpha.309

## 0.2.0-alpha.308

### Patch Changes

- Updated dependencies []:
  - @brains/ui-library@0.2.0-alpha.308
  - @brains/utils@0.2.0-alpha.308
  - @brains/plugins@0.2.0-alpha.308

## 0.2.0-alpha.307

### Patch Changes

- Updated dependencies [[`947bd44`](https://github.com/rizom-ai/brains/commit/947bd44edf379b9dfa70732dfd0b98c2655dae38)]:
  - @brains/plugins@0.2.0-alpha.307
  - @brains/ui-library@0.2.0-alpha.307
  - @brains/utils@0.2.0-alpha.307

## 0.2.0-alpha.306

### Patch Changes

- Updated dependencies []:
  - @brains/ui-library@0.2.0-alpha.306
  - @brains/utils@0.2.0-alpha.306
  - @brains/plugins@0.2.0-alpha.306

## 0.2.0-alpha.305

### Patch Changes

- Updated dependencies []:
  - @brains/plugins@0.2.0-alpha.305
  - @brains/ui-library@0.2.0-alpha.305
  - @brains/utils@0.2.0-alpha.305

## 0.2.0-alpha.304

### Patch Changes

- Updated dependencies []:
  - @brains/ui-library@0.2.0-alpha.304
  - @brains/utils@0.2.0-alpha.304
  - @brains/plugins@0.2.0-alpha.304

## 0.2.0-alpha.303

### Patch Changes

- Updated dependencies [[`5ff2420`](https://github.com/rizom-ai/brains/commit/5ff2420e2173df8b9add5bfc05a91033ddd1d976)]:
  - @brains/plugins@0.2.0-alpha.303
  - @brains/ui-library@0.2.0-alpha.303
  - @brains/utils@0.2.0-alpha.303

## 0.2.0-alpha.302

### Patch Changes

- Updated dependencies []:
  - @brains/ui-library@0.2.0-alpha.302
  - @brains/utils@0.2.0-alpha.302
  - @brains/plugins@0.2.0-alpha.302

## 0.2.0-alpha.301

### Patch Changes

- Updated dependencies [[`b2fd00c`](https://github.com/rizom-ai/brains/commit/b2fd00c1550e0b9a386484e07a53546106f793ce)]:
  - @brains/plugins@0.2.0-alpha.301
  - @brains/ui-library@0.2.0-alpha.301
  - @brains/utils@0.2.0-alpha.301

## 0.2.0-alpha.300

### Patch Changes

- Updated dependencies []:
  - @brains/ui-library@0.2.0-alpha.300
  - @brains/utils@0.2.0-alpha.300
  - @brains/plugins@0.2.0-alpha.300

## 0.2.0-alpha.299

### Patch Changes

- Updated dependencies []:
  - @brains/ui-library@0.2.0-alpha.299
  - @brains/utils@0.2.0-alpha.299
  - @brains/plugins@0.2.0-alpha.299

## 0.2.0-alpha.298

### Patch Changes

- Updated dependencies [[`9666d4a`](https://github.com/rizom-ai/brains/commit/9666d4af711d4a65ea2f071e757178f2639c6325)]:
  - @brains/plugins@0.2.0-alpha.298
  - @brains/ui-library@0.2.0-alpha.298
  - @brains/utils@0.2.0-alpha.298

## 0.2.0-alpha.297

### Minor Changes

- [#144](https://github.com/rizom-ai/brains/pull/144) [`f6d93c7`](https://github.com/rizom-ai/brains/commit/f6d93c7aa49acccd691b049b090a7fdbbe7b6a1a) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Rename the email workflow package, add destination-resolved source-specific Inbox follow-ups, and ship private locator-backed IMAP detail reads plus an Admin-only reply drafting workspace. Original messages remain mailbox-owned and non-persistent; only operator-authored reply drafts are stored.

### Patch Changes

- Updated dependencies [[`f6d93c7`](https://github.com/rizom-ai/brains/commit/f6d93c7aa49acccd691b049b090a7fdbbe7b6a1a)]:
  - @brains/plugins@0.2.0-alpha.297
  - @brains/ui-library@0.2.0-alpha.297
  - @brains/utils@0.2.0-alpha.297

## 0.2.0-alpha.296

### Patch Changes

- Updated dependencies []:
  - @brains/ui-library@0.2.0-alpha.296
  - @brains/utils@0.2.0-alpha.296
  - @brains/plugins@0.2.0-alpha.296

## 0.2.0-alpha.295

### Patch Changes

- Updated dependencies []:
  - @brains/plugins@0.2.0-alpha.295
  - @brains/ui-library@0.2.0-alpha.295
  - @brains/utils@0.2.0-alpha.295

## 0.2.0-alpha.294

### Minor Changes

- [#139](https://github.com/rizom-ai/brains/pull/139) [`995d491`](https://github.com/rizom-ai/brains/commit/995d4910a2d6b10e3524664dd557ce2100d48173) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Fold new-mail triage into the shared Inbox, retire the parallel Email Triage CMS workspace, advertise the mounted Inbox as an Admin interaction, and link new-only email Dashboard counts to canonical source-scoped Inbox filters while retaining history in Mail Items.

### Patch Changes

- Updated dependencies [[`995d491`](https://github.com/rizom-ai/brains/commit/995d4910a2d6b10e3524664dd557ce2100d48173)]:
  - @brains/plugins@0.2.0-alpha.294
  - @brains/ui-library@0.2.0-alpha.294
  - @brains/utils@0.2.0-alpha.294

## 0.2.0-alpha.293

### Patch Changes

- Updated dependencies [[`f25b201`](https://github.com/rizom-ai/brains/commit/f25b2017de7be3a7eb117166ca3458237055137b)]:
  - @brains/plugins@0.2.0-alpha.293
  - @brains/ui-library@0.2.0-alpha.293
  - @brains/utils@0.2.0-alpha.293

## 0.2.0-alpha.292

### Minor Changes

- [#137](https://github.com/rizom-ai/brains/pull/137) [`7fc21a2`](https://github.com/rizom-ai/brains/commit/7fc21a277c3e81779c65d9a95809c0d53682406f) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Add bounded source-scoped Inbox facets with source-owned vocabularies, validated item values, shared workspace and headless filtering, canonical facet URLs, selected-source CMS controls, and category, priority, and reply facets for new mail.

### Patch Changes

- Updated dependencies [[`7fc21a2`](https://github.com/rizom-ai/brains/commit/7fc21a277c3e81779c65d9a95809c0d53682406f)]:
  - @brains/plugins@0.2.0-alpha.292
  - @brains/ui-library@0.2.0-alpha.292
  - @brains/utils@0.2.0-alpha.292

## 0.2.0-alpha.291

### Patch Changes

- Updated dependencies [[`3ed9cfe`](https://github.com/rizom-ai/brains/commit/3ed9cfe0636ee55dac9bf74506d743a6a84eb6f8)]:
  - @brains/plugins@0.2.0-alpha.291
  - @brains/ui-library@0.2.0-alpha.291
  - @brains/utils@0.2.0-alpha.291

## 0.2.0-alpha.290

### Patch Changes

- Updated dependencies []:
  - @brains/plugins@0.2.0-alpha.290
  - @brains/ui-library@0.2.0-alpha.290
  - @brains/utils@0.2.0-alpha.290

## 0.2.0-alpha.289

### Patch Changes

- Updated dependencies []:
  - @brains/ui-library@0.2.0-alpha.289
  - @brains/utils@0.2.0-alpha.289
  - @brains/plugins@0.2.0-alpha.289

## 0.2.0-alpha.288

### Minor Changes

- [#128](https://github.com/rizom-ai/brains/pull/128) [`b06bc78`](https://github.com/rizom-ai/brains/commit/b06bc78514aa163b3a86c5c6d62d4500aa7c7e3b) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Add destination-owned Inbox follow-up kinds with finalized app-scoped registration, permission- and capability-gated universal launches, bounded same-origin history-state handoffs, CMS note capture and source-entity navigation, and web-chat composer prefill without automatic send or save.

### Patch Changes

- Updated dependencies [[`b06bc78`](https://github.com/rizom-ai/brains/commit/b06bc78514aa163b3a86c5c6d62d4500aa7c7e3b)]:
  - @brains/plugins@0.2.0-alpha.288
  - @brains/ui-library@0.2.0-alpha.288
  - @brains/utils@0.2.0-alpha.288

## 0.2.0-alpha.287

### Patch Changes

- Updated dependencies []:
  - @brains/ui-library@0.2.0-alpha.287
  - @brains/utils@0.2.0-alpha.287
  - @brains/plugins@0.2.0-alpha.287

## 0.2.0-alpha.286

### Patch Changes

- Updated dependencies [[`b7cda6c`](https://github.com/rizom-ai/brains/commit/b7cda6cd64c1a7400b16bf4faacb36d0244c58f9)]:
  - @brains/plugins@0.2.0-alpha.286
  - @brains/ui-library@0.2.0-alpha.286
  - @brains/utils@0.2.0-alpha.286

## 0.2.0-alpha.285

### Patch Changes

- [#119](https://github.com/rizom-ai/brains/pull/119) [`c41168e`](https://github.com/rizom-ai/brains/commit/c41168ea6058686541e3bd3abde1699d86687eb0) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Add opt-in CMS workspace URL queries and linkable Inbox source and urgency filters while keeping pagination transient and malformed filters failure-isolated.

- Updated dependencies [[`c41168e`](https://github.com/rizom-ai/brains/commit/c41168ea6058686541e3bd3abde1699d86687eb0)]:
  - @brains/plugins@0.2.0-alpha.285
  - @brains/ui-library@0.2.0-alpha.285
  - @brains/utils@0.2.0-alpha.285

## 0.2.0-alpha.284

### Patch Changes

- Updated dependencies []:
  - @brains/ui-library@0.2.0-alpha.284
  - @brains/utils@0.2.0-alpha.284
  - @brains/plugins@0.2.0-alpha.284

## 0.2.0-alpha.283

### Patch Changes

- Updated dependencies []:
  - @brains/ui-library@0.2.0-alpha.283
  - @brains/utils@0.2.0-alpha.283
  - @brains/plugins@0.2.0-alpha.283

## 0.2.0-alpha.282

### Patch Changes

- Updated dependencies []:
  - @brains/ui-library@0.2.0-alpha.282
  - @brains/utils@0.2.0-alpha.282
  - @brains/plugins@0.2.0-alpha.282

## 0.2.0-alpha.281

### Patch Changes

- [#114](https://github.com/rizom-ai/brains/pull/114) [`c6b44ae`](https://github.com/rizom-ai/brains/commit/c6b44ae420bc0c4c92c2081bfbc320c00987db79) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Add migration-gated email thread ordinals with deterministic indexed ordering, concurrency-safe ingress assignment, directory round-trip preservation, and Inbox-only “message N in thread” rendering.

- Updated dependencies [[`c6b44ae`](https://github.com/rizom-ai/brains/commit/c6b44ae420bc0c4c92c2081bfbc320c00987db79)]:
  - @brains/plugins@0.2.0-alpha.281
  - @brains/ui-library@0.2.0-alpha.281
  - @brains/utils@0.2.0-alpha.281

## 0.2.0-alpha.280

### Patch Changes

- [#112](https://github.com/rizom-ai/brains/pull/112) [`2e931c3`](https://github.com/rizom-ai/brains/commit/2e931c339065860f31a034f3ad5b3bc10852dffc) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Project recurring-check alerts into the unified Inbox independently of notification availability, with durable Admin resolution, channel retry deduplication, and channel-only digest support.

- Updated dependencies []:
  - @brains/plugins@0.2.0-alpha.280
  - @brains/ui-library@0.2.0-alpha.280
  - @brains/utils@0.2.0-alpha.280

## 0.2.0-alpha.279

### Minor Changes

- [#111](https://github.com/rizom-ai/brains/pull/111) [`bd1eb47`](https://github.com/rizom-ai/brains/commit/bd1eb4768ee154570f5ba144f59a145c7f00aa51) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Connect recognizable Inbox senders to verified People identities. Normalize privacy-safe inbound email identity resolution, derive bounded sender labels without retaining mailbox addresses, carry a structured optional contact through the Inbox contract, and link resolved contacts to the exact person through the registered Admin surface while keeping Dashboard and digest projections redacted. Consume shared Dashboard widget primitives from the UI library rather than importing across plugin boundaries.

- [#111](https://github.com/rizom-ai/brains/pull/111) [`d0211d9`](https://github.com/rizom-ai/brains/commit/d0211d97253360ead7cfdeb957650e7ff8369afc) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Add the dedicated Admin CMS Inbox workspace with bounded server filters and paging, list/detail triage, source-entity navigation, access-checked rail badges, and server-gated action confirmation. Reduce Dashboard to a redacted five-entry read-only summary, route Dashboard and daily digest navigation to the custom CMS workspace mount, retain `inbox_list` as the conversational read surface, and remove the superseded Dashboard mutation route and script.

### Patch Changes

- [#111](https://github.com/rizom-ai/brains/pull/111) [`3817182`](https://github.com/rizom-ai/brains/commit/3817182abc35b2bd8a96e4d4b76e63240368a337) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Harden the Admin-only `inbox_list` headless reader with a strict content-safe output allowlist, shared workspace filters, empty-registry behavior, and direct MCP coverage without browser plugins.

- Updated dependencies [[`bd1eb47`](https://github.com/rizom-ai/brains/commit/bd1eb4768ee154570f5ba144f59a145c7f00aa51), [`d0211d9`](https://github.com/rizom-ai/brains/commit/d0211d97253360ead7cfdeb957650e7ff8369afc)]:
  - @brains/plugins@0.2.0-alpha.279
  - @brains/ui-library@0.2.0-alpha.279
  - @brains/utils@0.2.0-alpha.279

## 0.2.0-alpha.278

### Patch Changes

- Updated dependencies [[`f2d2775`](https://github.com/rizom-ai/brains/commit/f2d2775d61177d5af16e3a839aed6d18de10a511)]:
  - @brains/plugins@0.2.0-alpha.278
  - @brains/utils@0.2.0-alpha.278

## 0.2.0-alpha.277

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.277
  - @brains/plugins@0.2.0-alpha.277

## 0.2.0-alpha.276

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.276
  - @brains/plugins@0.2.0-alpha.276

## 0.2.0-alpha.275

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.275
  - @brains/plugins@0.2.0-alpha.275

## 0.2.0-alpha.274

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.274
  - @brains/plugins@0.2.0-alpha.274

## 0.2.0-alpha.273

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.273
  - @brains/plugins@0.2.0-alpha.273

## 0.2.0-alpha.272

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.272
  - @brains/plugins@0.2.0-alpha.272

## 0.2.0-alpha.271

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.271
  - @brains/plugins@0.2.0-alpha.271

## 0.2.0-alpha.270

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.270
  - @brains/plugins@0.2.0-alpha.270

## 0.2.0-alpha.269

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.269
  - @brains/plugins@0.2.0-alpha.269

## 0.2.0-alpha.268

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.268
  - @brains/plugins@0.2.0-alpha.268

## 0.2.0-alpha.267

### Patch Changes

- Updated dependencies []:
  - @brains/plugins@0.2.0-alpha.267
  - @brains/utils@0.2.0-alpha.267

## 0.2.0-alpha.266

### Patch Changes

- Updated dependencies [[`e70ab12`](https://github.com/rizom-ai/brains/commit/e70ab12745c6cf757f685389f4cd6de8991de95f)]:
  - @brains/utils@0.2.0-alpha.266
  - @brains/plugins@0.2.0-alpha.266

## 0.2.0-alpha.265

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.265
  - @brains/plugins@0.2.0-alpha.265

## 0.2.0-alpha.264

### Patch Changes

- Updated dependencies []:
  - @brains/plugins@0.2.0-alpha.264
  - @brains/utils@0.2.0-alpha.264

## 0.2.0-alpha.263

### Patch Changes

- Updated dependencies []:
  - @brains/plugins@0.2.0-alpha.263
  - @brains/utils@0.2.0-alpha.263

## 0.2.0-alpha.262

### Patch Changes

- Updated dependencies []:
  - @brains/plugins@0.2.0-alpha.262
  - @brains/utils@0.2.0-alpha.262

## 0.2.0-alpha.261

### Patch Changes

- Updated dependencies []:
  - @brains/plugins@0.2.0-alpha.261
  - @brains/utils@0.2.0-alpha.261

## 0.2.0-alpha.260

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.260
  - @brains/plugins@0.2.0-alpha.260

## 0.2.0-alpha.259

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.259
  - @brains/plugins@0.2.0-alpha.259

## 0.2.0-alpha.258

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.258
  - @brains/plugins@0.2.0-alpha.258

## 0.2.0-alpha.257

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.257
  - @brains/plugins@0.2.0-alpha.257

## 0.2.0-alpha.256

### Patch Changes

- Updated dependencies [[`b155d93`](https://github.com/rizom-ai/brains/commit/b155d938c240bcc9500c2395f11763ab49a017c9), [`1e45eca`](https://github.com/rizom-ai/brains/commit/1e45ecaaed5351964cbf8a0754a301507b15c298), [`b155d93`](https://github.com/rizom-ai/brains/commit/b155d938c240bcc9500c2395f11763ab49a017c9), [`b155d93`](https://github.com/rizom-ai/brains/commit/b155d938c240bcc9500c2395f11763ab49a017c9)]:
  - @brains/plugins@0.2.0-alpha.256
  - @brains/utils@0.2.0-alpha.256

## 0.2.0-alpha.255

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.255
  - @brains/plugins@0.2.0-alpha.255

## 0.2.0-alpha.254

### Patch Changes

- Updated dependencies []:
  - @brains/plugins@0.2.0-alpha.254
  - @brains/utils@0.2.0-alpha.254

## 0.2.0-alpha.253

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.253
  - @brains/plugins@0.2.0-alpha.253

## 0.2.0-alpha.252

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.252
  - @brains/plugins@0.2.0-alpha.252

## 0.2.0-alpha.251

### Minor Changes

- [#81](https://github.com/rizom-ai/brains/pull/81) [`ca41276`](https://github.com/rizom-ai/brains/commit/ca412762e73ca8391d8a77a6c08b20c63b30848e) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Add the schema-first unified-inbox source contract, finalized app-scoped registry, and opt-in failure-isolating live aggregation DataSource. Sources retain ownership of attention state; the inbox stores no duplicate items.

### Patch Changes

- Updated dependencies [[`ca41276`](https://github.com/rizom-ai/brains/commit/ca412762e73ca8391d8a77a6c08b20c63b30848e)]:
  - @brains/plugins@0.2.0-alpha.251
  - @brains/utils@0.2.0-alpha.251
