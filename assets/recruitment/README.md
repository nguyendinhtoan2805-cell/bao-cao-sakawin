# Recruitment presentation assets

- `sakawin-logo.png`: original user-supplied PNG, copied unchanged. CSS clips only its empty margins; the source file is preserved.
- `header-motif.png`: generated nonessential decoration; no data or text embedded.
- `icons/*.svg`: unchanged Feather 4.29.2 assets from https://github.com/feathericons/feather (MIT; license included). No external icon scripts run in the app.
- `recruitment.css`: scoped to the recruitment page. Other pages do not load it.
- `recruitment-ui.js`: toggles sidebar presentation only; no network, storage or business-state access.

All existing inline JavaScript in `tuyen-dung.html` remains byte-for-byte identical to commit `0027c37`. The existing IDs, API calls, permission gates, filters, calendar, CV viewer, action handlers and screenshot mode remain in place. The calendar and full alert descriptions are intentionally retained instead of the collapsed calendar and shortened alerts in the concept image.

Local review: `node tests/recruitment-preview.cjs`, then open `http://127.0.0.1:4321/fixture?role=all`. Only synthetic in-memory data is used. See `design-qa.md` for validation evidence.
