# Handoff Notes — Next Steps for React Code‑Splitting and Cleanup

This handoff captures the current state of the app, what has been completed, and a focused plan to continue the route‑based code splitting (learning-oriented), starting with extracting the New Entry screen.

## Current State (Post‑Work)

- Forced dark theme across the app (no light-mode override).
  - File: `src/index.css`
- Timezone conversion fix (local → UTC) to add offset rather than subtract.
  - File: `src/time.ts`
- Log Search CSV export includes a human‑readable `Events` column.
  - File: `src/App.tsx` (and mirrored in new screen module)
- Search defaults (user setting) implemented and applied on first mount of Log Search.
  - Server: `server/src/routes/auth.ts` (persist and expose `search_default_range`)
  - Client: defaults logic in Log Search screen module.
- Recent logs scope (Timed Entry) implemented with UI in Settings; filtered list + “strong” week divider when multiple weeks visible.
  - Client filtering + sorting for Timed Entry implemented in `src/App.tsx`.
- Scroll restore + flash highlight in both Log Search and Timed Entry.
  - Log Search: restores from `searchState.scrollY` and `highlightId`.
  - Timed Entry: captures/restores via internal `timeScrollY` and `timeHighlightId`.
- Bundle analyzer wired; report written to `dist/stats.html` when built with `ANALYZE=1`.
  - Plugin: `rollup-plugin-visualizer`
  - Config: `vite.config.ts`
  - Script: `npm run build:analyze`

### Code‑Splitting (done)

- Settings Screen extracted and lazy‑loaded:
  - Module: `src/screens/SettingsScreen.tsx`
  - Lazy import + Suspense: `src/App.tsx`
- Log Search Screen extracted and lazy‑loaded:
  - Module: `src/screens/LogSearchScreen.tsx`
  - Lazy import + Suspense: `src/App.tsx`
- Idle prefetch to smooth first navigation to lazy screens:
  - `import('./screens/SettingsScreen')` and `import('./screens/LogSearchScreen')` in an idle callback.

Build snapshot (after splits):
- Main bundle ~227.4 kB min (gzip ~69.8 kB)
- Settings chunk ~3.9 kB min (gzip ~1.1 kB)
- Log Search chunk ~10.6 kB min (gzip ~4.0 kB)

## Next Task — Extract and Lazy‑Load New Entry Screen

Goal: Move `NewEntryScreen` out of `src/App.tsx` into `src/screens/NewEntryScreen.tsx`, then lazy‑load it. This teaches modularization, props typing, and dynamic imports; also trims the initial bundle a bit further.

### Where NewEntryScreen lives today

- Inlined in `src/App.tsx` as `function NewEntryScreen(props: { ... })`.
- Used in two places:
  - `view === 'new'` → manual entry (create)
  - `view === 'edit'` → manual entry edit (`mode="edit"`, passes existing entry)

### What NewEntryScreen depends on

- React: `useState`, `useEffect`, plus local helpers/constants.
- App‑scoped helpers currently in `App.tsx`:
  - `useClock()` — a small hook to tick `now` every second for the header of the form.
  - `btnStyle` — basic shared inline button style (padding, radius, etc.).
  - `renderCivil(now, tz)` — to display the current time at the top of the form.
- Modules:
  - `sound` (for button clicks)
  - `api` (manual/manualDuration/updateEntryTimes/updateEntryDuration)
  - `time.ts` utilities: `ymdInTZ`, `addDaysYMD`, `localDateTimeToUTCISO` etc.
  - `css` classes like `.timeField`, `.pickField`, `.btn3d`, `.btn-glass` (already global)

### Extraction Plan

1) Create `src/screens/NewEntryScreen.tsx` exporting the component.
   - Props should match the usage in App:
     - `{ mode?: 'new'|'edit', entry?: Entry, defaultSite: Site, defaultEvents: string[], allEvents: string[], tz?: string, onCancel: ()=>void, onCreated: ()=>Promise<void> }`
   - Copy the NewEntryScreen JSX and logic from `App.tsx`.
   - Add local `btnStyle` (same shape used elsewhere) and a local `renderCivil` helper (or reuse the `formatCivilPartsTZ` pattern, like in `App.tsx`).
   - Implement (or import) a `useClock` hook:
     - EITHER: create `src/hooks/useClock.ts` and move the `useClock` from `App.tsx` there; import it in both App and NewEntryScreen.
     - OR: clone the tiny hook inside NewEntryScreen for now (lowest friction).

2) Wire it in App via lazy‑loading:
   - At top of `src/App.tsx`:
     - `const NewEntryScreen = lazy(() => import('./screens/NewEntryScreen'))`
   - Replace the two usages:
     - `view === 'new' ? (<Suspense><NewEntryScreen ... /></Suspense>)`
     - `view === 'edit' && editing ? (<Suspense><NewEntryScreen mode="edit" entry={editing} ... /></Suspense>)`
   - Preserve the existing `onCreated` callbacks in App — they refresh entries, totals, and optionally patch selected Search results when returning from Search.

3) Add idle prefetch for New Entry:
   - In the existing idle prefetch effect (in `App.tsx`): add `import('./screens/NewEntryScreen')` alongside the other two.

4) Verify types and imports:
   - Ensure `Entry`, `User`, and `Site` types are imported into the new file.
   - Ensure `time.ts` imports match only what the screen uses (avoid unused import errors).

5) Build and sanity check:
   - `npm run build` (should succeed)
   - Expect a new chunk `dist/assets/NewEntryScreen-*.js` and a slightly smaller main bundle.
   - Interactively test:
     - Timed Entry → New (Manual Entry) opens, submits; returns to Timed Entry with refresh.
     - Timed Entry → click a row to Edit → saves/cancels → returns, scroll restores and flashes.
     - From Log Search → Edit → return to Search restores scroll and flashes.

### Pitfalls to watch

- `useClock` location: If you keep it in `App.tsx`, NewEntryScreen won’t see it. Prefer moving to `src/hooks/useClock.ts`:
  ```ts
  // src/hooks/useClock.ts
  import { useEffect, useState } from 'react'
  export function useClock() {
    const [now, setNow] = useState(new Date())
    useEffect(() => { const id = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(id) }, [])
    return now
  }
  ```

- `renderCivil` helper: In the screen modules, we implemented a local helper where needed. You can replicate the pattern from `App.tsx` (using `formatCivilPartsTZ`) or use `Intl.DateTimeFormat` parts like in `LogSearchScreen`.

- Sounds: keep `await sound.enable(); sound.playStart()/playNew()/playStop()` as currently implemented for consistent UX.

## Small Enhancements (optional follow‑ups)

- Make audio unlock non‑blocking for emulated/remote contexts:
  - Replace `await sound.enable()` with a best‑effort `void sound.enable()` and proceed.
  - Optionally pre‑warm `sound.enable()` on first pointerdown at app level.

- Add `<meta name="theme-color" content="#242424">` in `index.html` for better Android Chrome system bars.

- Server‑side entry range filtering endpoint (future):
  - `GET /api/entries?begin=&end=` for Log Search to avoid client-side filtering when datasets grow.

## Quick Reference — Files Touched Recently

- App split + idle prefetch:
  - `src/App.tsx`
  - `src/screens/SettingsScreen.tsx`
  - `src/screens/LogSearchScreen.tsx`

- Styling and theme:
  - `src/index.css`
  - `docs/Styles.md`

- Timezone fix:
  - `src/time.ts`

- API/types updates:
  - `src/api.ts`
  - `server/src/routes/auth.ts` (user settings fields)
  - DB migration scripts:
    - `server/scripts/migrate_add_recent_logs_scope.ts`
    - `server/scripts/migrate_add_search_default_range.ts`

- Analyzer wiring:
  - `vite.config.ts`
  - `package.json` (script `build:analyze`)

## Definition of Done for New Entry Split

1) `src/screens/NewEntryScreen.tsx` exists and compiles.
2) `App.tsx` lazy‑loads New Entry for both `view === 'new'` and `view === 'edit'` branches inside `<Suspense>`.
3) Idle prefetch imports New Entry.
4) Build produces `dist/assets/NewEntryScreen-*.js` and main bundle shrinks modestly.
5) Manual test passes (create/edit flows, scroll restore when returning to Timed Entry from Edit).

When all the above checks pass, we’ll have completed a clean, modular split of the three main screens with improved first-load performance and a clear pattern for future growth.

