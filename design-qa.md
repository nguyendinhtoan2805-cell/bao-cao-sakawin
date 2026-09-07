# Recruitment UI review — 2026-09-07

final result: passed

## Scope and visual truth

Source: `/Users/dinhtoan/.codex/generated_images/01a07ab1-990d-7bc3-a6d0-08a41319529b/exec-f286a2d5-d190-47b4-bbd0-180bc87f4fb7.png` (1672 × 941).

User-directed update: use the supplied actual Sakawin logo; change presentation only. Implementation: `http://127.0.0.1:4321/tuyen-dung.html`, isolated worktree `codex/recruitment-ui`, synthetic in-memory data via `tests/recruitment-preview.cjs`. No real Lark/Redis requests or credentials.

## Evidence and normalization

- Desktop: `tests/recruitment-ui-evidence/desktop.png`. Requested CSS viewport 1672 × 941; scrollbar leaves 1657px content width. Browser capture exported 1657 × 933, a small proportional rescale. Source and rendered capture were opened together in the same comparison input. Comparison is visual, not a pixel-diff score.
- Mobile: `tests/recruitment-ui-evidence/mobile.png`, 390 × 844 viewport. Root scrollWidth equals clientWidth; internal board/table scrolling is intentional.
- Mobile profile: `tests/recruitment-ui-evidence/mobile-profile.png`. Modal top 12, bottom 832; actions top 724, bottom 832 within the 844px viewport.
- Focused board/toolbar capture: `tests/recruitment-ui-evidence/detail.png`. Browser clip export applies additional scaling; DOM dimensions were also checked (checkbox exactly 16 × 16, no invented precision from scaled pixels).
- Small desktop: 1024 × 768, 38 visible synthetic candidates including long names. Root clientWidth/scrollWidth both 1009px; board width 760px, scrollWidth 1332px, height 609px, scrollHeight 6164px. All records remain scrollable.

State: all-access synthetic reviewer, 8 open candidates, 1 closed candidate. The same seven open-stage counts as the concept are shown. The fixture intentionally triggers an additional overdue-CV alert to exercise existing warning content. Scope-limited and no-access roles were checked separately.

## Comparison history and fixes

1. Initial rendered capture `/private/tmp/sakawin-recruitment-ui-before-qa.png`:
   - [P2] KPI hot-state background from legacy CSS overrode the pale icon tile. Added the scoped hot-state rule; amber warning remains legible.
   - [P2] Toolbar on a separate full row pushed the board down unnecessarily. Aligned title and filters with CSS grid above 1350px while retaining every original instruction and control.
   - [P2] Checkbox inherited the input min-height/min-width. Restricted input sizing rules to non-checkbox inputs. Verified checkbox 16 × 16.
   - Improved candidate-name and stage-label sizes while keeping long names wrap-safe.
2. Final paired comparison: `desktop.png` against the visual truth above. Corrected KPI tile, aligned toolbar and normal checkbox confirmed. No actionable P0/P1/P2 visual regressions remain under the user's presentation-only constraints.
3. An initial profile click check was inconclusive because the browser capture temporarily expanded the emulated viewport to document height. Restoring the requested viewport put the actions within the viewport and allowed the real handler to process a synthetic status transition. This was a test-tool state issue, not a production API change.

## Five fidelity surfaces

- Typography: existing Be Vietnam Pro retained. Strong 38px maximum page title, 21px section headings, 13px candidate names, compact supporting text. Long candidate names/roles wrap instead of vanishing. Label wording from business rendering is unchanged.
- Spacing/layout: light 224px sidebar, responsive compact sidebar, aligned title/filters, seven-column board. Smaller viewports keep local horizontal scrolling. The top of the board is approximately 594px rather than 486px in the concept because full warnings, privacy guidance and real sync status are intentionally retained.
- Colors/tokens: original Sakawin #C8102E, warm-white surfaces, pale watermark, restrained generated line motif; existing semantic pipeline and alert colors retained.
- Images: exact supplied logo bytes reused; only empty source margins clipped in CSS without distorting the mark. Original vector Feather icons are bundled locally. No candidate photos replaced; existing CV previews/fallbacks remain controlled by unchanged code.
- Copy/content: full operational warnings, scope banner, calendar, funnel, source statistics, vacancy and rejection tables are preserved. No invented scope switch, fabricated production date or mock KPI is added to the app. Mock-only dates and records are supplied by the local fixture.

## Functional and access checks

- Existing inline recruitment JavaScript is byte-identical to `0027c37`: SHA256 `266236cc8be3c8a93929f9581bb2ea0ff768ad07cbd8a798cbb151c75c11880d`.
- Every pre-existing HTML ID retained; no duplicate IDs.
- No changes to any API handler or other application page.
- Existing `node tests/access-control.test.js`: 32/32 pass.
- Search, position filter, closed-record toggle (seven/nine stages), opening/closing profiles, sidebar collapse/expand, current/next calendar month verified in browser.
- Clicked the existing 'Đạt vòng CV' action on a fake record. Local request log confirms POST for `demo0`, followed by successful reload; no production data touched.
- Read-only role: only permitted navigation visible; no approval controls in profile. Scope banner still shows Team A. No-access role: locked gate only.
- Empty response: zero KPIs and seven empty stages. Simulated 503: existing readable error; sync button usable again.
- Existing screenshot mode hides navigation/search, reclaims main margin, removes board height cap; can be exited.
- Desktop and mobile profile geometry checked; mobile details scroll while action row remains within viewport.
- Browser console review: no JavaScript errors in normal interaction checks. One intentional HTTP 503 belongs to the explicit error fixture.
- `git diff --check` and `node --check assets/recruitment/recruitment-ui.js` pass.

## Intentional differences and practical limits

- Calendar remains fully expanded, not a new collapsing workflow. Instructions and detailed warnings are retained. Thus the page is taller than the image concept.
- Actual supplied logo replaces the concept's generic SAKAWIN lettering. Avatars/CV previews keep their existing behavior and colors.
- Mobile wraps navigation into rows; desktop sidebar collapse is presentation-only with no persisted settings.
- No live production write, full real-CV render or end-to-end live Lark integration was run for this visual change. Inline code and API invariants plus synthetic tests provide regression evidence, not a claim of exhaustive production testing.
- Additional logo/background transfer is approximately 952 KiB before HTTP caching. No new third-party runtime script or icon CDN is introduced.

## Implementation checklist

- [x] Apply scoped layout/assets to recruitment only.
- [x] Preserve business script, data, permissions and original sections.
- [x] Fix visual regressions found during comparison.
- [x] Verify responsive, access, error, empty and interaction states.
- [x] Keep local review running; no production deployment in this task.

## Follow-up polish

No blocking findings. Further palette/spacing adjustments can be reviewed in the local preview without changing business functionality.

# Whole-workspace extension — 2026-09-07

final result: passed

## Scope

Extended the approved recruitment direction to `index.html`, `doanh-so.html`, `tai-chinh.html`, `quy-luong.html`, `nhan-su.html`, `admin.html` and the existing standalone `Sakawin_BaoCao_Thang_Web.html`. Recruitment remains at its previously reviewed implementation. The legacy standalone report retains its original navigation/auth behavior. Shared rules are in `assets/workspace/workspace.css`; the existing presentation-only sidebar toggle is reused. No API handler, environment variable, permission policy, calculation or source dataset was changed.

## Visual evidence and findings

Evidence directory: `tests/workspace-ui-evidence/`. Desktop 1672×941 and mobile 390×844 CSS viewports, using the user's existing Codex browser. Captures may proportionally rescale when exported by the browser (see recruitment evidence notes above).

Reviewed home, sales, finance, salary, HR, admin, login and legacy report. The selected source image and final HR desktop were displayed together in one comparison input. Shared typography, 224px sidebar, original logo, red headings, faint brand watermark and curves follow that direction. Dense report tables retain their original internal scrolling and data colors; no attempt was made to turn reporting workflows into recruitment cards.

Fixed during review:
- Old `!important` navigation padding/borders conflicting with sidebar styles.
- Sales masthead squeezing four KPIs beside the title; moved the KPI row below it using CSS.
- Missing surface token on older pages and distinct meanings of `.hot` across sales versus HR/payroll. Sales keeps a red tile with white text; HR/payroll keep white surfaces and their original red warning values.
- Mobile compact-sidebar logo size, native period-select styling and privacy-text wrapping.
- Narrow grids now use `minmax(0,...)` so charts and scrollable tables fit their containers.

No remaining actionable P0/P1/P2 visual findings in the reviewed scope. Intentional differences from the recruitment concept: actual logo, preserved full instructional copy, full report sections, existing dark-theme semantics, and wrapped mobile navigation.

## Regression evidence

- All eight HTML files: every original inline script is byte-identical to security baseline `0027c37`; original HTML ID sets unchanged, no duplicate IDs.
- 32/32 existing access-control tests pass. One test harness selector was updated to end at its own script closing tag instead of the final script tag, because the presentation script is now appended to Home. Test assertions and production initialization logic are unchanged.
- Browser: Home/Finance quarter filters, Sales custom-date mode, Sales dark/light toggle, links across pages, Admin Lark/password-form toggle, sidebar collapse/expand, HR search and profile open/close work with synthetic data.
- Unauthorized Admin and Payroll display their gates; protected wrappers stay hidden. Guest Home displays only login controls.
- Mobile root width stayed within the viewport on all reviewed pages. Payroll tables retain `overflow:auto` with approximately 341px viewport for 1031px/1234px table content. Chart widths on Home remain within their cards.
- Normal browser checks reported no JavaScript errors. Backend access tests cover denied/malformed scope and stale writes independently of the visual layer.
- Expanded local preview uses the unchanged production handlers with in-memory fake Lark and fake account store. The legacy embedded DATA is substituted only in the test server response before rendering, leaving the actual file's script/data unchanged.

## Limits and delivery

This is local visual and regression verification with fake data, not live production integration testing. Login submission, real account writes, real Lark edits and deployments were not performed. Existing external font and Chart.js loading remain as before. New pages reuse already-bundled images/icons; there is no additional external runtime dependency.

- [x] Extend approved presentation to every existing HTML page.
- [x] Preserve inline application logic, IDs and server/API files.
- [x] Review desktop, mobile, dark theme, access gates and key controls.
- [x] Save review evidence with synthetic data only.
- [x] Keep localhost preview available for user review; no push/deploy.

Additional check: Sales screenshot mode still hides navigation and removes sidebar offset. Existing chart tick formatting can show excessive fractional digits on synthetic constant-percentage data; it is inherited from the unchanged chart code and is outside this presentation-only change.
