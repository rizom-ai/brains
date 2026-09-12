# @brains/directory-sync

## 0.2.0-alpha.368

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.368
  - @brains/contracts@0.2.0-alpha.368
  - @brains/image@0.2.0-alpha.368
  - @brains/utils@0.2.0-alpha.368
  - @brains/plugins@0.2.0-alpha.368

## 0.2.0-alpha.367

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.367
  - @brains/contracts@0.2.0-alpha.367
  - @brains/image@0.2.0-alpha.367
  - @brains/utils@0.2.0-alpha.367
  - @brains/plugins@0.2.0-alpha.367

## 0.2.0-alpha.366

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.366
  - @brains/contracts@0.2.0-alpha.366
  - @brains/image@0.2.0-alpha.366
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
  - @brains/plugins@0.2.0-alpha.365
  - @brains/image@0.2.0-alpha.365
  - @brains/content-formatters@0.2.0-alpha.365
  - @brains/contracts@0.2.0-alpha.365
  - @brains/utils@0.2.0-alpha.365

## 0.2.0-alpha.364

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.364
  - @brains/contracts@0.2.0-alpha.364
  - @brains/image@0.2.0-alpha.364
  - @brains/utils@0.2.0-alpha.364
  - @brains/plugins@0.2.0-alpha.364

## 0.2.0-alpha.363

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.363
  - @brains/contracts@0.2.0-alpha.363
  - @brains/image@0.2.0-alpha.363
  - @brains/utils@0.2.0-alpha.363
  - @brains/plugins@0.2.0-alpha.363

## 0.2.0-alpha.362

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.362
  - @brains/contracts@0.2.0-alpha.362
  - @brains/image@0.2.0-alpha.362
  - @brains/utils@0.2.0-alpha.362
  - @brains/plugins@0.2.0-alpha.362

## 0.2.0-alpha.361

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.361
  - @brains/contracts@0.2.0-alpha.361
  - @brains/image@0.2.0-alpha.361
  - @brains/utils@0.2.0-alpha.361
  - @brains/plugins@0.2.0-alpha.361

## 0.2.0-alpha.360

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.360
  - @brains/contracts@0.2.0-alpha.360
  - @brains/image@0.2.0-alpha.360
  - @brains/utils@0.2.0-alpha.360
  - @brains/plugins@0.2.0-alpha.360

## 0.2.0-alpha.359

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.359
  - @brains/contracts@0.2.0-alpha.359
  - @brains/image@0.2.0-alpha.359
  - @brains/utils@0.2.0-alpha.359
  - @brains/plugins@0.2.0-alpha.359

## 0.2.0-alpha.358

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.358
  - @brains/contracts@0.2.0-alpha.358
  - @brains/image@0.2.0-alpha.358
  - @brains/utils@0.2.0-alpha.358
  - @brains/plugins@0.2.0-alpha.358

## 0.2.0-alpha.357

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.357
  - @brains/contracts@0.2.0-alpha.357
  - @brains/image@0.2.0-alpha.357
  - @brains/utils@0.2.0-alpha.357
  - @brains/plugins@0.2.0-alpha.357

## 0.2.0-alpha.356

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.356
  - @brains/contracts@0.2.0-alpha.356
  - @brains/image@0.2.0-alpha.356
  - @brains/utils@0.2.0-alpha.356
  - @brains/plugins@0.2.0-alpha.356

## 0.2.0-alpha.355

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.355
  - @brains/contracts@0.2.0-alpha.355
  - @brains/image@0.2.0-alpha.355
  - @brains/utils@0.2.0-alpha.355
  - @brains/plugins@0.2.0-alpha.355

## 0.2.0-alpha.354

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.354
  - @brains/contracts@0.2.0-alpha.354
  - @brains/image@0.2.0-alpha.354
  - @brains/utils@0.2.0-alpha.354
  - @brains/plugins@0.2.0-alpha.354

## 0.2.0-alpha.353

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.353
  - @brains/contracts@0.2.0-alpha.353
  - @brains/image@0.2.0-alpha.353
  - @brains/utils@0.2.0-alpha.353
  - @brains/plugins@0.2.0-alpha.353

## 0.2.0-alpha.352

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.352
  - @brains/contracts@0.2.0-alpha.352
  - @brains/image@0.2.0-alpha.352
  - @brains/utils@0.2.0-alpha.352
  - @brains/plugins@0.2.0-alpha.352

## 0.2.0-alpha.351

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.351
  - @brains/contracts@0.2.0-alpha.351
  - @brains/image@0.2.0-alpha.351
  - @brains/utils@0.2.0-alpha.351
  - @brains/plugins@0.2.0-alpha.351

## 0.2.0-alpha.350

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.350
  - @brains/contracts@0.2.0-alpha.350
  - @brains/image@0.2.0-alpha.350
  - @brains/utils@0.2.0-alpha.350
  - @brains/plugins@0.2.0-alpha.350

## 0.2.0-alpha.349

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.349
  - @brains/contracts@0.2.0-alpha.349
  - @brains/image@0.2.0-alpha.349
  - @brains/utils@0.2.0-alpha.349
  - @brains/plugins@0.2.0-alpha.349

## 0.2.0-alpha.348

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.348
  - @brains/contracts@0.2.0-alpha.348
  - @brains/image@0.2.0-alpha.348
  - @brains/utils@0.2.0-alpha.348
  - @brains/plugins@0.2.0-alpha.348

## 0.2.0-alpha.347

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.347
  - @brains/contracts@0.2.0-alpha.347
  - @brains/image@0.2.0-alpha.347
  - @brains/utils@0.2.0-alpha.347
  - @brains/plugins@0.2.0-alpha.347

## 0.2.0-alpha.346

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.346
  - @brains/contracts@0.2.0-alpha.346
  - @brains/image@0.2.0-alpha.346
  - @brains/utils@0.2.0-alpha.346
  - @brains/plugins@0.2.0-alpha.346

## 0.2.0-alpha.345

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.345
  - @brains/contracts@0.2.0-alpha.345
  - @brains/image@0.2.0-alpha.345
  - @brains/utils@0.2.0-alpha.345
  - @brains/plugins@0.2.0-alpha.345

## 0.2.0-alpha.344

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.344
  - @brains/contracts@0.2.0-alpha.344
  - @brains/image@0.2.0-alpha.344
  - @brains/utils@0.2.0-alpha.344
  - @brains/plugins@0.2.0-alpha.344

## 0.2.0-alpha.343

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.343
  - @brains/contracts@0.2.0-alpha.343
  - @brains/image@0.2.0-alpha.343
  - @brains/utils@0.2.0-alpha.343
  - @brains/plugins@0.2.0-alpha.343

## 0.2.0-alpha.342

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.342
  - @brains/contracts@0.2.0-alpha.342
  - @brains/image@0.2.0-alpha.342
  - @brains/utils@0.2.0-alpha.342
  - @brains/plugins@0.2.0-alpha.342

## 0.2.0-alpha.341

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.341
  - @brains/contracts@0.2.0-alpha.341
  - @brains/image@0.2.0-alpha.341
  - @brains/utils@0.2.0-alpha.341
  - @brains/plugins@0.2.0-alpha.341

## 0.2.0-alpha.340

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.340
  - @brains/contracts@0.2.0-alpha.340
  - @brains/image@0.2.0-alpha.340
  - @brains/utils@0.2.0-alpha.340
  - @brains/plugins@0.2.0-alpha.340

## 0.2.0-alpha.339

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.339
  - @brains/contracts@0.2.0-alpha.339
  - @brains/image@0.2.0-alpha.339
  - @brains/utils@0.2.0-alpha.339
  - @brains/plugins@0.2.0-alpha.339

## 0.2.0-alpha.338

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.338
  - @brains/contracts@0.2.0-alpha.338
  - @brains/image@0.2.0-alpha.338
  - @brains/utils@0.2.0-alpha.338
  - @brains/plugins@0.2.0-alpha.338

## 0.2.0-alpha.337

### Patch Changes

- Updated dependencies []:
  - @brains/image@0.2.0-alpha.337
  - @brains/plugins@0.2.0-alpha.337
  - @brains/content-formatters@0.2.0-alpha.337
  - @brains/contracts@0.2.0-alpha.337
  - @brains/utils@0.2.0-alpha.337

## 0.2.0-alpha.336

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.336
  - @brains/contracts@0.2.0-alpha.336
  - @brains/image@0.2.0-alpha.336
  - @brains/utils@0.2.0-alpha.336
  - @brains/plugins@0.2.0-alpha.336

## 0.2.0-alpha.335

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.335
  - @brains/contracts@0.2.0-alpha.335
  - @brains/image@0.2.0-alpha.335
  - @brains/utils@0.2.0-alpha.335
  - @brains/plugins@0.2.0-alpha.335

## 0.2.0-alpha.334

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.334
  - @brains/contracts@0.2.0-alpha.334
  - @brains/image@0.2.0-alpha.334
  - @brains/utils@0.2.0-alpha.334
  - @brains/plugins@0.2.0-alpha.334

## 0.2.0-alpha.333

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.333
  - @brains/contracts@0.2.0-alpha.333
  - @brains/image@0.2.0-alpha.333
  - @brains/utils@0.2.0-alpha.333
  - @brains/plugins@0.2.0-alpha.333

## 0.2.0-alpha.332

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.332
  - @brains/contracts@0.2.0-alpha.332
  - @brains/image@0.2.0-alpha.332
  - @brains/utils@0.2.0-alpha.332
  - @brains/plugins@0.2.0-alpha.332

## 0.2.0-alpha.331

### Patch Changes

- Updated dependencies [[`62db779`](https://github.com/rizom-ai/brains/commit/62db77946a964aaba655d5fc68b40a13e1e9139d)]:
  - @brains/plugins@0.2.0-alpha.331
  - @brains/content-formatters@0.2.0-alpha.331
  - @brains/contracts@0.2.0-alpha.331
  - @brains/image@0.2.0-alpha.331
  - @brains/utils@0.2.0-alpha.331

## 0.2.0-alpha.330

### Patch Changes

- Updated dependencies []:
  - @brains/plugins@0.2.0-alpha.330
  - @brains/image@0.2.0-alpha.330
  - @brains/content-formatters@0.2.0-alpha.330
  - @brains/contracts@0.2.0-alpha.330
  - @brains/utils@0.2.0-alpha.330

## 0.2.0-alpha.329

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.329
  - @brains/contracts@0.2.0-alpha.329
  - @brains/image@0.2.0-alpha.329
  - @brains/utils@0.2.0-alpha.329
  - @brains/plugins@0.2.0-alpha.329

## 0.2.0-alpha.328

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.328
  - @brains/contracts@0.2.0-alpha.328
  - @brains/image@0.2.0-alpha.328
  - @brains/utils@0.2.0-alpha.328
  - @brains/plugins@0.2.0-alpha.328

## 0.2.0-alpha.327

### Patch Changes

- Updated dependencies [[`27fb6be`](https://github.com/rizom-ai/brains/commit/27fb6beee8c2fb4b4c60a95114b8560ac5620cad)]:
  - @brains/plugins@0.2.0-alpha.327
  - @brains/content-formatters@0.2.0-alpha.327
  - @brains/contracts@0.2.0-alpha.327
  - @brains/image@0.2.0-alpha.327
  - @brains/utils@0.2.0-alpha.327

## 0.2.0-alpha.326

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.326
  - @brains/contracts@0.2.0-alpha.326
  - @brains/image@0.2.0-alpha.326
  - @brains/utils@0.2.0-alpha.326
  - @brains/plugins@0.2.0-alpha.326

## 0.2.0-alpha.325

### Patch Changes

- [#170](https://github.com/rizom-ai/brains/pull/170) [`ff82de8`](https://github.com/rizom-ai/brains/commit/ff82de8dac12b47bfaa2c48bae90b0740a70bfcf) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Detect unpushed commits against the explicit configured remote branch even when a legacy checkout has no upstream, and return Git checkpoints only when observed remote HEAD exactly matches local HEAD.

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.325
  - @brains/contracts@0.2.0-alpha.325
  - @brains/image@0.2.0-alpha.325
  - @brains/utils@0.2.0-alpha.325
  - @brains/plugins@0.2.0-alpha.325

## 0.2.0-alpha.324

### Patch Changes

- [#169](https://github.com/rizom-ai/brains/pull/169) [`676479c`](https://github.com/rizom-ai/brains/commit/676479c591fcdb271642302527fcc42457aec009) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Allow valid inline documentation of Git conflict-marker tokens while continuing to reject complete unresolved conflict blocks before committing synchronized content.

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.324
  - @brains/contracts@0.2.0-alpha.324
  - @brains/image@0.2.0-alpha.324
  - @brains/utils@0.2.0-alpha.324
  - @brains/plugins@0.2.0-alpha.324

## 0.2.0-alpha.323

### Patch Changes

- [#167](https://github.com/rizom-ai/brains/pull/167) [`f655ddd`](https://github.com/rizom-ai/brains/commit/f655dddf1f494205e51d1d2042b8b5a09b0b2722) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Recover corrected quarantined files without corrupting multiline diagnostics, retire stale quarantine artifacts, settle startup import status, and confirm any generated Git bookkeeping before initial sync succeeds.

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.323
  - @brains/contracts@0.2.0-alpha.323
  - @brains/image@0.2.0-alpha.323
  - @brains/utils@0.2.0-alpha.323
  - @brains/plugins@0.2.0-alpha.323

## 0.2.0-alpha.322

### Patch Changes

- [#166](https://github.com/rizom-ai/brains/pull/166) [`d57dbb6`](https://github.com/rizom-ai/brains/commit/d57dbb68b9cd84a5007bbea40c933efab7a581ad) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Dispatch durable entity-export intents created by worker processes through the web-owned Git checkpoint path, and register Unified Inbox recurring-check execution dependencies in worker runtimes.

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.322
  - @brains/contracts@0.2.0-alpha.322
  - @brains/image@0.2.0-alpha.322
  - @brains/utils@0.2.0-alpha.322
  - @brains/plugins@0.2.0-alpha.322

## 0.2.0-alpha.321

### Patch Changes

- [#163](https://github.com/rizom-ai/brains/pull/163) [`f9bd1c6`](https://github.com/rizom-ai/brains/commit/f9bd1c6291f560a5bb679357d199f1af29005d63) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Persist entity-to-directory export intents atomically with entity mutations, recover and checkpoint them through Git before acknowledgement, and block destructive cleanup while exports remain unsettled.

- Updated dependencies []:
  - @brains/image@0.2.0-alpha.321
  - @brains/plugins@0.2.0-alpha.321
  - @brains/content-formatters@0.2.0-alpha.321
  - @brains/contracts@0.2.0-alpha.321
  - @brains/utils@0.2.0-alpha.321

## 0.2.0-alpha.320

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.320
  - @brains/contracts@0.2.0-alpha.320
  - @brains/image@0.2.0-alpha.320
  - @brains/utils@0.2.0-alpha.320
  - @brains/plugins@0.2.0-alpha.320

## 0.2.0-alpha.319

### Patch Changes

- Updated dependencies [[`df1af02`](https://github.com/rizom-ai/brains/commit/df1af02e2e0f0e1c3c7fe0580bde1aa65edbccc7)]:
  - @brains/plugins@0.2.0-alpha.319
  - @brains/content-formatters@0.2.0-alpha.319
  - @brains/contracts@0.2.0-alpha.319
  - @brains/image@0.2.0-alpha.319
  - @brains/utils@0.2.0-alpha.319

## 0.2.0-alpha.318

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.318
  - @brains/contracts@0.2.0-alpha.318
  - @brains/image@0.2.0-alpha.318
  - @brains/utils@0.2.0-alpha.318
  - @brains/plugins@0.2.0-alpha.318

## 0.2.0-alpha.317

### Patch Changes

- [`8537d22`](https://github.com/rizom-ai/brains/commit/8537d229b0d0c9c3ddadb7d8a78330fb7f5f1b24) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Export updates to non-public entities again. The `entity:updated` auto-export subscriber re-read the entity without a visibility scope, and entity reads fail closed to public-only, so every `shared` or `restricted` entity came back null and was silently skipped — the file was never rewritten and the debounced git auto-commit found a clean tree. Creation was unaffected because it writes the event payload directly, so content repos only ever received added files, never modifications. The read now opts up through `internalFullScope`, matching the export pipeline and both import-side reads.

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.317
  - @brains/contracts@0.2.0-alpha.317
  - @brains/image@0.2.0-alpha.317
  - @brains/utils@0.2.0-alpha.317
  - @brains/plugins@0.2.0-alpha.317

## 0.2.0-alpha.316

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.316
  - @brains/contracts@0.2.0-alpha.316
  - @brains/image@0.2.0-alpha.316
  - @brains/utils@0.2.0-alpha.316
  - @brains/plugins@0.2.0-alpha.316

## 0.2.0-alpha.315

### Patch Changes

- Updated dependencies [[`efa711c`](https://github.com/rizom-ai/brains/commit/efa711cfa7a63fc9fac9da586f9e7f749fe53b76)]:
  - @brains/plugins@0.2.0-alpha.315
  - @brains/content-formatters@0.2.0-alpha.315
  - @brains/contracts@0.2.0-alpha.315
  - @brains/image@0.2.0-alpha.315
  - @brains/utils@0.2.0-alpha.315

## 0.2.0-alpha.314

### Patch Changes

- Updated dependencies [[`9bd1925`](https://github.com/rizom-ai/brains/commit/9bd192562923351e62909c7a0662eeeb46453303), [`ae06107`](https://github.com/rizom-ai/brains/commit/ae06107694a825378e23183c26261c91166edfdf), [`d339319`](https://github.com/rizom-ai/brains/commit/d339319dabea7f856b69c829e46d3937254880d3), [`ae06107`](https://github.com/rizom-ai/brains/commit/ae06107694a825378e23183c26261c91166edfdf), [`ae06107`](https://github.com/rizom-ai/brains/commit/ae06107694a825378e23183c26261c91166edfdf), [`17507e8`](https://github.com/rizom-ai/brains/commit/17507e806efc5fde1c30496700de74b53575d350), [`b1263e7`](https://github.com/rizom-ai/brains/commit/b1263e72c9448cbff519732cf001a0cd1c2203ec), [`497fbc0`](https://github.com/rizom-ai/brains/commit/497fbc0f6d672e23afd5263a519c4e73a740c2c5)]:
  - @brains/contracts@0.2.0-alpha.314
  - @brains/plugins@0.2.0-alpha.314
  - @brains/content-formatters@0.2.0-alpha.314
  - @brains/image@0.2.0-alpha.314
  - @brains/utils@0.2.0-alpha.314

## 0.2.0-alpha.313

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.313
  - @brains/contracts@0.2.0-alpha.313
  - @brains/image@0.2.0-alpha.313
  - @brains/utils@0.2.0-alpha.313
  - @brains/plugins@0.2.0-alpha.313

## 0.2.0-alpha.312

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.312
  - @brains/contracts@0.2.0-alpha.312
  - @brains/image@0.2.0-alpha.312
  - @brains/utils@0.2.0-alpha.312
  - @brains/plugins@0.2.0-alpha.312

## 0.2.0-alpha.311

### Patch Changes

- Updated dependencies [[`0b4d2bc`](https://github.com/rizom-ai/brains/commit/0b4d2bca39b83d60183c0040f63f4bb9c2f9d029)]:
  - @brains/utils@0.2.0-alpha.311
  - @brains/content-formatters@0.2.0-alpha.311
  - @brains/contracts@0.2.0-alpha.311
  - @brains/image@0.2.0-alpha.311
  - @brains/plugins@0.2.0-alpha.311

## 0.2.0-alpha.310

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.310
  - @brains/contracts@0.2.0-alpha.310
  - @brains/image@0.2.0-alpha.310
  - @brains/utils@0.2.0-alpha.310
  - @brains/plugins@0.2.0-alpha.310

## 0.2.0-alpha.309

### Patch Changes

- [#149](https://github.com/rizom-ai/brains/pull/149) [`152859c`](https://github.com/rizom-ai/brains/commit/152859c1b3c0cd1537d22ba96aa6e337501c750f) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Close semantic Git broker recovery gaps found during affected-runtime acceptance.

  Replacement generations now keep mutation admission closed until repository and durable
  queue/checkpoint state are reconciled. Request IDs are bound to the exact checkout and
  operation arguments, journal failures return correlated terminal errors, and app roles
  proactively reconcile a lost owner without replaying ambiguous mutation intent.

  Development, chat, startup-check, and supervised runtime paths all use a separate broker
  process with complete process-group cleanup. The packaged broker now runs from a lightweight
  entrypoint instead of loading a duplicate full Brain bundle, preserving the established RSS
  envelope while retaining safe replacement and full-runtime fallback behavior.

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.309
  - @brains/contracts@0.2.0-alpha.309
  - @brains/image@0.2.0-alpha.309
  - @brains/utils@0.2.0-alpha.309
  - @brains/plugins@0.2.0-alpha.309

## 0.2.0-alpha.308

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.308
  - @brains/contracts@0.2.0-alpha.308
  - @brains/image@0.2.0-alpha.308
  - @brains/utils@0.2.0-alpha.308
  - @brains/plugins@0.2.0-alpha.308

## 0.2.0-alpha.307

### Patch Changes

- [`947bd44`](https://github.com/rizom-ai/brains/commit/947bd44edf379b9dfa70732dfd0b98c2655dae38) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Hand the Git broker's absolute checkout path to every app role alongside its socket.

  Directory Sync now uses the broker-owned path instead of resolving a relative shell data directory again in another process. This prevents development and supervised runtimes from failing plugin initialization with `This broker owns no checkout` when their process working directories differ.

- Updated dependencies [[`947bd44`](https://github.com/rizom-ai/brains/commit/947bd44edf379b9dfa70732dfd0b98c2655dae38)]:
  - @brains/plugins@0.2.0-alpha.307
  - @brains/content-formatters@0.2.0-alpha.307
  - @brains/contracts@0.2.0-alpha.307
  - @brains/image@0.2.0-alpha.307
  - @brains/utils@0.2.0-alpha.307

## 0.2.0-alpha.306

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.306
  - @brains/contracts@0.2.0-alpha.306
  - @brains/image@0.2.0-alpha.306
  - @brains/utils@0.2.0-alpha.306
  - @brains/plugins@0.2.0-alpha.306

## 0.2.0-alpha.305

### Patch Changes

- Updated dependencies []:
  - @brains/plugins@0.2.0-alpha.305
  - @brains/content-formatters@0.2.0-alpha.305
  - @brains/contracts@0.2.0-alpha.305
  - @brains/image@0.2.0-alpha.305
  - @brains/utils@0.2.0-alpha.305

## 0.2.0-alpha.304

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.304
  - @brains/contracts@0.2.0-alpha.304
  - @brains/image@0.2.0-alpha.304
  - @brains/utils@0.2.0-alpha.304
  - @brains/plugins@0.2.0-alpha.304

## 0.2.0-alpha.303

### Patch Changes

- [`5ff2420`](https://github.com/rizom-ai/brains/commit/5ff2420e2173df8b9add5bfc05a91033ddd1d976) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Own every managed Git operation in a supervised broker process.

  Web and worker no longer execute Git. A broker owns each checkout, serializes
  complete operations rather than individual commands, and is started before any
  Git-capable role — so two processes can no longer interleave inside one commit.
  A lost Git completion fails closed: the operation stays owned and is never
  retried or unlocked in place. The supervisor detects a wedged owner by
  heartbeat silence or stale operation progress, terminates its process group,
  and starts one replacement only after an OS probe proves that group absent;
  when absence cannot be proven it exits the runtime for external cleanup rather
  than risking a second writer.

  Credentials are supplied per process and never persisted: a token configured in
  a remote URL is separated from the address before anything logs, clones,
  fingerprints, or configures `origin`, and inherited credential helpers are
  refused. Managed operations run with repository hooks and automatic maintenance
  disabled.

- Updated dependencies [[`5ff2420`](https://github.com/rizom-ai/brains/commit/5ff2420e2173df8b9add5bfc05a91033ddd1d976)]:
  - @brains/plugins@0.2.0-alpha.303
  - @brains/content-formatters@0.2.0-alpha.303
  - @brains/contracts@0.2.0-alpha.303
  - @brains/image@0.2.0-alpha.303
  - @brains/utils@0.2.0-alpha.303

## 0.2.0-alpha.302

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.302
  - @brains/contracts@0.2.0-alpha.302
  - @brains/image@0.2.0-alpha.302
  - @brains/utils@0.2.0-alpha.302
  - @brains/plugins@0.2.0-alpha.302

## 0.2.0-alpha.301

### Patch Changes

- [`b2fd00c`](https://github.com/rizom-ai/brains/commit/b2fd00c1550e0b9a386484e07a53546106f793ce) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Narrow service dependencies to the members their consumers actually call, so a
  stand-in can be checked against them rather than asserted into place.

  Most of this is additive or loosening: a function that asked for a whole
  `IEntityService`, `IConversationService`, `IJobQueueService`, `PasskeyService`
  or `SimpleGit` now asks for the two or three methods it uses, which accepts
  strictly more than before. Several constructors dropped a lone overload that
  hid a `runtimeOptions` parameter their implementations already accepted, and a
  few internals became module-level exports.

  One change narrows rather than widens: `IRuntimeUploadsNamespace.scoped()`
  returns `ScopedRuntimeUploadStore` — the seven methods the store offers —
  instead of the concrete `RuntimeUploadStore` class. Code calling those methods
  is unaffected; code reaching into the class's private fields is not, which was
  the point.

  `shell/ai-evaluation` also drops an `eval` script that pointed at a directory
  with no eval config and so could never run. The canonical entry point,
  `cd packages/brain-cli && bun run eval`, is unchanged.

- Updated dependencies [[`b2fd00c`](https://github.com/rizom-ai/brains/commit/b2fd00c1550e0b9a386484e07a53546106f793ce)]:
  - @brains/plugins@0.2.0-alpha.301
  - @brains/image@0.2.0-alpha.301
  - @brains/content-formatters@0.2.0-alpha.301
  - @brains/contracts@0.2.0-alpha.301
  - @brains/utils@0.2.0-alpha.301

## 0.2.0-alpha.300

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.300
  - @brains/contracts@0.2.0-alpha.300
  - @brains/image@0.2.0-alpha.300
  - @brains/utils@0.2.0-alpha.300
  - @brains/plugins@0.2.0-alpha.300

## 0.2.0-alpha.299

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.299
  - @brains/contracts@0.2.0-alpha.299
  - @brains/image@0.2.0-alpha.299
  - @brains/utils@0.2.0-alpha.299
  - @brains/plugins@0.2.0-alpha.299

## 0.2.0-alpha.298

### Patch Changes

- Updated dependencies [[`9666d4a`](https://github.com/rizom-ai/brains/commit/9666d4af711d4a65ea2f071e757178f2639c6325)]:
  - @brains/plugins@0.2.0-alpha.298
  - @brains/content-formatters@0.2.0-alpha.298
  - @brains/contracts@0.2.0-alpha.298
  - @brains/image@0.2.0-alpha.298
  - @brains/utils@0.2.0-alpha.298

## 0.2.0-alpha.297

### Patch Changes

- Updated dependencies [[`f6d93c7`](https://github.com/rizom-ai/brains/commit/f6d93c7aa49acccd691b049b090a7fdbbe7b6a1a)]:
  - @brains/contracts@0.2.0-alpha.297
  - @brains/plugins@0.2.0-alpha.297
  - @brains/content-formatters@0.2.0-alpha.297
  - @brains/image@0.2.0-alpha.297
  - @brains/utils@0.2.0-alpha.297

## 0.2.0-alpha.296

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.296
  - @brains/contracts@0.2.0-alpha.296
  - @brains/image@0.2.0-alpha.296
  - @brains/utils@0.2.0-alpha.296
  - @brains/plugins@0.2.0-alpha.296

## 0.2.0-alpha.295

### Patch Changes

- Updated dependencies []:
  - @brains/plugins@0.2.0-alpha.295
  - @brains/image@0.2.0-alpha.295
  - @brains/content-formatters@0.2.0-alpha.295
  - @brains/contracts@0.2.0-alpha.295
  - @brains/utils@0.2.0-alpha.295

## 0.2.0-alpha.294

### Patch Changes

- Updated dependencies [[`995d491`](https://github.com/rizom-ai/brains/commit/995d4910a2d6b10e3524664dd557ce2100d48173)]:
  - @brains/plugins@0.2.0-alpha.294
  - @brains/content-formatters@0.2.0-alpha.294
  - @brains/contracts@0.2.0-alpha.294
  - @brains/image@0.2.0-alpha.294
  - @brains/utils@0.2.0-alpha.294

## 0.2.0-alpha.293

### Patch Changes

- Updated dependencies [[`f25b201`](https://github.com/rizom-ai/brains/commit/f25b2017de7be3a7eb117166ca3458237055137b)]:
  - @brains/plugins@0.2.0-alpha.293
  - @brains/image@0.2.0-alpha.293
  - @brains/content-formatters@0.2.0-alpha.293
  - @brains/contracts@0.2.0-alpha.293
  - @brains/utils@0.2.0-alpha.293

## 0.2.0-alpha.292

### Patch Changes

- Updated dependencies [[`7fc21a2`](https://github.com/rizom-ai/brains/commit/7fc21a277c3e81779c65d9a95809c0d53682406f)]:
  - @brains/plugins@0.2.0-alpha.292
  - @brains/content-formatters@0.2.0-alpha.292
  - @brains/contracts@0.2.0-alpha.292
  - @brains/image@0.2.0-alpha.292
  - @brains/utils@0.2.0-alpha.292

## 0.2.0-alpha.291

### Patch Changes

- Updated dependencies [[`3ed9cfe`](https://github.com/rizom-ai/brains/commit/3ed9cfe0636ee55dac9bf74506d743a6a84eb6f8)]:
  - @brains/plugins@0.2.0-alpha.291
  - @brains/image@0.2.0-alpha.291
  - @brains/content-formatters@0.2.0-alpha.291
  - @brains/contracts@0.2.0-alpha.291
  - @brains/utils@0.2.0-alpha.291

## 0.2.0-alpha.290

### Patch Changes

- Updated dependencies []:
  - @brains/plugins@0.2.0-alpha.290
  - @brains/image@0.2.0-alpha.290
  - @brains/content-formatters@0.2.0-alpha.290
  - @brains/contracts@0.2.0-alpha.290
  - @brains/utils@0.2.0-alpha.290

## 0.2.0-alpha.289

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.289
  - @brains/contracts@0.2.0-alpha.289
  - @brains/image@0.2.0-alpha.289
  - @brains/utils@0.2.0-alpha.289
  - @brains/plugins@0.2.0-alpha.289

## 0.2.0-alpha.288

### Patch Changes

- Updated dependencies [[`b06bc78`](https://github.com/rizom-ai/brains/commit/b06bc78514aa163b3a86c5c6d62d4500aa7c7e3b)]:
  - @brains/plugins@0.2.0-alpha.288
  - @brains/content-formatters@0.2.0-alpha.288
  - @brains/contracts@0.2.0-alpha.288
  - @brains/image@0.2.0-alpha.288
  - @brains/utils@0.2.0-alpha.288

## 0.2.0-alpha.287

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.287
  - @brains/contracts@0.2.0-alpha.287
  - @brains/image@0.2.0-alpha.287
  - @brains/utils@0.2.0-alpha.287
  - @brains/plugins@0.2.0-alpha.287

## 0.2.0-alpha.286

### Patch Changes

- Updated dependencies [[`b7cda6c`](https://github.com/rizom-ai/brains/commit/b7cda6cd64c1a7400b16bf4faacb36d0244c58f9)]:
  - @brains/plugins@0.2.0-alpha.286
  - @brains/content-formatters@0.2.0-alpha.286
  - @brains/contracts@0.2.0-alpha.286
  - @brains/image@0.2.0-alpha.286
  - @brains/utils@0.2.0-alpha.286

## 0.2.0-alpha.285

### Patch Changes

- Updated dependencies [[`c41168e`](https://github.com/rizom-ai/brains/commit/c41168ea6058686541e3bd3abde1699d86687eb0)]:
  - @brains/plugins@0.2.0-alpha.285
  - @brains/content-formatters@0.2.0-alpha.285
  - @brains/contracts@0.2.0-alpha.285
  - @brains/image@0.2.0-alpha.285
  - @brains/utils@0.2.0-alpha.285

## 0.2.0-alpha.284

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.284
  - @brains/contracts@0.2.0-alpha.284
  - @brains/image@0.2.0-alpha.284
  - @brains/utils@0.2.0-alpha.284
  - @brains/plugins@0.2.0-alpha.284

## 0.2.0-alpha.283

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.283
  - @brains/contracts@0.2.0-alpha.283
  - @brains/image@0.2.0-alpha.283
  - @brains/utils@0.2.0-alpha.283
  - @brains/plugins@0.2.0-alpha.283

## 0.2.0-alpha.282

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.282
  - @brains/contracts@0.2.0-alpha.282
  - @brains/image@0.2.0-alpha.282
  - @brains/utils@0.2.0-alpha.282
  - @brains/plugins@0.2.0-alpha.282

## 0.2.0-alpha.281

### Patch Changes

- Updated dependencies [[`c6b44ae`](https://github.com/rizom-ai/brains/commit/c6b44ae420bc0c4c92c2081bfbc320c00987db79)]:
  - @brains/plugins@0.2.0-alpha.281
  - @brains/image@0.2.0-alpha.281
  - @brains/content-formatters@0.2.0-alpha.281
  - @brains/contracts@0.2.0-alpha.281
  - @brains/utils@0.2.0-alpha.281

## 0.2.0-alpha.280

### Patch Changes

- Updated dependencies []:
  - @brains/plugins@0.2.0-alpha.280
  - @brains/content-formatters@0.2.0-alpha.280
  - @brains/contracts@0.2.0-alpha.280
  - @brains/image@0.2.0-alpha.280
  - @brains/utils@0.2.0-alpha.280

## 0.2.0-alpha.279

### Patch Changes

- [#111](https://github.com/rizom-ai/brains/pull/111) [`bd1eb47`](https://github.com/rizom-ai/brains/commit/bd1eb4768ee154570f5ba144f59a145c7f00aa51) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Harden provider boundaries and the entity round-trip against failures visible
  with live transports. Entity adapters strip the system-injected `visibility`
  frontmatter key before domain validation, so strict adapters accept their own
  exported files on re-import, and both directory-sync deletion paths treat a
  quarantined (`.invalid`) file as ours, not a user deletion — together these
  stop restricted entities from being quarantined and then destroyed moments
  after creation. Optional email transport settings and the notifications
  default recipient treat empty env interpolations as absent so inbound-only
  postures boot as documented. The email-triage classifier sends a flat wire
  schema (OpenAI strict structured outputs reject root-level unions) and maps it
  onto the unchanged domain decision union.
- Updated dependencies [[`bd1eb47`](https://github.com/rizom-ai/brains/commit/bd1eb4768ee154570f5ba144f59a145c7f00aa51), [`d0211d9`](https://github.com/rizom-ai/brains/commit/d0211d97253360ead7cfdeb957650e7ff8369afc)]:
  - @brains/contracts@0.2.0-alpha.279
  - @brains/plugins@0.2.0-alpha.279
  - @brains/image@0.2.0-alpha.279
  - @brains/content-formatters@0.2.0-alpha.279
  - @brains/utils@0.2.0-alpha.279

## 0.2.0-alpha.278

### Patch Changes

- Updated dependencies [[`f2d2775`](https://github.com/rizom-ai/brains/commit/f2d2775d61177d5af16e3a839aed6d18de10a511)]:
  - @brains/plugins@0.2.0-alpha.278
  - @brains/content-formatters@0.2.0-alpha.278
  - @brains/contracts@0.2.0-alpha.278
  - @brains/image@0.2.0-alpha.278
  - @brains/utils@0.2.0-alpha.278

## 0.2.0-alpha.277

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.277
  - @brains/contracts@0.2.0-alpha.277
  - @brains/image@0.2.0-alpha.277
  - @brains/utils@0.2.0-alpha.277
  - @brains/plugins@0.2.0-alpha.277

## 0.2.0-alpha.276

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.276
  - @brains/contracts@0.2.0-alpha.276
  - @brains/image@0.2.0-alpha.276
  - @brains/utils@0.2.0-alpha.276
  - @brains/plugins@0.2.0-alpha.276

## 0.2.0-alpha.275

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.275
  - @brains/contracts@0.2.0-alpha.275
  - @brains/image@0.2.0-alpha.275
  - @brains/utils@0.2.0-alpha.275
  - @brains/plugins@0.2.0-alpha.275

## 0.2.0-alpha.274

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.274
  - @brains/contracts@0.2.0-alpha.274
  - @brains/image@0.2.0-alpha.274
  - @brains/utils@0.2.0-alpha.274
  - @brains/plugins@0.2.0-alpha.274

## 0.2.0-alpha.273

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.273
  - @brains/contracts@0.2.0-alpha.273
  - @brains/image@0.2.0-alpha.273
  - @brains/utils@0.2.0-alpha.273
  - @brains/plugins@0.2.0-alpha.273

## 0.2.0-alpha.272

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.272
  - @brains/contracts@0.2.0-alpha.272
  - @brains/image@0.2.0-alpha.272
  - @brains/utils@0.2.0-alpha.272
  - @brains/plugins@0.2.0-alpha.272

## 0.2.0-alpha.271

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.271
  - @brains/contracts@0.2.0-alpha.271
  - @brains/image@0.2.0-alpha.271
  - @brains/utils@0.2.0-alpha.271
  - @brains/plugins@0.2.0-alpha.271

## 0.2.0-alpha.270

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.270
  - @brains/contracts@0.2.0-alpha.270
  - @brains/image@0.2.0-alpha.270
  - @brains/utils@0.2.0-alpha.270
  - @brains/plugins@0.2.0-alpha.270

## 0.2.0-alpha.269

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.269
  - @brains/contracts@0.2.0-alpha.269
  - @brains/image@0.2.0-alpha.269
  - @brains/utils@0.2.0-alpha.269
  - @brains/plugins@0.2.0-alpha.269

## 0.2.0-alpha.268

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.268
  - @brains/contracts@0.2.0-alpha.268
  - @brains/image@0.2.0-alpha.268
  - @brains/utils@0.2.0-alpha.268
  - @brains/plugins@0.2.0-alpha.268

## 0.2.0-alpha.267

### Patch Changes

- Updated dependencies []:
  - @brains/plugins@0.2.0-alpha.267
  - @brains/image@0.2.0-alpha.267
  - @brains/content-formatters@0.2.0-alpha.267
  - @brains/contracts@0.2.0-alpha.267
  - @brains/utils@0.2.0-alpha.267

## 0.2.0-alpha.266

### Patch Changes

- [`e70ab12`](https://github.com/rizom-ai/brains/commit/e70ab12745c6cf757f685389f4cd6de8991de95f) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Behavior-preserving quality refactors: shared SerialQueue/KeyedSerialQueue primitive in @brains/utils replacing five hand-rolled promise-tail mutexes; directory-sync stress system split into command runner, git checkout, and health monitor modules; job-queue worker heartbeat/deadline/error-callback dedup and table-generic schema column helpers; consolidated pilot starter staleness detection; single-pass HTTP route registry views; projection wave planning simplification with indexed graph edges.

- Updated dependencies [[`e70ab12`](https://github.com/rizom-ai/brains/commit/e70ab12745c6cf757f685389f4cd6de8991de95f)]:
  - @brains/utils@0.2.0-alpha.266
  - @brains/content-formatters@0.2.0-alpha.266
  - @brains/contracts@0.2.0-alpha.266
  - @brains/image@0.2.0-alpha.266
  - @brains/plugins@0.2.0-alpha.266

## 0.2.0-alpha.265

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.265
  - @brains/contracts@0.2.0-alpha.265
  - @brains/image@0.2.0-alpha.265
  - @brains/utils@0.2.0-alpha.265
  - @brains/plugins@0.2.0-alpha.265

## 0.2.0-alpha.264

### Patch Changes

- Updated dependencies []:
  - @brains/plugins@0.2.0-alpha.264
  - @brains/image@0.2.0-alpha.264
  - @brains/content-formatters@0.2.0-alpha.264
  - @brains/contracts@0.2.0-alpha.264
  - @brains/utils@0.2.0-alpha.264

## 0.2.0-alpha.263

### Patch Changes

- Updated dependencies []:
  - @brains/plugins@0.2.0-alpha.263
  - @brains/image@0.2.0-alpha.263
  - @brains/content-formatters@0.2.0-alpha.263
  - @brains/contracts@0.2.0-alpha.263
  - @brains/utils@0.2.0-alpha.263

## 0.2.0-alpha.262

### Patch Changes

- Updated dependencies []:
  - @brains/plugins@0.2.0-alpha.262
  - @brains/image@0.2.0-alpha.262
  - @brains/content-formatters@0.2.0-alpha.262
  - @brains/contracts@0.2.0-alpha.262
  - @brains/utils@0.2.0-alpha.262

## 0.2.0-alpha.261

### Patch Changes

- Updated dependencies []:
  - @brains/plugins@0.2.0-alpha.261
  - @brains/image@0.2.0-alpha.261
  - @brains/content-formatters@0.2.0-alpha.261
  - @brains/contracts@0.2.0-alpha.261
  - @brains/utils@0.2.0-alpha.261

## 0.2.0-alpha.260

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.260
  - @brains/contracts@0.2.0-alpha.260
  - @brains/image@0.2.0-alpha.260
  - @brains/utils@0.2.0-alpha.260
  - @brains/plugins@0.2.0-alpha.260

## 0.2.0-alpha.259

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.259
  - @brains/contracts@0.2.0-alpha.259
  - @brains/image@0.2.0-alpha.259
  - @brains/utils@0.2.0-alpha.259
  - @brains/plugins@0.2.0-alpha.259

## 0.2.0-alpha.258

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.258
  - @brains/contracts@0.2.0-alpha.258
  - @brains/image@0.2.0-alpha.258
  - @brains/utils@0.2.0-alpha.258
  - @brains/plugins@0.2.0-alpha.258

## 0.2.0-alpha.257

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.257
  - @brains/contracts@0.2.0-alpha.257
  - @brains/image@0.2.0-alpha.257
  - @brains/utils@0.2.0-alpha.257
  - @brains/plugins@0.2.0-alpha.257

## 0.2.0-alpha.256

### Patch Changes

- [#84](https://github.com/rizom-ai/brains/pull/84) [`b155d93`](https://github.com/rizom-ai/brains/commit/b155d938c240bcc9500c2395f11763ab49a017c9) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Split the bundled runtime into supervised web and durable execution children, with immutable handler inventory, execution-only plugin registration, web-owned enqueue validation, and budgeted worker restart isolation.

- Updated dependencies [[`b155d93`](https://github.com/rizom-ai/brains/commit/b155d938c240bcc9500c2395f11763ab49a017c9), [`1e45eca`](https://github.com/rizom-ai/brains/commit/1e45ecaaed5351964cbf8a0754a301507b15c298), [`b155d93`](https://github.com/rizom-ai/brains/commit/b155d938c240bcc9500c2395f11763ab49a017c9), [`b155d93`](https://github.com/rizom-ai/brains/commit/b155d938c240bcc9500c2395f11763ab49a017c9)]:
  - @brains/plugins@0.2.0-alpha.256
  - @brains/utils@0.2.0-alpha.256
  - @brains/content-formatters@0.2.0-alpha.256
  - @brains/contracts@0.2.0-alpha.256
  - @brains/image@0.2.0-alpha.256

## 0.2.0-alpha.255

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.255
  - @brains/contracts@0.2.0-alpha.255
  - @brains/image@0.2.0-alpha.255
  - @brains/utils@0.2.0-alpha.255
  - @brains/plugins@0.2.0-alpha.255

## 0.2.0-alpha.254

### Patch Changes

- Updated dependencies []:
  - @brains/image@0.2.0-alpha.254
  - @brains/plugins@0.2.0-alpha.254
  - @brains/content-formatters@0.2.0-alpha.254
  - @brains/contracts@0.2.0-alpha.254
  - @brains/utils@0.2.0-alpha.254

## 0.2.0-alpha.253

### Patch Changes

- [`2cf73cb`](https://github.com/rizom-ai/brains/commit/2cf73cbde78b481857e9093b711126565f227e39) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Reduce Git sync load by importing only pulled paths, avoiding cleanup for non-deletion pulls, suppressing duplicate watcher echoes, batching watcher changes, and skipping no-op Git commit/push cycles.

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.253
  - @brains/contracts@0.2.0-alpha.253
  - @brains/image@0.2.0-alpha.253
  - @brains/utils@0.2.0-alpha.253
  - @brains/plugins@0.2.0-alpha.253

## 0.2.0-alpha.252

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.252
  - @brains/contracts@0.2.0-alpha.252
  - @brains/image@0.2.0-alpha.252
  - @brains/utils@0.2.0-alpha.252
  - @brains/plugins@0.2.0-alpha.252

## 0.2.0-alpha.251

### Patch Changes

- Updated dependencies [[`ca41276`](https://github.com/rizom-ai/brains/commit/ca412762e73ca8391d8a77a6c08b20c63b30848e)]:
  - @brains/plugins@0.2.0-alpha.251
  - @brains/content-formatters@0.2.0-alpha.251
  - @brains/contracts@0.2.0-alpha.251
  - @brains/image@0.2.0-alpha.251
  - @brains/utils@0.2.0-alpha.251

## 0.2.0-alpha.250

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.250
  - @brains/contracts@0.2.0-alpha.250
  - @brains/image@0.2.0-alpha.250
  - @brains/utils@0.2.0-alpha.250
  - @brains/plugins@0.2.0-alpha.250

## 0.2.0-alpha.249

### Patch Changes

- Updated dependencies [[`84dca8c`](https://github.com/rizom-ai/brains/commit/84dca8c9ddf83fcf01784f54da479e2229eba09c)]:
  - @brains/contracts@0.2.0-alpha.249
  - @brains/plugins@0.2.0-alpha.249
  - @brains/content-formatters@0.2.0-alpha.249
  - @brains/image@0.2.0-alpha.249
  - @brains/utils@0.2.0-alpha.249

## 0.2.0-alpha.248

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.248
  - @brains/contracts@0.2.0-alpha.248
  - @brains/image@0.2.0-alpha.248
  - @brains/utils@0.2.0-alpha.248
  - @brains/plugins@0.2.0-alpha.248

## 0.2.0-alpha.247

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.247
  - @brains/contracts@0.2.0-alpha.247
  - @brains/image@0.2.0-alpha.247
  - @brains/utils@0.2.0-alpha.247
  - @brains/plugins@0.2.0-alpha.247

## 0.2.0-alpha.246

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.246
  - @brains/contracts@0.2.0-alpha.246
  - @brains/image@0.2.0-alpha.246
  - @brains/utils@0.2.0-alpha.246
  - @brains/plugins@0.2.0-alpha.246

## 0.2.0-alpha.245

### Patch Changes

- Updated dependencies [[`e2fa886`](https://github.com/rizom-ai/brains/commit/e2fa886134594d834582c5b55704e893fcb0988a)]:
  - @brains/contracts@0.2.0-alpha.245
  - @brains/content-formatters@0.2.0-alpha.245
  - @brains/plugins@0.2.0-alpha.245
  - @brains/image@0.2.0-alpha.245
  - @brains/utils@0.2.0-alpha.245

## 0.2.0-alpha.244

### Patch Changes

- Updated dependencies []:
  - @brains/plugins@0.2.0-alpha.244
  - @brains/image@0.2.0-alpha.244
  - @brains/content-formatters@0.2.0-alpha.244
  - @brains/contracts@0.2.0-alpha.244
  - @brains/utils@0.2.0-alpha.244

## 0.2.0-alpha.243

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.243
  - @brains/contracts@0.2.0-alpha.243
  - @brains/image@0.2.0-alpha.243
  - @brains/utils@0.2.0-alpha.243
  - @brains/plugins@0.2.0-alpha.243

## 0.2.0-alpha.242

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.242
  - @brains/contracts@0.2.0-alpha.242
  - @brains/image@0.2.0-alpha.242
  - @brains/utils@0.2.0-alpha.242
  - @brains/plugins@0.2.0-alpha.242

## 0.2.0-alpha.241

### Patch Changes

- Updated dependencies [[`7f5c45f`](https://github.com/rizom-ai/brains/commit/7f5c45f4cac4556fdd2abcb939b48f1a76adbe62), [`7f5c45f`](https://github.com/rizom-ai/brains/commit/7f5c45f4cac4556fdd2abcb939b48f1a76adbe62)]:
  - @brains/contracts@0.2.0-alpha.241
  - @brains/plugins@0.2.0-alpha.241
  - @brains/content-formatters@0.2.0-alpha.241
  - @brains/image@0.2.0-alpha.241
  - @brains/utils@0.2.0-alpha.241

## 0.2.0-alpha.240

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.240
  - @brains/contracts@0.2.0-alpha.240
  - @brains/image@0.2.0-alpha.240
  - @brains/utils@0.2.0-alpha.240
  - @brains/plugins@0.2.0-alpha.240

## 0.2.0-alpha.239

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.239
  - @brains/contracts@0.2.0-alpha.239
  - @brains/image@0.2.0-alpha.239
  - @brains/utils@0.2.0-alpha.239
  - @brains/plugins@0.2.0-alpha.239

## 0.2.0-alpha.238

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.238
  - @brains/contracts@0.2.0-alpha.238
  - @brains/image@0.2.0-alpha.238
  - @brains/utils@0.2.0-alpha.238
  - @brains/plugins@0.2.0-alpha.238

## 0.2.0-alpha.237

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.237
  - @brains/contracts@0.2.0-alpha.237
  - @brains/image@0.2.0-alpha.237
  - @brains/utils@0.2.0-alpha.237
  - @brains/plugins@0.2.0-alpha.237

## 0.2.0-alpha.236

### Patch Changes

- Updated dependencies [[`a6ca836`](https://github.com/rizom-ai/brains/commit/a6ca836f4cd5abef038584de13944765d7b4843a), [`9655faf`](https://github.com/rizom-ai/brains/commit/9655faf210917e322ce2bdce0a95adaabd816a8d)]:
  - @brains/plugins@0.2.0-alpha.236
  - @brains/content-formatters@0.2.0-alpha.236
  - @brains/contracts@0.2.0-alpha.236
  - @brains/image@0.2.0-alpha.236
  - @brains/utils@0.2.0-alpha.236

## 0.2.0-alpha.235

### Patch Changes

- Updated dependencies [[`31e732a`](https://github.com/rizom-ai/brains/commit/31e732a79a394a4e385ce7b25015c3daa8bf0afd)]:
  - @brains/contracts@0.2.0-alpha.235
  - @brains/content-formatters@0.2.0-alpha.235
  - @brains/plugins@0.2.0-alpha.235
  - @brains/image@0.2.0-alpha.235
  - @brains/utils@0.2.0-alpha.235

## 0.2.0-alpha.234

### Patch Changes

- [#72](https://github.com/rizom-ai/brains/pull/72) [`afa5cf4`](https://github.com/rizom-ai/brains/commit/afa5cf4cbdf75400b180d4bb89ed46dd4e6097cc) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Allow active Trusted principals to use the first-party CMS with principal-scoped reads, server-derived capabilities, policy-enforced writes, uploads, assists, and workspaces, authenticated actor attribution, and visibility-safe publication views while preserving Admin-only operational boundaries.

- Updated dependencies [[`afa5cf4`](https://github.com/rizom-ai/brains/commit/afa5cf4cbdf75400b180d4bb89ed46dd4e6097cc)]:
  - @brains/plugins@0.2.0-alpha.234
  - @brains/image@0.2.0-alpha.234
  - @brains/content-formatters@0.2.0-alpha.234
  - @brains/contracts@0.2.0-alpha.234
  - @brains/utils@0.2.0-alpha.234

## 0.2.0-alpha.233

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.233
  - @brains/contracts@0.2.0-alpha.233
  - @brains/image@0.2.0-alpha.233
  - @brains/utils@0.2.0-alpha.233
  - @brains/plugins@0.2.0-alpha.233

## 0.2.0-alpha.232

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.232
  - @brains/contracts@0.2.0-alpha.232
  - @brains/image@0.2.0-alpha.232
  - @brains/utils@0.2.0-alpha.232
  - @brains/plugins@0.2.0-alpha.232

## 0.2.0-alpha.231

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.231
  - @brains/contracts@0.2.0-alpha.231
  - @brains/image@0.2.0-alpha.231
  - @brains/utils@0.2.0-alpha.231
  - @brains/plugins@0.2.0-alpha.231

## 0.2.0-alpha.230

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.230
  - @brains/contracts@0.2.0-alpha.230
  - @brains/image@0.2.0-alpha.230
  - @brains/utils@0.2.0-alpha.230
  - @brains/plugins@0.2.0-alpha.230

## 0.2.0-alpha.229

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.229
  - @brains/contracts@0.2.0-alpha.229
  - @brains/image@0.2.0-alpha.229
  - @brains/utils@0.2.0-alpha.229
  - @brains/plugins@0.2.0-alpha.229

## 0.2.0-alpha.228

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.228
  - @brains/contracts@0.2.0-alpha.228
  - @brains/image@0.2.0-alpha.228
  - @brains/utils@0.2.0-alpha.228
  - @brains/plugins@0.2.0-alpha.228

## 0.2.0-alpha.227

### Patch Changes

- Updated dependencies [[`500a6dc`](https://github.com/rizom-ai/brains/commit/500a6dc284a590e1e9bb6af9fa0995332eeb8c58), [`f7b3500`](https://github.com/rizom-ai/brains/commit/f7b350042c5bbcd6c5a43016d25e95e35ea3bfed), [`fa8e4eb`](https://github.com/rizom-ai/brains/commit/fa8e4eb3a237aaec54eeeb815f68e792d3a1715b), [`5c1bed1`](https://github.com/rizom-ai/brains/commit/5c1bed1134f92701f4ead9b25a6f432cd208ac29), [`20ac901`](https://github.com/rizom-ai/brains/commit/20ac901e319ef62b38bb291de8d026b9d8ae51d7)]:
  - @brains/contracts@0.2.0-alpha.227
  - @brains/plugins@0.2.0-alpha.227
  - @brains/utils@0.2.0-alpha.227
  - @brains/content-formatters@0.2.0-alpha.227
  - @brains/image@0.2.0-alpha.227

## 0.2.0-alpha.226

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.226
  - @brains/contracts@0.2.0-alpha.226
  - @brains/image@0.2.0-alpha.226
  - @brains/utils@0.2.0-alpha.226
  - @brains/plugins@0.2.0-alpha.226

## 0.2.0-alpha.225

### Patch Changes

- Updated dependencies [[`b0001fb`](https://github.com/rizom-ai/brains/commit/b0001fb102c030855586d92c4abef67004ae7987)]:
  - @brains/plugins@0.2.0-alpha.225
  - @brains/image@0.2.0-alpha.225
  - @brains/content-formatters@0.2.0-alpha.225
  - @brains/contracts@0.2.0-alpha.225
  - @brains/utils@0.2.0-alpha.225

## 0.2.0-alpha.224

### Patch Changes

- Updated dependencies [[`b7c5df6`](https://github.com/rizom-ai/brains/commit/b7c5df61ebe0aa44f6b786695f16daa7ee151e61)]:
  - @brains/utils@0.2.0-alpha.224
  - @brains/content-formatters@0.2.0-alpha.224
  - @brains/contracts@0.2.0-alpha.224
  - @brains/image@0.2.0-alpha.224
  - @brains/plugins@0.2.0-alpha.224

## 0.2.0-alpha.223

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.223
  - @brains/contracts@0.2.0-alpha.223
  - @brains/image@0.2.0-alpha.223
  - @brains/utils@0.2.0-alpha.223
  - @brains/plugins@0.2.0-alpha.223

## 0.2.0-alpha.222

### Patch Changes

- Updated dependencies [[`4943d79`](https://github.com/rizom-ai/brains/commit/4943d79ecf4abefd4cf79a38a526e203ea32064a)]:
  - @brains/contracts@0.2.0-alpha.222
  - @brains/plugins@0.2.0-alpha.222
  - @brains/content-formatters@0.2.0-alpha.222
  - @brains/image@0.2.0-alpha.222
  - @brains/utils@0.2.0-alpha.222

## 0.2.0-alpha.221

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.221
  - @brains/contracts@0.2.0-alpha.221
  - @brains/image@0.2.0-alpha.221
  - @brains/utils@0.2.0-alpha.221
  - @brains/plugins@0.2.0-alpha.221

## 0.2.0-alpha.220

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.220
  - @brains/contracts@0.2.0-alpha.220
  - @brains/image@0.2.0-alpha.220
  - @brains/utils@0.2.0-alpha.220
  - @brains/plugins@0.2.0-alpha.220

## 0.2.0-alpha.219

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.219
  - @brains/contracts@0.2.0-alpha.219
  - @brains/image@0.2.0-alpha.219
  - @brains/utils@0.2.0-alpha.219
  - @brains/plugins@0.2.0-alpha.219

## 0.2.0-alpha.218

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.218
  - @brains/contracts@0.2.0-alpha.218
  - @brains/image@0.2.0-alpha.218
  - @brains/utils@0.2.0-alpha.218
  - @brains/plugins@0.2.0-alpha.218

## 0.2.0-alpha.217

### Patch Changes

- Updated dependencies [[`b737ed9`](https://github.com/rizom-ai/brains/commit/b737ed9b37f0cd38b0e5387e2fb3795ca5eeec04)]:
  - @brains/plugins@0.2.0-alpha.217
  - @brains/content-formatters@0.2.0-alpha.217
  - @brains/contracts@0.2.0-alpha.217
  - @brains/image@0.2.0-alpha.217
  - @brains/utils@0.2.0-alpha.217

## 0.2.0-alpha.216

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.216
  - @brains/contracts@0.2.0-alpha.216
  - @brains/image@0.2.0-alpha.216
  - @brains/utils@0.2.0-alpha.216
  - @brains/plugins@0.2.0-alpha.216

## 0.2.0-alpha.215

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.215
  - @brains/contracts@0.2.0-alpha.215
  - @brains/image@0.2.0-alpha.215
  - @brains/utils@0.2.0-alpha.215
  - @brains/plugins@0.2.0-alpha.215

## 0.2.0-alpha.214

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.214
  - @brains/contracts@0.2.0-alpha.214
  - @brains/image@0.2.0-alpha.214
  - @brains/utils@0.2.0-alpha.214
  - @brains/plugins@0.2.0-alpha.214

## 0.2.0-alpha.213

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.213
  - @brains/contracts@0.2.0-alpha.213
  - @brains/image@0.2.0-alpha.213
  - @brains/utils@0.2.0-alpha.213
  - @brains/plugins@0.2.0-alpha.213

## 0.2.0-alpha.212

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.212
  - @brains/contracts@0.2.0-alpha.212
  - @brains/image@0.2.0-alpha.212
  - @brains/utils@0.2.0-alpha.212
  - @brains/plugins@0.2.0-alpha.212

## 0.2.0-alpha.211

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.211
  - @brains/contracts@0.2.0-alpha.211
  - @brains/image@0.2.0-alpha.211
  - @brains/utils@0.2.0-alpha.211
  - @brains/plugins@0.2.0-alpha.211

## 0.2.0-alpha.210

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.210
  - @brains/contracts@0.2.0-alpha.210
  - @brains/image@0.2.0-alpha.210
  - @brains/utils@0.2.0-alpha.210
  - @brains/plugins@0.2.0-alpha.210

## 0.2.0-alpha.209

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.209
  - @brains/contracts@0.2.0-alpha.209
  - @brains/image@0.2.0-alpha.209
  - @brains/utils@0.2.0-alpha.209
  - @brains/plugins@0.2.0-alpha.209

## 0.2.0-alpha.208

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.208
  - @brains/contracts@0.2.0-alpha.208
  - @brains/image@0.2.0-alpha.208
  - @brains/utils@0.2.0-alpha.208
  - @brains/plugins@0.2.0-alpha.208

## 0.2.0-alpha.207

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.207
  - @brains/contracts@0.2.0-alpha.207
  - @brains/image@0.2.0-alpha.207
  - @brains/utils@0.2.0-alpha.207
  - @brains/plugins@0.2.0-alpha.207

## 0.2.0-alpha.206

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.206
  - @brains/contracts@0.2.0-alpha.206
  - @brains/image@0.2.0-alpha.206
  - @brains/utils@0.2.0-alpha.206
  - @brains/plugins@0.2.0-alpha.206

## 0.2.0-alpha.205

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.205
  - @brains/contracts@0.2.0-alpha.205
  - @brains/image@0.2.0-alpha.205
  - @brains/utils@0.2.0-alpha.205
  - @brains/plugins@0.2.0-alpha.205

## 0.2.0-alpha.204

### Patch Changes

- Updated dependencies [[`998a786`](https://github.com/rizom-ai/brains/commit/998a78694a06c7796fefcca09e258cc90eb62ce9)]:
  - @brains/plugins@0.2.0-alpha.204
  - @brains/content-formatters@0.2.0-alpha.204
  - @brains/contracts@0.2.0-alpha.204
  - @brains/image@0.2.0-alpha.204
  - @brains/utils@0.2.0-alpha.204

## 0.2.0-alpha.203

### Patch Changes

- Updated dependencies []:
  - @brains/plugins@0.2.0-alpha.203
  - @brains/content-formatters@0.2.0-alpha.203
  - @brains/contracts@0.2.0-alpha.203
  - @brains/image@0.2.0-alpha.203
  - @brains/utils@0.2.0-alpha.203

## 0.2.0-alpha.202

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.202
  - @brains/contracts@0.2.0-alpha.202
  - @brains/image@0.2.0-alpha.202
  - @brains/utils@0.2.0-alpha.202
  - @brains/plugins@0.2.0-alpha.202

## 0.2.0-alpha.201

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.201
  - @brains/contracts@0.2.0-alpha.201
  - @brains/image@0.2.0-alpha.201
  - @brains/utils@0.2.0-alpha.201
  - @brains/plugins@0.2.0-alpha.201

## 0.2.0-alpha.200

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.200
  - @brains/contracts@0.2.0-alpha.200
  - @brains/image@0.2.0-alpha.200
  - @brains/utils@0.2.0-alpha.200
  - @brains/plugins@0.2.0-alpha.200

## 0.2.0-alpha.199

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.199
  - @brains/contracts@0.2.0-alpha.199
  - @brains/image@0.2.0-alpha.199
  - @brains/utils@0.2.0-alpha.199
  - @brains/plugins@0.2.0-alpha.199

## 0.2.0-alpha.198

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.198
  - @brains/contracts@0.2.0-alpha.198
  - @brains/image@0.2.0-alpha.198
  - @brains/utils@0.2.0-alpha.198
  - @brains/plugins@0.2.0-alpha.198

## 0.2.0-alpha.197

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.197
  - @brains/contracts@0.2.0-alpha.197
  - @brains/image@0.2.0-alpha.197
  - @brains/utils@0.2.0-alpha.197
  - @brains/plugins@0.2.0-alpha.197

## 0.2.0-alpha.196

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.196
  - @brains/contracts@0.2.0-alpha.196
  - @brains/image@0.2.0-alpha.196
  - @brains/utils@0.2.0-alpha.196
  - @brains/plugins@0.2.0-alpha.196

## 0.2.0-alpha.195

### Patch Changes

- Updated dependencies [[`1ece871`](https://github.com/rizom-ai/brains/commit/1ece871c78c950ff91033cb62e34fe89987cfd2c)]:
  - @brains/plugins@0.2.0-alpha.195
  - @brains/image@0.2.0-alpha.195
  - @brains/content-formatters@0.2.0-alpha.195
  - @brains/contracts@0.2.0-alpha.195
  - @brains/utils@0.2.0-alpha.195

## 0.2.0-alpha.194

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.194
  - @brains/contracts@0.2.0-alpha.194
  - @brains/image@0.2.0-alpha.194
  - @brains/utils@0.2.0-alpha.194
  - @brains/plugins@0.2.0-alpha.194

## 0.2.0-alpha.193

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.193
  - @brains/contracts@0.2.0-alpha.193
  - @brains/image@0.2.0-alpha.193
  - @brains/utils@0.2.0-alpha.193
  - @brains/plugins@0.2.0-alpha.193

## 0.2.0-alpha.192

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.192
  - @brains/contracts@0.2.0-alpha.192
  - @brains/image@0.2.0-alpha.192
  - @brains/utils@0.2.0-alpha.192
  - @brains/plugins@0.2.0-alpha.192

## 0.2.0-alpha.191

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.191
  - @brains/contracts@0.2.0-alpha.191
  - @brains/image@0.2.0-alpha.191
  - @brains/utils@0.2.0-alpha.191
  - @brains/plugins@0.2.0-alpha.191

## 0.2.0-alpha.190

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.190
  - @brains/contracts@0.2.0-alpha.190
  - @brains/image@0.2.0-alpha.190
  - @brains/utils@0.2.0-alpha.190
  - @brains/plugins@0.2.0-alpha.190

## 0.2.0-alpha.189

### Patch Changes

- [`5294aec`](https://github.com/rizom-ai/brains/commit/5294aec7eab3b98ddfa68fc3aadc4b966355740e) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Add an optional CMS Sync workspace backed by a sanitized directory-sync operational snapshot. Operators can inspect watcher, file, Git, recent-run, and quarantine state and request the existing normal sync flow from CMS, while Dashboard remains read-only and links to the workspace when available.

- [`75cb1cc`](https://github.com/rizom-ai/brains/commit/75cb1cc81e3524d924e4c3696b33b3a26b0c6664) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Own watcher, debounce, periodic Git, auto-commit, and import-job polling lifecycle with private Effect scopes and schedules. Start background work from plugin ready, abort periodic Git network operations, await Chokidar callbacks plus active repository mutations during teardown, and atomically reconfigure directory/Git generations behind stable tools, handlers, and subscriptions.

- Updated dependencies [[`5294aec`](https://github.com/rizom-ai/brains/commit/5294aec7eab3b98ddfa68fc3aadc4b966355740e)]:
  - @brains/plugins@0.2.0-alpha.189
  - @brains/content-formatters@0.2.0-alpha.189
  - @brains/contracts@0.2.0-alpha.189
  - @brains/image@0.2.0-alpha.189
  - @brains/utils@0.2.0-alpha.189

## 0.2.0-alpha.188

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.188
  - @brains/contracts@0.2.0-alpha.188
  - @brains/image@0.2.0-alpha.188
  - @brains/utils@0.2.0-alpha.188
  - @brains/plugins@0.2.0-alpha.188

## 0.2.0-alpha.187

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.187
  - @brains/contracts@0.2.0-alpha.187
  - @brains/image@0.2.0-alpha.187
  - @brains/utils@0.2.0-alpha.187
  - @brains/plugins@0.2.0-alpha.187

## 0.2.0-alpha.186

### Patch Changes

- Updated dependencies [[`45c57a1`](https://github.com/rizom-ai/brains/commit/45c57a1330e11fb79ea376a82924c9f02e4a84d4), [`143788b`](https://github.com/rizom-ai/brains/commit/143788beb9544649f3d1bac16bcea605c36cd94a)]:
  - @brains/plugins@0.2.0-alpha.186
  - @brains/image@0.2.0-alpha.186
  - @brains/content-formatters@0.2.0-alpha.186
  - @brains/contracts@0.2.0-alpha.186
  - @brains/utils@0.2.0-alpha.186

## 0.2.0-alpha.185

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.185
  - @brains/contracts@0.2.0-alpha.185
  - @brains/image@0.2.0-alpha.185
  - @brains/utils@0.2.0-alpha.185
  - @brains/plugins@0.2.0-alpha.185

## 0.2.0-alpha.184

### Patch Changes

- Updated dependencies []:
  - @brains/plugins@0.2.0-alpha.184
  - @brains/content-formatters@0.2.0-alpha.184
  - @brains/contracts@0.2.0-alpha.184
  - @brains/image@0.2.0-alpha.184
  - @brains/utils@0.2.0-alpha.184

## 0.2.0-alpha.183

### Patch Changes

- Updated dependencies []:
  - @brains/plugins@0.2.0-alpha.183
  - @brains/image@0.2.0-alpha.183
  - @brains/content-formatters@0.2.0-alpha.183
  - @brains/contracts@0.2.0-alpha.183
  - @brains/utils@0.2.0-alpha.183

## 0.2.0-alpha.182

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.182
  - @brains/contracts@0.2.0-alpha.182
  - @brains/image@0.2.0-alpha.182
  - @brains/utils@0.2.0-alpha.182
  - @brains/plugins@0.2.0-alpha.182

## 0.2.0-alpha.181

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.181
  - @brains/contracts@0.2.0-alpha.181
  - @brains/image@0.2.0-alpha.181
  - @brains/utils@0.2.0-alpha.181
  - @brains/plugins@0.2.0-alpha.181

## 0.2.0-alpha.180

### Patch Changes

- Updated dependencies []:
  - @brains/plugins@0.2.0-alpha.180
  - @brains/image@0.2.0-alpha.180
  - @brains/content-formatters@0.2.0-alpha.180
  - @brains/contracts@0.2.0-alpha.180
  - @brains/utils@0.2.0-alpha.180

## 0.2.0-alpha.179

### Patch Changes

- Updated dependencies []:
  - @brains/image@0.2.0-alpha.179
  - @brains/plugins@0.2.0-alpha.179
  - @brains/content-formatters@0.2.0-alpha.179
  - @brains/contracts@0.2.0-alpha.179
  - @brains/utils@0.2.0-alpha.179

## 0.2.0-alpha.178

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.178
  - @brains/contracts@0.2.0-alpha.178
  - @brains/image@0.2.0-alpha.178
  - @brains/utils@0.2.0-alpha.178
  - @brains/plugins@0.2.0-alpha.178

## 0.2.0-alpha.177

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.177
  - @brains/contracts@0.2.0-alpha.177
  - @brains/image@0.2.0-alpha.177
  - @brains/utils@0.2.0-alpha.177
  - @brains/plugins@0.2.0-alpha.177

## 0.2.0-alpha.176

### Patch Changes

- Updated dependencies [[`de494c9`](https://github.com/rizom-ai/brains/commit/de494c964bef7a85e4f6c88f17577d56fc1bc6fb)]:
  - @brains/plugins@0.2.0-alpha.176
  - @brains/content-formatters@0.2.0-alpha.176
  - @brains/contracts@0.2.0-alpha.176
  - @brains/image@0.2.0-alpha.176
  - @brains/utils@0.2.0-alpha.176

## 0.2.0-alpha.175

### Patch Changes

- Updated dependencies []:
  - @brains/plugins@0.2.0-alpha.175
  - @brains/image@0.2.0-alpha.175
  - @brains/content-formatters@0.2.0-alpha.175
  - @brains/contracts@0.2.0-alpha.175
  - @brains/utils@0.2.0-alpha.175

## 0.2.0-alpha.174

### Patch Changes

- Updated dependencies []:
  - @brains/image@0.2.0-alpha.174
  - @brains/plugins@0.2.0-alpha.174
  - @brains/content-formatters@0.2.0-alpha.174
  - @brains/contracts@0.2.0-alpha.174
  - @brains/utils@0.2.0-alpha.174

## 0.2.0-alpha.173

### Patch Changes

- Updated dependencies [[`8427031`](https://github.com/rizom-ai/brains/commit/84270311c343964449d96c4cd60e4066daac4aef)]:
  - @brains/plugins@0.2.0-alpha.173
  - @brains/image@0.2.0-alpha.173
  - @brains/content-formatters@0.2.0-alpha.173
  - @brains/contracts@0.2.0-alpha.173
  - @brains/utils@0.2.0-alpha.173

## 0.2.0-alpha.172

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.172
  - @brains/contracts@0.2.0-alpha.172
  - @brains/image@0.2.0-alpha.172
  - @brains/utils@0.2.0-alpha.172
  - @brains/plugins@0.2.0-alpha.172

## 0.2.0-alpha.171

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.171
  - @brains/contracts@0.2.0-alpha.171
  - @brains/image@0.2.0-alpha.171
  - @brains/utils@0.2.0-alpha.171
  - @brains/plugins@0.2.0-alpha.171

## 0.2.0-alpha.170

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.170
  - @brains/contracts@0.2.0-alpha.170
  - @brains/image@0.2.0-alpha.170
  - @brains/utils@0.2.0-alpha.170
  - @brains/plugins@0.2.0-alpha.170

## 0.2.0-alpha.169

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.169
  - @brains/contracts@0.2.0-alpha.169
  - @brains/image@0.2.0-alpha.169
  - @brains/utils@0.2.0-alpha.169
  - @brains/plugins@0.2.0-alpha.169

## 0.2.0-alpha.168

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.168
  - @brains/contracts@0.2.0-alpha.168
  - @brains/image@0.2.0-alpha.168
  - @brains/utils@0.2.0-alpha.168
  - @brains/plugins@0.2.0-alpha.168

## 0.2.0-alpha.167

### Patch Changes

- Updated dependencies []:
  - @brains/plugins@0.2.0-alpha.167
  - @brains/image@0.2.0-alpha.167
  - @brains/content-formatters@0.2.0-alpha.167
  - @brains/contracts@0.2.0-alpha.167
  - @brains/utils@0.2.0-alpha.167

## 0.2.0-alpha.166

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.166
  - @brains/contracts@0.2.0-alpha.166
  - @brains/image@0.2.0-alpha.166
  - @brains/utils@0.2.0-alpha.166
  - @brains/plugins@0.2.0-alpha.166

## 0.2.0-alpha.165

### Patch Changes

- Updated dependencies []:
  - @brains/plugins@0.2.0-alpha.165
  - @brains/image@0.2.0-alpha.165
  - @brains/content-formatters@0.2.0-alpha.165
  - @brains/contracts@0.2.0-alpha.165
  - @brains/utils@0.2.0-alpha.165

## 0.2.0-alpha.164

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.164
  - @brains/contracts@0.2.0-alpha.164
  - @brains/image@0.2.0-alpha.164
  - @brains/utils@0.2.0-alpha.164
  - @brains/plugins@0.2.0-alpha.164

## 0.2.0-alpha.163

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.163
  - @brains/contracts@0.2.0-alpha.163
  - @brains/image@0.2.0-alpha.163
  - @brains/utils@0.2.0-alpha.163
  - @brains/plugins@0.2.0-alpha.163

## 0.2.0-alpha.162

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.162
  - @brains/contracts@0.2.0-alpha.162
  - @brains/image@0.2.0-alpha.162
  - @brains/utils@0.2.0-alpha.162
  - @brains/plugins@0.2.0-alpha.162

## 0.2.0-alpha.161

### Patch Changes

- Updated dependencies [[`61c6862`](https://github.com/rizom-ai/brains/commit/61c68624c0ae21f9d00d307db02ce5a1439d2765)]:
  - @brains/plugins@0.2.0-alpha.161
  - @brains/image@0.2.0-alpha.161
  - @brains/content-formatters@0.2.0-alpha.161
  - @brains/contracts@0.2.0-alpha.161
  - @brains/utils@0.2.0-alpha.161

## 0.2.0-alpha.160

### Patch Changes

- Updated dependencies []:
  - @brains/plugins@0.2.0-alpha.160
  - @brains/content-formatters@0.2.0-alpha.160
  - @brains/contracts@0.2.0-alpha.160
  - @brains/image@0.2.0-alpha.160
  - @brains/utils@0.2.0-alpha.160

## 0.2.0-alpha.159

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.159
  - @brains/contracts@0.2.0-alpha.159
  - @brains/image@0.2.0-alpha.159
  - @brains/utils@0.2.0-alpha.159
  - @brains/plugins@0.2.0-alpha.159

## 0.2.0-alpha.158

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.158
  - @brains/contracts@0.2.0-alpha.158
  - @brains/image@0.2.0-alpha.158
  - @brains/utils@0.2.0-alpha.158
  - @brains/plugins@0.2.0-alpha.158

## 0.2.0-alpha.157

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.157
  - @brains/contracts@0.2.0-alpha.157
  - @brains/image@0.2.0-alpha.157
  - @brains/utils@0.2.0-alpha.157
  - @brains/plugins@0.2.0-alpha.157

## 0.2.0-alpha.156

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.156
  - @brains/contracts@0.2.0-alpha.156
  - @brains/image@0.2.0-alpha.156
  - @brains/utils@0.2.0-alpha.156
  - @brains/plugins@0.2.0-alpha.156

## 0.2.0-alpha.155

### Patch Changes

- Updated dependencies []:
  - @brains/plugins@0.2.0-alpha.155
  - @brains/image@0.2.0-alpha.155
  - @brains/content-formatters@0.2.0-alpha.155
  - @brains/contracts@0.2.0-alpha.155
  - @brains/utils@0.2.0-alpha.155

## 0.2.0-alpha.154

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.154
  - @brains/contracts@0.2.0-alpha.154
  - @brains/image@0.2.0-alpha.154
  - @brains/utils@0.2.0-alpha.154
  - @brains/plugins@0.2.0-alpha.154

## 0.2.0-alpha.153

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.153
  - @brains/contracts@0.2.0-alpha.153
  - @brains/image@0.2.0-alpha.153
  - @brains/utils@0.2.0-alpha.153
  - @brains/plugins@0.2.0-alpha.153

## 0.2.0-alpha.152

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.152
  - @brains/contracts@0.2.0-alpha.152
  - @brains/image@0.2.0-alpha.152
  - @brains/utils@0.2.0-alpha.152
  - @brains/plugins@0.2.0-alpha.152

## 0.2.0-alpha.151

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.151
  - @brains/contracts@0.2.0-alpha.151
  - @brains/image@0.2.0-alpha.151
  - @brains/utils@0.2.0-alpha.151
  - @brains/plugins@0.2.0-alpha.151

## 0.2.0-alpha.150

### Patch Changes

- [`a6c7004`](https://github.com/rizom-ai/brains/commit/a6c70040f23414a301c3f2c2fb3ddef11e7b825f) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Use GPT-5.6 Luna with low reasoning as the default brain model, add typed reasoning-effort configuration from brain definitions and instance overrides through the AI runtime, and simplify tool-routing prompts for more reliable status, trust, and agent recommendation workflows.

- Updated dependencies []:
  - @brains/plugins@0.2.0-alpha.150
  - @brains/content-formatters@0.2.0-alpha.150
  - @brains/contracts@0.2.0-alpha.150
  - @brains/image@0.2.0-alpha.150
  - @brains/utils@0.2.0-alpha.150

## 0.2.0-alpha.149

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.149
  - @brains/contracts@0.2.0-alpha.149
  - @brains/image@0.2.0-alpha.149
  - @brains/utils@0.2.0-alpha.149
  - @brains/plugins@0.2.0-alpha.149

## 0.2.0-alpha.148

### Patch Changes

- Updated dependencies [[`d82b56c`](https://github.com/rizom-ai/brains/commit/d82b56cd9729a7a1d06a1232fea0674d9853da87)]:
  - @brains/plugins@0.2.0-alpha.148
  - @brains/content-formatters@0.2.0-alpha.148
  - @brains/contracts@0.2.0-alpha.148
  - @brains/image@0.2.0-alpha.148
  - @brains/utils@0.2.0-alpha.148

## 0.2.0-alpha.147

### Patch Changes

- Updated dependencies [[`6d95483`](https://github.com/rizom-ai/brains/commit/6d95483c589c3e77b23c42bf9516c03be8253e1f)]:
  - @brains/plugins@0.2.0-alpha.147
  - @brains/content-formatters@0.2.0-alpha.147
  - @brains/contracts@0.2.0-alpha.147
  - @brains/image@0.2.0-alpha.147
  - @brains/utils@0.2.0-alpha.147

## 0.2.0-alpha.146

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.146
  - @brains/contracts@0.2.0-alpha.146
  - @brains/image@0.2.0-alpha.146
  - @brains/utils@0.2.0-alpha.146
  - @brains/plugins@0.2.0-alpha.146

## 0.2.0-alpha.145

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.145
  - @brains/contracts@0.2.0-alpha.145
  - @brains/image@0.2.0-alpha.145
  - @brains/utils@0.2.0-alpha.145
  - @brains/plugins@0.2.0-alpha.145

## 0.2.0-alpha.144

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.144
  - @brains/contracts@0.2.0-alpha.144
  - @brains/image@0.2.0-alpha.144
  - @brains/utils@0.2.0-alpha.144
  - @brains/plugins@0.2.0-alpha.144

## 0.2.0-alpha.143

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.143
  - @brains/contracts@0.2.0-alpha.143
  - @brains/image@0.2.0-alpha.143
  - @brains/utils@0.2.0-alpha.143
  - @brains/plugins@0.2.0-alpha.143

## 0.2.0-alpha.142

### Patch Changes

- Updated dependencies []:
  - @brains/plugins@0.2.0-alpha.142
  - @brains/content-formatters@0.2.0-alpha.142
  - @brains/contracts@0.2.0-alpha.142
  - @brains/image@0.2.0-alpha.142
  - @brains/utils@0.2.0-alpha.142

## 0.2.0-alpha.141

### Patch Changes

- Updated dependencies []:
  - @brains/image@0.2.0-alpha.141
  - @brains/plugins@0.2.0-alpha.141
  - @brains/content-formatters@0.2.0-alpha.141
  - @brains/contracts@0.2.0-alpha.141
  - @brains/utils@0.2.0-alpha.141

## 0.2.0-alpha.140

### Patch Changes

- Updated dependencies [[`070541b`](https://github.com/rizom-ai/brains/commit/070541b535e3977c8fe2d590ae7ad114cee09417), [`a30edc7`](https://github.com/rizom-ai/brains/commit/a30edc7ac66807c66cba2bc94e78206f133710d6), [`cea906c`](https://github.com/rizom-ai/brains/commit/cea906c689d40dee5f06ab949d5289c2660bfd37)]:
  - @brains/plugins@0.2.0-alpha.140
  - @brains/content-formatters@0.2.0-alpha.140
  - @brains/utils@0.2.0-alpha.140
  - @brains/image@0.2.0-alpha.140
  - @brains/contracts@0.2.0-alpha.140

## 0.2.0-alpha.139

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.139
  - @brains/contracts@0.2.0-alpha.139
  - @brains/image@0.2.0-alpha.139
  - @brains/utils@0.2.0-alpha.139
  - @brains/plugins@0.2.0-alpha.139

## 0.2.0-alpha.138

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.138
  - @brains/contracts@0.2.0-alpha.138
  - @brains/image@0.2.0-alpha.138
  - @brains/utils@0.2.0-alpha.138
  - @brains/plugins@0.2.0-alpha.138

## 0.2.0-alpha.137

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.137
  - @brains/contracts@0.2.0-alpha.137
  - @brains/image@0.2.0-alpha.137
  - @brains/utils@0.2.0-alpha.137
  - @brains/plugins@0.2.0-alpha.137

## 0.2.0-alpha.136

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.136
  - @brains/contracts@0.2.0-alpha.136
  - @brains/image@0.2.0-alpha.136
  - @brains/utils@0.2.0-alpha.136
  - @brains/plugins@0.2.0-alpha.136

## 0.2.0-alpha.135

### Patch Changes

- Updated dependencies [[`37db2bc`](https://github.com/rizom-ai/brains/commit/37db2bc759e606f42efacedd70056e9c2f440a4e)]:
  - @brains/plugins@0.2.0-alpha.135
  - @brains/content-formatters@0.2.0-alpha.135
  - @brains/contracts@0.2.0-alpha.135
  - @brains/image@0.2.0-alpha.135
  - @brains/utils@0.2.0-alpha.135

## 0.2.0-alpha.134

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.134
  - @brains/contracts@0.2.0-alpha.134
  - @brains/image@0.2.0-alpha.134
  - @brains/utils@0.2.0-alpha.134
  - @brains/plugins@0.2.0-alpha.134

## 0.2.0-alpha.133

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.133
  - @brains/contracts@0.2.0-alpha.133
  - @brains/image@0.2.0-alpha.133
  - @brains/utils@0.2.0-alpha.133
  - @brains/plugins@0.2.0-alpha.133

## 0.2.0-alpha.132

### Patch Changes

- Updated dependencies []:
  - @brains/plugins@0.2.0-alpha.132
  - @brains/image@0.2.0-alpha.132
  - @brains/content-formatters@0.2.0-alpha.132
  - @brains/contracts@0.2.0-alpha.132
  - @brains/utils@0.2.0-alpha.132

## 0.2.0-alpha.131

### Patch Changes

- Updated dependencies []:
  - @brains/plugins@0.2.0-alpha.131
  - @brains/content-formatters@0.2.0-alpha.131
  - @brains/contracts@0.2.0-alpha.131
  - @brains/image@0.2.0-alpha.131
  - @brains/utils@0.2.0-alpha.131

## 0.2.0-alpha.130

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.130
  - @brains/contracts@0.2.0-alpha.130
  - @brains/image@0.2.0-alpha.130
  - @brains/utils@0.2.0-alpha.130
  - @brains/plugins@0.2.0-alpha.130

## 0.2.0-alpha.129

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.129
  - @brains/contracts@0.2.0-alpha.129
  - @brains/image@0.2.0-alpha.129
  - @brains/utils@0.2.0-alpha.129
  - @brains/plugins@0.2.0-alpha.129

## 0.2.0-alpha.128

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.128
  - @brains/contracts@0.2.0-alpha.128
  - @brains/image@0.2.0-alpha.128
  - @brains/utils@0.2.0-alpha.128
  - @brains/plugins@0.2.0-alpha.128

## 0.2.0-alpha.127

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.127
  - @brains/contracts@0.2.0-alpha.127
  - @brains/image@0.2.0-alpha.127
  - @brains/utils@0.2.0-alpha.127
  - @brains/plugins@0.2.0-alpha.127

## 0.2.0-alpha.126

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.126
  - @brains/contracts@0.2.0-alpha.126
  - @brains/image@0.2.0-alpha.126
  - @brains/utils@0.2.0-alpha.126
  - @brains/plugins@0.2.0-alpha.126

## 0.2.0-alpha.125

### Patch Changes

- Updated dependencies []:
  - @brains/plugins@0.2.0-alpha.125
  - @brains/content-formatters@0.2.0-alpha.125
  - @brains/contracts@0.2.0-alpha.125
  - @brains/image@0.2.0-alpha.125
  - @brains/utils@0.2.0-alpha.125

## 0.2.0-alpha.124

### Patch Changes

- Updated dependencies [[`57b025e`](https://github.com/rizom-ai/brains/commit/57b025e2bf9015c3f3e46b91fbdbef766efc3d10)]:
  - @brains/plugins@0.2.0-alpha.124
  - @brains/image@0.2.0-alpha.124
  - @brains/content-formatters@0.2.0-alpha.124
  - @brains/contracts@0.2.0-alpha.124
  - @brains/utils@0.2.0-alpha.124

## 0.2.0-alpha.123

### Patch Changes

- Updated dependencies []:
  - @brains/plugins@0.2.0-alpha.123
  - @brains/content-formatters@0.2.0-alpha.123
  - @brains/contracts@0.2.0-alpha.123
  - @brains/image@0.2.0-alpha.123
  - @brains/utils@0.2.0-alpha.123

## 0.2.0-alpha.122

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.122
  - @brains/contracts@0.2.0-alpha.122
  - @brains/image@0.2.0-alpha.122
  - @brains/utils@0.2.0-alpha.122
  - @brains/plugins@0.2.0-alpha.122

## 0.2.0-alpha.121

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.121
  - @brains/contracts@0.2.0-alpha.121
  - @brains/image@0.2.0-alpha.121
  - @brains/utils@0.2.0-alpha.121
  - @brains/plugins@0.2.0-alpha.121

## 0.2.0-alpha.120

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.120
  - @brains/contracts@0.2.0-alpha.120
  - @brains/image@0.2.0-alpha.120
  - @brains/utils@0.2.0-alpha.120
  - @brains/plugins@0.2.0-alpha.120

## 0.2.0-alpha.119

### Patch Changes

- Updated dependencies []:
  - @brains/plugins@0.2.0-alpha.119
  - @brains/content-formatters@0.2.0-alpha.119
  - @brains/contracts@0.2.0-alpha.119
  - @brains/image@0.2.0-alpha.119
  - @brains/utils@0.2.0-alpha.119

## 0.2.0-alpha.118

### Patch Changes

- Updated dependencies []:
  - @brains/plugins@0.2.0-alpha.118
  - @brains/content-formatters@0.2.0-alpha.118
  - @brains/contracts@0.2.0-alpha.118
  - @brains/image@0.2.0-alpha.118
  - @brains/utils@0.2.0-alpha.118

## 0.2.0-alpha.117

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.117
  - @brains/contracts@0.2.0-alpha.117
  - @brains/image@0.2.0-alpha.117
  - @brains/utils@0.2.0-alpha.117
  - @brains/plugins@0.2.0-alpha.117

## 0.2.0-alpha.116

### Patch Changes

- Updated dependencies []:
  - @brains/plugins@0.2.0-alpha.116
  - @brains/content-formatters@0.2.0-alpha.116
  - @brains/contracts@0.2.0-alpha.116
  - @brains/image@0.2.0-alpha.116
  - @brains/utils@0.2.0-alpha.116

## 0.2.0-alpha.115

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.115
  - @brains/contracts@0.2.0-alpha.115
  - @brains/image@0.2.0-alpha.115
  - @brains/utils@0.2.0-alpha.115
  - @brains/plugins@0.2.0-alpha.115

## 0.2.0-alpha.114

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.114
  - @brains/contracts@0.2.0-alpha.114
  - @brains/image@0.2.0-alpha.114
  - @brains/utils@0.2.0-alpha.114
  - @brains/plugins@0.2.0-alpha.114

## 0.2.0-alpha.113

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.113
  - @brains/contracts@0.2.0-alpha.113
  - @brains/image@0.2.0-alpha.113
  - @brains/utils@0.2.0-alpha.113
  - @brains/plugins@0.2.0-alpha.113

## 0.2.0-alpha.112

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.112
  - @brains/contracts@0.2.0-alpha.112
  - @brains/image@0.2.0-alpha.112
  - @brains/utils@0.2.0-alpha.112
  - @brains/plugins@0.2.0-alpha.112

## 0.2.0-alpha.111

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.111
  - @brains/contracts@0.2.0-alpha.111
  - @brains/image@0.2.0-alpha.111
  - @brains/utils@0.2.0-alpha.111
  - @brains/plugins@0.2.0-alpha.111

## 0.2.0-alpha.110

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.110
  - @brains/contracts@0.2.0-alpha.110
  - @brains/image@0.2.0-alpha.110
  - @brains/utils@0.2.0-alpha.110
  - @brains/plugins@0.2.0-alpha.110

## 0.2.0-alpha.109

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.109
  - @brains/contracts@0.2.0-alpha.109
  - @brains/image@0.2.0-alpha.109
  - @brains/utils@0.2.0-alpha.109
  - @brains/plugins@0.2.0-alpha.109

## 0.2.0-alpha.108

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.108
  - @brains/contracts@0.2.0-alpha.108
  - @brains/image@0.2.0-alpha.108
  - @brains/utils@0.2.0-alpha.108
  - @brains/plugins@0.2.0-alpha.108

## 0.2.0-alpha.107

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.107
  - @brains/contracts@0.2.0-alpha.107
  - @brains/image@0.2.0-alpha.107
  - @brains/utils@0.2.0-alpha.107
  - @brains/plugins@0.2.0-alpha.107

## 0.2.0-alpha.106

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.106
  - @brains/contracts@0.2.0-alpha.106
  - @brains/image@0.2.0-alpha.106
  - @brains/utils@0.2.0-alpha.106
  - @brains/plugins@0.2.0-alpha.106

## 0.2.0-alpha.105

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.105
  - @brains/contracts@0.2.0-alpha.105
  - @brains/image@0.2.0-alpha.105
  - @brains/utils@0.2.0-alpha.105
  - @brains/plugins@0.2.0-alpha.105

## 0.2.0-alpha.104

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.104
  - @brains/contracts@0.2.0-alpha.104
  - @brains/image@0.2.0-alpha.104
  - @brains/utils@0.2.0-alpha.104
  - @brains/plugins@0.2.0-alpha.104

## 0.2.0-alpha.103

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.103
  - @brains/contracts@0.2.0-alpha.103
  - @brains/image@0.2.0-alpha.103
  - @brains/utils@0.2.0-alpha.103
  - @brains/plugins@0.2.0-alpha.103

## 0.2.0-alpha.102

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.102
  - @brains/contracts@0.2.0-alpha.102
  - @brains/image@0.2.0-alpha.102
  - @brains/utils@0.2.0-alpha.102
  - @brains/plugins@0.2.0-alpha.102

## 0.2.0-alpha.101

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.101
  - @brains/contracts@0.2.0-alpha.101
  - @brains/image@0.2.0-alpha.101
  - @brains/utils@0.2.0-alpha.101
  - @brains/plugins@0.2.0-alpha.101

## 0.2.0-alpha.100

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.100
  - @brains/contracts@0.2.0-alpha.100
  - @brains/image@0.2.0-alpha.100
  - @brains/utils@0.2.0-alpha.100
  - @brains/plugins@0.2.0-alpha.100

## 0.2.0-alpha.99

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.99
  - @brains/contracts@0.2.0-alpha.99
  - @brains/image@0.2.0-alpha.99
  - @brains/utils@0.2.0-alpha.99
  - @brains/plugins@0.2.0-alpha.99

## 0.2.0-alpha.98

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.98
  - @brains/contracts@0.2.0-alpha.98
  - @brains/image@0.2.0-alpha.98
  - @brains/utils@0.2.0-alpha.98
  - @brains/plugins@0.2.0-alpha.98

## 0.2.0-alpha.97

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.97
  - @brains/contracts@0.2.0-alpha.97
  - @brains/image@0.2.0-alpha.97
  - @brains/utils@0.2.0-alpha.97
  - @brains/plugins@0.2.0-alpha.97

## 0.2.0-alpha.96

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.96
  - @brains/contracts@0.2.0-alpha.96
  - @brains/image@0.2.0-alpha.96
  - @brains/utils@0.2.0-alpha.96
  - @brains/plugins@0.2.0-alpha.96

## 0.2.0-alpha.95

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.95
  - @brains/contracts@0.2.0-alpha.95
  - @brains/image@0.2.0-alpha.95
  - @brains/utils@0.2.0-alpha.95
  - @brains/plugins@0.2.0-alpha.95

## 0.2.0-alpha.94

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.94
  - @brains/contracts@0.2.0-alpha.94
  - @brains/image@0.2.0-alpha.94
  - @brains/utils@0.2.0-alpha.94
  - @brains/plugins@0.2.0-alpha.94

## 0.2.0-alpha.93

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.93
  - @brains/contracts@0.2.0-alpha.93
  - @brains/image@0.2.0-alpha.93
  - @brains/utils@0.2.0-alpha.93
  - @brains/plugins@0.2.0-alpha.93

## 0.2.0-alpha.92

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.92
  - @brains/contracts@0.2.0-alpha.92
  - @brains/image@0.2.0-alpha.92
  - @brains/utils@0.2.0-alpha.92
  - @brains/plugins@0.2.0-alpha.92

## 0.2.0-alpha.91

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.91
  - @brains/contracts@0.2.0-alpha.91
  - @brains/image@0.2.0-alpha.91
  - @brains/utils@0.2.0-alpha.91
  - @brains/plugins@0.2.0-alpha.91

## 0.2.0-alpha.90

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.90
  - @brains/contracts@0.2.0-alpha.90
  - @brains/image@0.2.0-alpha.90
  - @brains/utils@0.2.0-alpha.90
  - @brains/plugins@0.2.0-alpha.90

## 0.2.0-alpha.89

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.89
  - @brains/contracts@0.2.0-alpha.89
  - @brains/image@0.2.0-alpha.89
  - @brains/utils@0.2.0-alpha.89
  - @brains/plugins@0.2.0-alpha.89

## 0.2.0-alpha.88

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.88
  - @brains/contracts@0.2.0-alpha.88
  - @brains/image@0.2.0-alpha.88
  - @brains/utils@0.2.0-alpha.88
  - @brains/plugins@0.2.0-alpha.88

## 0.2.0-alpha.87

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.87
  - @brains/contracts@0.2.0-alpha.87
  - @brains/image@0.2.0-alpha.87
  - @brains/utils@0.2.0-alpha.87
  - @brains/plugins@0.2.0-alpha.87

## 0.2.0-alpha.86

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.86
  - @brains/contracts@0.2.0-alpha.86
  - @brains/image@0.2.0-alpha.86
  - @brains/utils@0.2.0-alpha.86
  - @brains/plugins@0.2.0-alpha.86

## 0.2.0-alpha.85

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.85
  - @brains/contracts@0.2.0-alpha.85
  - @brains/image@0.2.0-alpha.85
  - @brains/utils@0.2.0-alpha.85
  - @brains/plugins@0.2.0-alpha.85

## 0.2.0-alpha.84

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.84
  - @brains/contracts@0.2.0-alpha.84
  - @brains/image@0.2.0-alpha.84
  - @brains/utils@0.2.0-alpha.84
  - @brains/plugins@0.2.0-alpha.84

## 0.2.0-alpha.83

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.83
  - @brains/contracts@0.2.0-alpha.83
  - @brains/image@0.2.0-alpha.83
  - @brains/utils@0.2.0-alpha.83
  - @brains/plugins@0.2.0-alpha.83

## 0.2.0-alpha.82

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.82
  - @brains/contracts@0.2.0-alpha.82
  - @brains/image@0.2.0-alpha.82
  - @brains/utils@0.2.0-alpha.82
  - @brains/plugins@0.2.0-alpha.82

## 0.2.0-alpha.81

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.81
  - @brains/contracts@0.2.0-alpha.81
  - @brains/image@0.2.0-alpha.81
  - @brains/utils@0.2.0-alpha.81
  - @brains/plugins@0.2.0-alpha.81

## 0.2.0-alpha.80

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.80
  - @brains/contracts@0.2.0-alpha.80
  - @brains/image@0.2.0-alpha.80
  - @brains/utils@0.2.0-alpha.80
  - @brains/plugins@0.2.0-alpha.80

## 0.2.0-alpha.79

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.79
  - @brains/contracts@0.2.0-alpha.79
  - @brains/image@0.2.0-alpha.79
  - @brains/utils@0.2.0-alpha.79
  - @brains/plugins@0.2.0-alpha.79

## 0.2.0-alpha.78

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.78
  - @brains/contracts@0.2.0-alpha.78
  - @brains/image@0.2.0-alpha.78
  - @brains/utils@0.2.0-alpha.78
  - @brains/plugins@0.2.0-alpha.78

## 0.2.0-alpha.77

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.77
  - @brains/contracts@0.2.0-alpha.77
  - @brains/image@0.2.0-alpha.77
  - @brains/utils@0.2.0-alpha.77
  - @brains/plugins@0.2.0-alpha.77

## 0.2.0-alpha.76

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.76
  - @brains/contracts@0.2.0-alpha.76
  - @brains/image@0.2.0-alpha.76
  - @brains/utils@0.2.0-alpha.76
  - @brains/plugins@0.2.0-alpha.76

## 0.2.0-alpha.75

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.75
  - @brains/contracts@0.2.0-alpha.75
  - @brains/image@0.2.0-alpha.75
  - @brains/utils@0.2.0-alpha.75
  - @brains/plugins@0.2.0-alpha.75

## 0.2.0-alpha.74

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.74
  - @brains/contracts@0.2.0-alpha.74
  - @brains/image@0.2.0-alpha.74
  - @brains/utils@0.2.0-alpha.74
  - @brains/plugins@0.2.0-alpha.74

## 0.2.0-alpha.73

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.73
  - @brains/contracts@0.2.0-alpha.73
  - @brains/image@0.2.0-alpha.73
  - @brains/utils@0.2.0-alpha.73
  - @brains/plugins@0.2.0-alpha.73

## 0.2.0-alpha.72

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.72
  - @brains/contracts@0.2.0-alpha.72
  - @brains/image@0.2.0-alpha.72
  - @brains/utils@0.2.0-alpha.72
  - @brains/plugins@0.2.0-alpha.72

## 0.2.0-alpha.71

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.71
  - @brains/contracts@0.2.0-alpha.71
  - @brains/image@0.2.0-alpha.71
  - @brains/utils@0.2.0-alpha.71
  - @brains/plugins@0.2.0-alpha.71

## 0.2.0-alpha.70

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.70
  - @brains/contracts@0.2.0-alpha.70
  - @brains/image@0.2.0-alpha.70
  - @brains/utils@0.2.0-alpha.70
  - @brains/plugins@0.2.0-alpha.70

## 0.2.0-alpha.69

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.69
  - @brains/contracts@0.2.0-alpha.69
  - @brains/image@0.2.0-alpha.69
  - @brains/utils@0.2.0-alpha.69
  - @brains/plugins@0.2.0-alpha.69

## 0.2.0-alpha.68

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.68
  - @brains/contracts@0.2.0-alpha.68
  - @brains/image@0.2.0-alpha.68
  - @brains/utils@0.2.0-alpha.68
  - @brains/plugins@0.2.0-alpha.68

## 0.2.0-alpha.67

### Patch Changes

- Updated dependencies [[`ace43f9`](https://github.com/rizom-ai/brains/commit/ace43f9c2c34db1159d6b91ba76411691e596c9f)]:
  - @brains/plugins@0.2.0-alpha.67
  - @brains/content-formatters@0.2.0-alpha.67
  - @brains/contracts@0.2.0-alpha.67
  - @brains/image@0.2.0-alpha.67
  - @brains/utils@0.2.0-alpha.67

## 0.2.0-alpha.66

### Patch Changes

- Updated dependencies []:
  - @brains/content-formatters@0.2.0-alpha.66
  - @brains/contracts@0.2.0-alpha.66
  - @brains/image@0.2.0-alpha.66
  - @brains/utils@0.2.0-alpha.66
  - @brains/plugins@0.2.0-alpha.66

## 0.2.0-alpha.65

### Patch Changes

- Updated dependencies []:
  - @brains/image@0.2.0-alpha.65
  - @brains/utils@0.2.0-alpha.65
  - @brains/plugins@0.2.0-alpha.65

## 0.2.0-alpha.64

### Patch Changes

- Updated dependencies []:
  - @brains/image@0.2.0-alpha.64
  - @brains/utils@0.2.0-alpha.64
  - @brains/plugins@0.2.0-alpha.64

## 0.2.0-alpha.63

### Patch Changes

- Updated dependencies []:
  - @brains/image@0.2.0-alpha.63
  - @brains/utils@0.2.0-alpha.63
  - @brains/plugins@0.2.0-alpha.63

## 0.2.0-alpha.62

### Patch Changes

- Updated dependencies []:
  - @brains/image@0.2.0-alpha.62
  - @brains/utils@0.2.0-alpha.62
  - @brains/plugins@0.2.0-alpha.62

## 0.2.0-alpha.61

### Patch Changes

- Updated dependencies []:
  - @brains/image@0.2.0-alpha.61
  - @brains/utils@0.2.0-alpha.61
  - @brains/plugins@0.2.0-alpha.61

## 0.2.0-alpha.60

### Patch Changes

- Updated dependencies []:
  - @brains/image@0.2.0-alpha.60
  - @brains/utils@0.2.0-alpha.60
  - @brains/plugins@0.2.0-alpha.60

## 0.2.0-alpha.59

### Patch Changes

- Updated dependencies []:
  - @brains/image@0.2.0-alpha.59
  - @brains/utils@0.2.0-alpha.59
  - @brains/plugins@0.2.0-alpha.59

## 0.2.0-alpha.58

### Patch Changes

- Updated dependencies []:
  - @brains/image@0.2.0-alpha.58
  - @brains/utils@0.2.0-alpha.58
  - @brains/plugins@0.2.0-alpha.58

## 0.2.0-alpha.57

### Patch Changes

- Updated dependencies []:
  - @brains/image@0.2.0-alpha.57
  - @brains/utils@0.2.0-alpha.57
  - @brains/plugins@0.2.0-alpha.57

## 0.2.0-alpha.56

### Patch Changes

- Updated dependencies []:
  - @brains/image@0.2.0-alpha.56
  - @brains/utils@0.2.0-alpha.56
  - @brains/plugins@0.2.0-alpha.56

## 0.2.0-alpha.55

### Patch Changes

- Updated dependencies []:
  - @brains/image@0.2.0-alpha.55
  - @brains/utils@0.2.0-alpha.55
  - @brains/plugins@0.2.0-alpha.55

## 0.2.0-alpha.54

### Patch Changes

- Updated dependencies []:
  - @brains/image@0.2.0-alpha.54
  - @brains/utils@0.2.0-alpha.54
  - @brains/plugins@0.2.0-alpha.54

## 0.2.0-alpha.53

### Patch Changes

- Updated dependencies []:
  - @brains/image@0.2.0-alpha.53
  - @brains/utils@0.2.0-alpha.53
  - @brains/plugins@0.2.0-alpha.53

## 0.2.0-alpha.52

### Patch Changes

- Updated dependencies []:
  - @brains/image@0.2.0-alpha.52
  - @brains/utils@0.2.0-alpha.52
  - @brains/plugins@0.2.0-alpha.52

## 0.2.0-alpha.51

### Patch Changes

- Updated dependencies []:
  - @brains/image@0.2.0-alpha.51
  - @brains/utils@0.2.0-alpha.51
  - @brains/plugins@0.2.0-alpha.51

## 0.2.0-alpha.50

### Patch Changes

- Updated dependencies []:
  - @brains/image@0.2.0-alpha.50
  - @brains/utils@0.2.0-alpha.50
  - @brains/plugins@0.2.0-alpha.50

## 0.2.0-alpha.49

### Patch Changes

- Updated dependencies []:
  - @brains/image@0.2.0-alpha.49
  - @brains/utils@0.2.0-alpha.49
  - @brains/plugins@0.2.0-alpha.49

## 0.2.0-alpha.48

### Patch Changes

- Updated dependencies []:
  - @brains/image@0.2.0-alpha.48
  - @brains/utils@0.2.0-alpha.48
  - @brains/plugins@0.2.0-alpha.48

## 0.2.0-alpha.47

### Patch Changes

- Updated dependencies []:
  - @brains/image@0.2.0-alpha.47
  - @brains/plugins@0.2.0-alpha.47
  - @brains/utils@0.2.0-alpha.47

## 0.2.0-alpha.46

### Patch Changes

- Updated dependencies []:
  - @brains/image@0.2.0-alpha.46
  - @brains/utils@0.2.0-alpha.46
  - @brains/plugins@0.2.0-alpha.46

## 0.2.0-alpha.45

### Patch Changes

- Updated dependencies []:
  - @brains/image@0.2.0-alpha.45
  - @brains/utils@0.2.0-alpha.45
  - @brains/plugins@0.2.0-alpha.45

## 0.2.0-alpha.44

### Patch Changes

- Updated dependencies []:
  - @brains/image@0.2.0-alpha.44
  - @brains/utils@0.2.0-alpha.44
  - @brains/plugins@0.2.0-alpha.44

## 0.2.0-alpha.43

### Patch Changes

- Updated dependencies []:
  - @brains/image@0.2.0-alpha.43
  - @brains/utils@0.2.0-alpha.43
  - @brains/plugins@0.2.0-alpha.43

## 0.2.0-alpha.42

### Patch Changes

- Updated dependencies []:
  - @brains/image@0.2.0-alpha.42
  - @brains/utils@0.2.0-alpha.42
  - @brains/plugins@0.2.0-alpha.42

## 0.2.0-alpha.41

### Patch Changes

- Updated dependencies []:
  - @brains/image@0.2.0-alpha.41
  - @brains/utils@0.2.0-alpha.41
  - @brains/plugins@0.2.0-alpha.41

## 0.2.0-alpha.40

### Patch Changes

- Updated dependencies []:
  - @brains/image@0.2.0-alpha.40
  - @brains/utils@0.2.0-alpha.40
  - @brains/plugins@0.2.0-alpha.40

## 0.2.0-alpha.39

### Patch Changes

- Updated dependencies []:
  - @brains/image@0.2.0-alpha.39
  - @brains/utils@0.2.0-alpha.39
  - @brains/plugins@0.2.0-alpha.39

## 0.2.0-alpha.38

### Patch Changes

- Updated dependencies []:
  - @brains/image@0.2.0-alpha.38
  - @brains/utils@0.2.0-alpha.38
  - @brains/plugins@0.2.0-alpha.38

## 0.2.0-alpha.37

### Patch Changes

- Updated dependencies []:
  - @brains/image@0.2.0-alpha.37
  - @brains/utils@0.2.0-alpha.37
  - @brains/plugins@0.2.0-alpha.37

## 0.2.0-alpha.36

### Patch Changes

- Updated dependencies []:
  - @brains/image@0.2.0-alpha.36
  - @brains/utils@0.2.0-alpha.36
  - @brains/plugins@0.2.0-alpha.36

## 0.2.0-alpha.35

### Patch Changes

- Updated dependencies []:
  - @brains/image@0.2.0-alpha.35
  - @brains/utils@0.2.0-alpha.35
  - @brains/plugins@0.2.0-alpha.35

## 0.2.0-alpha.34

### Patch Changes

- Updated dependencies []:
  - @brains/image@0.2.0-alpha.34
  - @brains/utils@0.2.0-alpha.34
  - @brains/plugins@0.2.0-alpha.34

## 0.2.0-alpha.33

### Patch Changes

- Updated dependencies []:
  - @brains/image@0.2.0-alpha.33
  - @brains/utils@0.2.0-alpha.33
  - @brains/plugins@0.2.0-alpha.33

## 0.2.0-alpha.32

### Patch Changes

- Updated dependencies []:
  - @brains/image@0.2.0-alpha.32
  - @brains/utils@0.2.0-alpha.32
  - @brains/plugins@0.2.0-alpha.32

## 0.2.0-alpha.31

### Patch Changes

- Updated dependencies []:
  - @brains/image@0.2.0-alpha.31
  - @brains/utils@0.2.0-alpha.31
  - @brains/plugins@0.2.0-alpha.31

## 0.2.0-alpha.30

### Patch Changes

- Updated dependencies []:
  - @brains/image@0.2.0-alpha.30
  - @brains/utils@0.2.0-alpha.30
  - @brains/plugins@0.2.0-alpha.30

## 0.2.0-alpha.29

### Patch Changes

- Updated dependencies []:
  - @brains/image@0.2.0-alpha.29
  - @brains/utils@0.2.0-alpha.29
  - @brains/plugins@0.2.0-alpha.29

## 0.2.0-alpha.28

### Patch Changes

- Updated dependencies []:
  - @brains/image@0.2.0-alpha.28
  - @brains/utils@0.2.0-alpha.28
  - @brains/plugins@0.2.0-alpha.28

## 0.2.0-alpha.27

### Patch Changes

- Updated dependencies []:
  - @brains/image@0.2.0-alpha.27
  - @brains/utils@0.2.0-alpha.27
  - @brains/plugins@0.2.0-alpha.27

## 0.2.0-alpha.26

### Patch Changes

- Updated dependencies []:
  - @brains/image@0.2.0-alpha.26
  - @brains/utils@0.2.0-alpha.26
  - @brains/plugins@0.2.0-alpha.26

## 0.2.0-alpha.25

### Patch Changes

- Updated dependencies []:
  - @brains/image@0.2.0-alpha.25
  - @brains/utils@0.2.0-alpha.25
  - @brains/plugins@0.2.0-alpha.25

## 0.2.0-alpha.24

### Patch Changes

- Updated dependencies []:
  - @brains/image@0.2.0-alpha.24
  - @brains/utils@0.2.0-alpha.24
  - @brains/plugins@0.2.0-alpha.24

## 0.2.0-alpha.23

### Patch Changes

- Updated dependencies []:
  - @brains/image@0.2.0-alpha.23
  - @brains/utils@0.2.0-alpha.23
  - @brains/plugins@0.2.0-alpha.23

## 0.2.0-alpha.22

### Patch Changes

- Updated dependencies []:
  - @brains/image@0.2.0-alpha.22
  - @brains/utils@0.2.0-alpha.22
  - @brains/plugins@0.2.0-alpha.22

## 0.2.0-alpha.21

### Patch Changes

- Updated dependencies []:
  - @brains/image@0.2.0-alpha.21
  - @brains/utils@0.2.0-alpha.21
  - @brains/plugins@0.2.0-alpha.21

## 0.2.0-alpha.20

### Patch Changes

- Updated dependencies []:
  - @brains/image@0.2.0-alpha.20
  - @brains/utils@0.2.0-alpha.20
  - @brains/plugins@0.2.0-alpha.20

## 0.2.0-alpha.19

### Patch Changes

- Updated dependencies []:
  - @brains/image@0.2.0-alpha.19
  - @brains/utils@0.2.0-alpha.19
  - @brains/plugins@0.2.0-alpha.19

## 0.2.0-alpha.18

### Patch Changes

- Updated dependencies []:
  - @brains/image@0.2.0-alpha.18
  - @brains/utils@0.2.0-alpha.18
  - @brains/plugins@0.2.0-alpha.18

## 0.2.0-alpha.17

### Patch Changes

- Updated dependencies []:
  - @brains/image@0.2.0-alpha.17
  - @brains/utils@0.2.0-alpha.17
  - @brains/plugins@0.2.0-alpha.17

## 0.2.0-alpha.16

### Patch Changes

- Updated dependencies []:
  - @brains/image@0.2.0-alpha.16
  - @brains/utils@0.2.0-alpha.16
  - @brains/plugins@0.2.0-alpha.16

## 0.2.0-alpha.15

### Patch Changes

- Updated dependencies []:
  - @brains/image@0.2.0-alpha.15
  - @brains/utils@0.2.0-alpha.15
  - @brains/plugins@0.2.0-alpha.15

## 0.2.0-alpha.14

### Patch Changes

- Updated dependencies []:
  - @brains/image@0.2.0-alpha.14
  - @brains/utils@0.2.0-alpha.14
  - @brains/plugins@0.2.0-alpha.14

## 0.2.0-alpha.13

### Patch Changes

- Updated dependencies []:
  - @brains/image@0.2.0-alpha.13
  - @brains/utils@0.2.0-alpha.13
  - @brains/plugins@0.2.0-alpha.13

## 0.2.0-alpha.12

### Patch Changes

- Updated dependencies []:
  - @brains/image@0.2.0-alpha.12
  - @brains/utils@0.2.0-alpha.12
  - @brains/plugins@0.2.0-alpha.12

## 0.2.0-alpha.11

### Patch Changes

- Updated dependencies []:
  - @brains/image@0.2.0-alpha.11
  - @brains/utils@0.2.0-alpha.11
  - @brains/plugins@0.2.0-alpha.11

## 0.2.0-alpha.10

### Patch Changes

- Updated dependencies []:
  - @brains/image@0.2.0-alpha.10
  - @brains/utils@0.2.0-alpha.10
  - @brains/plugins@0.2.0-alpha.10

## 0.2.0-alpha.9

### Patch Changes

- Updated dependencies []:
  - @brains/image@0.2.0-alpha.9
  - @brains/utils@0.2.0-alpha.9
  - @brains/plugins@0.2.0-alpha.9

## 0.2.0-alpha.8

### Patch Changes

- Updated dependencies []:
  - @brains/image@0.2.0-alpha.8
  - @brains/utils@0.2.0-alpha.8
  - @brains/plugins@0.2.0-alpha.8

## 0.2.0-alpha.7

### Patch Changes

- Updated dependencies []:
  - @brains/image@0.2.0-alpha.7
  - @brains/utils@0.2.0-alpha.7
  - @brains/plugins@0.2.0-alpha.7

## 0.2.0-alpha.6

### Patch Changes

- Updated dependencies []:
  - @brains/image@0.2.0-alpha.6
  - @brains/utils@0.2.0-alpha.6
  - @brains/plugins@0.2.0-alpha.6

## 0.2.0-alpha.5

### Patch Changes

- Updated dependencies []:
  - @brains/image@0.2.0-alpha.5
  - @brains/utils@0.2.0-alpha.5
  - @brains/plugins@0.2.0-alpha.5

## 0.2.0-alpha.4

### Patch Changes

- Updated dependencies []:
  - @brains/image@0.2.0-alpha.4
  - @brains/utils@0.2.0-alpha.4
  - @brains/plugins@0.2.0-alpha.4

## 0.2.0-alpha.3

### Patch Changes

- Updated dependencies []:
  - @brains/image@0.2.0-alpha.3
  - @brains/utils@0.2.0-alpha.3
  - @brains/plugins@0.2.0-alpha.3

## 0.2.0-alpha.2

### Patch Changes

- Updated dependencies []:
  - @brains/image@0.2.0-alpha.2
  - @brains/utils@0.2.0-alpha.2
  - @brains/plugins@0.2.0-alpha.2

## 0.2.0-alpha.1

### Patch Changes

- Updated dependencies []:
  - @brains/image@0.2.0-alpha.1
  - @brains/utils@0.2.0-alpha.1
  - @brains/plugins@0.2.0-alpha.1

## 1.0.1-alpha.17

### Patch Changes

- Updated dependencies []:
  - @brains/image@1.0.1-alpha.17
  - @brains/utils@1.0.1-alpha.17
  - @brains/plugins@1.0.1-alpha.17
