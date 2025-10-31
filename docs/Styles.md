# Styles Guide

This document tracks UI styling choices and how to apply them across the app. Update it as styles evolve or new patterns emerge.

## Fonts

- Base stack (global): `system-ui, Avenir, Helvetica, Arial, sans-serif` (src/index.css:1–13)
- App container stack: `system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif` (src/App.tsx:16–23)
- iOS zoom prevention: inputs/selects/textarea use font-size ≥ 16px; `.avoidZoom` sets 17px (src/index.css:33–36)


## Colors

Theme
- Dark theme is enforced across the app regardless of OS preference.
  - `:root` uses `color-scheme: dark` and a dark background `#242424`.
  - The previous light-mode `@media (prefers-color-scheme: light)` override was removed.

Brand/accents
- Amber accent `#ffb616`
  - Checkbox/radio `accent-color` (src/index.css:84–88)
  - Clickable day text in logs (src/App.tsx:352–364, 1080s area for search results)
  - Date/time/select input text (multiple inline styles, e.g., src/App.tsx:810, 820, 870s)
  - Weekly/grand total left border (src/index.css:194–201)

Buttons use a glass style tinted by `--btn-color`. Common values and usage:
- Confirm/primary green `#2e7d32`
  - Save (Settings) (src/App.tsx:559–563)
  - Submit (Manual Entry) (src/App.tsx:853–862)
  - Start (when idle) (src/App.tsx:324)
  - Search (Log Search) (src/App.tsx:1129–1134)
- Info/neutral blue `#1976d2`
  - Login (src/App.tsx:488–499)
  - Download CSV when there are no search results (Log Search)
  - Start (when an entry is already active) (src/App.tsx:324)
  
- Brand amber `#ffb616`
  - Download CSV when search results are present (Log Search)
- Danger red `#d32f2f`
  - Stop (timer), Cancel, Logout (src/App.tsx:330–332, 467–469, 846–855, 870s)
- Nav blue `#0d47a1`
  - Drawer navigation items (src/App.tsx:421–461)
- Secondary greys
  - New `#546e7a` (src/App.tsx:336–339)
  - Register `#455a64` (src/App.tsx:515–518)

Surfaces and text
- App dark background `#242424` (src/index.css:7–8)
- Light scheme background `#ffffff` (src/index.css:246–256)
- Inputs borders `rgba(255,255,255,0.35)` and overlay backgrounds `rgba(0,0,0,0.5)` used throughout inline styles
- Text: `#fff` for inverted text; errors use `crimson` (e.g., auth/settings error states)

## Buttons (Glass + 3D)

- Classes: `btn3d` (elevation/press) and `btn-glass` (frosted/tinted surface)
  - 3D effect: box-shadow and translate on press (src/index.css:39–50)
  - Glass effect: backdrop blur + subtle top gradient (src/index.css:53–74)
  - Focus: outline uses a mix of `--btn-color` (src/index.css:75–78)
- Tinting: supply `--btn-color` inline to color the button, e.g.
  - `style={{ ...btnStyle, color: '#fff', ['--btn-color' as any]: '#2e7d32' }}`
  - Conditional example (CSV on Log Search): `['--btn-color']: results.length > 0 ? '#ffb616' : '#1976d2'`
- Press state: add `btn3d-pressed` programmatically to maintain pressed look (e.g., active Start button) (src/App.tsx:323, 330)

## Layout

- Container width: max 520px, centered with page padding (src/App.tsx:16–23)
- Auth screens: full-viewport background image `/bg/login-1080x1920.jpg` (src/App.tsx:24–31, public/bg)
- Logs grid
  - Portrait grid areas: day · start · stop · total (src/index.css:143–151)
  - Landscape adds `notes` column and expands to full viewport width via `.logsWide` (src/index.css:166–183)
  - Totals rows styled as full-width section headers (src/index.css:190–202)
- Form controls (consistent cross‑browser sizing)
  - `.timeField` for time inputs (44px tall) (src/index.css:91–110)
  - `.pickField` for date/select controls (45px tall) (src/index.css:113–126)
  - `.avoidZoom` to prevent iOS focus zoom (src/index.css:33–36)

## Animations

- Button press transition: `btn3d` transforms and shadow (src/index.css:39–50)
- Active timer pulse: `.pulse` animates opacity at ~2 Hz on active Start cells (src/index.css:128–138; used at src/App.tsx:356–365)
- Row flash highlight when returning from Edit: `.flash-highlight` one‑shot background fade (src/index.css:213–220; applied in LogSearchScreen, src/App.tsx:1049–1060)
- Template/demo: `logo-spin` (not used in the app UI) (src/App.css:22–33)

## Sound

- WebAudio click feedback in `src/sound.ts`
  - LocalStorage key: `button_sounds` (src/sound.ts:5, 13–20, 23–27)
  - API: `sound.enable()`, `sound.isEnabled()`, `sound.setEnabled(v)` (src/sound.ts:62–73)
  - Actions: `playStart` (confirm), `playStop` (destructive), `playNew` (neutral) (src/sound.ts:68–71)
  - Hooked across UI on primary actions (e.g., Start/Stop/New, Save, Search, CSV)
- Settings toggle: “Button Sounds” checkbox controls persistence (src/App.tsx:548–555)

## How to add a new tinted glass button

1) Use class names `btn3d btn-glass`.
2) Set white label text and the tint variable:
   `style={{ ...btnStyle, color: '#fff', ['--btn-color' as any]: '#HEX' }}`
3) For programmatic pressed state, add `btn3d-pressed` to the class list when appropriate.
4) Wire up sounds for UX consistency:
   - Confirm/positive: `sound.playStart()`
   - Destructive: `sound.playStop()`
   - Neutral/navigation: `sound.playNew()`

## Notes

- Input borders and various overlays use semi‑transparent white (`rgba(255,255,255,0.35)` / `rgba(255,255,255,0.5)`) for the dark theme.
- Media queries prefer reduced motion and light/dark scheme adjustments per user settings.
