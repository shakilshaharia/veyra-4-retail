# Veyra website correction handoff

## Browser-verified corrections

- The October 8 8:56 AM reference is now available and used at its native 1408px width. Product introductions, tabs, full-background tiles, inset white cards, and compact rectangular CTAs follow that composition; these are still tall complete experiences, not miniature laptop cards.
- Browser geometry checks cycled all eleven feature tabs after React committed each change at widths 1408, 1440, 1366, 1024, 960, and 390. Feature headline, body, impact, and mounted video source matched each selection. All 66 combinations passed tile-boundary, aspect-ratio, copy-fit, and horizontal-overflow checks.
- Hero and product media share the same absolute full-container positioning. Every video and matching poster has the exact tile bounds. The 16:9 decoded footage preserves the baked-in right-side interface; the white inset card occupies approximately 30.5% of the tile. No screenshot or recreated interface replaces the supplied clips.
- Current complete-product captures are `verification/reference-online-layering.jpg`, `verification/reference-in-person-layering.jpg`, and `verification/reference-cerin-layering.jpg`. They are cropped from the running browser at the reference's native width, using decoded video frames. The taller capture viewport exposes each complete experience in one still; short laptop viewports were tested separately.
- Native down/up overlap, midpoint reversal, parent-end release, and fully visible pinned media were checked at both 1440×900 and 1366×768. Current overlap captures are named `verification/reference-stack-*`. Native wheel inputs are not intercepted.
- The current rotation check kept a manually selected feature for 8.8 seconds and advanced it after 10.4 seconds while the pointer remained over the section.
- Live wheel overlap, complete reverse sequence, midpoint reversal, and natural parent-end release were checked at both required desktop sizes. Only the exposed product was active/rotating; covered videos were paused. An 80px wheel input produced an 80px movement at 1440×900.
- The hovered active card advanced after ten seconds. A late manual selection remained selected at 8.8 seconds and advanced after 10.3 seconds; the final Cerin feature wrapped to the first after 10.5 seconds. Pause/play worked, and rapid selections settled on the correct text, poster, and clip.
- Blocking both Order Tracking video formats left its exact matching, loaded poster visible (video opacity 0, poster opacity 1); playback recovered at readyState 4 after removing the block and reselecting.
- A live reduced-motion preference change removed feature videos, stopped rotation, and disabled automatic-rotation controls. Manual selection updated the loaded matching poster.
- An actual second browser tab was activated: the product page became hidden, all feature videos paused, rotation stopped, and progress remained unchanged. No simulated visibility event was used.
- At 390×844 the cards were normal-flow, all labels fit the two-column tablists, and video preceded copy. All eight FAQ disclosures were subsequently checked for expansion and collapse; no textarea/editor fields remain.
- Actual footer clicks now reveal the correct product headings at approximately y=132px. Non-sticky 1px flow anchors preserve the existing fragments without scroll interception; initial fragment navigation is restored after React mounts the targets.
- Results, platform, stories, closing CTA, FAQ, and footer headings were visited and visibly rendered at opacity 1. The missing-scheduling dialog remains honest and collects no data.
- Current wheel overlap captures are `verification/current-overlap-online-in-person-1440x900.jpg` and `verification/current-overlap-in-person-cerin-1440x900.jpg`. Older small-layout captures are historical, not proof of this layout.
- TypeScript and production build pass. The managed website workflow was restarted after the completed code batch.

## Remaining verification limits

- Physical trackpad hardware was not available; scrolling was exercised with browser wheel input.
- Exact comparison to the named October 8 screenshots is not possible because those files are absent.
- MP4-only decoding was not separately forced; the supplied WebM versions were used in playback checks. Physical touch/trackpad hardware was unavailable.
- One initial resource 404 was identified as `/favicon.ico`; it was not a failed product video or poster. Deliberately blocked media generated expected network failures during fallback verification.

## Implementation decisions

- Native browser scrolling; no global smooth-scroll transition, wheel interception, damping, or artificial spacer sections.
- The three complete product cards share one CSS sticky parent and stable increasing stacking order. Focus does not change stacking order.
- Sticky presentation remains enabled at both 1440×900 and 1366×768. Large cards retain readable typography and scroll naturally before pinning; only actual size changes update a measured height variable. There are no height-specific miniature-card rules. Tablet/mobile widths at or below 1050px use normal flow.
- The complete introduction, tabs, and tile move as one sticky card. Only the media tile has rounded clipping; the additional enclosing rounded shell is removed. Bridge copy remains in normal document flow without short card wrappers.
- Desktop product tiles retain the supplied approximately 16:9 composition. Video covers the whole tile behind the left inset HTML copy card; baked-in product UI is not recreated.
- At 960px and wider, the white card overlaps the full 16:9 video tile. Narrower layouts place readable copy outside and below that tile; videos still retain the entire tile's bounds, with no auto-height/right-column overrides. Narrow-screen tabs wrap instead of requiring horizontal scrolling.
- One visibility calculation accounts for later cards covering earlier cards. Only the front/most-exposed card rotates or plays its clips.
- Active feature rotation uses a 10-second eligible-time interval. Manual selection restarts it; section hover and pointer focus do not pause it. Keyboard focus, explicit pause, hidden tabs, offscreen/covered cards, and reduced-motion preferences protect reading and playback.
- All eleven supplied MP4s remain assigned to their approved features. Connect Every Channel keeps its copy and an explicit brand-colored missing-media notice, without a substitute video or invented product interface.
- Matching WebM renditions of the same footage are offered first for preview-browser codec compatibility, with original MP4 sources retained as fallbacks. Approved poster frames remain visible when decoding fails.
- Each selected feature owns one keyed media instance over its matching poster; old clips cannot persist after rapid selection changes. Small poster images are warmed ahead of switching. Loading/error and reduced-motion states retain the matching poster.
- All eight FAQ questions remain visible with working disclosure controls. Missing answers are flagged in read-only text; unsaved answer-entry fields are removed.

## Missing approvals and inputs

1. Approved customer/partner logo files, confirmation of which logos belong in the trust row, and the approved supporting description. The required headline is “Trusted by brands focused on growth.” Template/sample logos are not treated as confirmed customers.
2. Approved Veyra identity artwork and, if wanted, parent-brand artwork. The current identity is plain Veyra text, not a fabricated logo.
3. Approved static visual for Connect Every Channel.
4. Approved answers to all eight questions in `src/content.ts`.
5. Approved corresponding FAQ image. Embedded solar-related template images are not used as Veyra imagery.
6. Demo scheduling URL/action. The current demo button opens the existing honest unavailable-scheduling dialog and collects no personal data.
7. Correct social, contact, privacy, and terms destinations, if those links should be included. They are intentionally absent rather than fake.
8. Earlier named 8:47 AM / 8:46 AM references and “Veyra-Revenue-Platform.png” are not currently available. The newly supplied October 8 8:56 AM screenshot is the reference used for this correction; it is not missing.
9. The original AgentSense brand-guidelines PDF is not currently available on disk. The provided written requirements—Inter, Electric Blue #231FCD, Bright Blue #00E5FF, and Live Orange #FF6600—are retained.

This is a review build, not a statement that missing content is approved for publication.
