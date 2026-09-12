# @brains/app-ui-react

## 0.2.0-alpha.368

## 0.2.0-alpha.367

## 0.2.0-alpha.366

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

## 0.2.0-alpha.364

## 0.2.0-alpha.363

## 0.2.0-alpha.362

## 0.2.0-alpha.361

## 0.2.0-alpha.360

## 0.2.0-alpha.359

## 0.2.0-alpha.358

## 0.2.0-alpha.357

## 0.2.0-alpha.356

## 0.2.0-alpha.355

## 0.2.0-alpha.354

## 0.2.0-alpha.353

## 0.2.0-alpha.352

## 0.2.0-alpha.351

## 0.2.0-alpha.350
