# Straw Mobile Designer

A browser-based [straw mobile](https://en.wikipedia.org/wiki/Straw_mobile) (himmeli) designer built with React, Three.js, and a real physics engine. Build up a mobile from straws and geometric primitives, tie corners together with thread, and watch gravity hang and balance each piece as soon as it joins the chain from the ceiling hook — just like a real one.

## Features

- **Primitives**: single straw lines, triangles (3 straws), 3-corner pyramids (tetrahedra), squares (4 straws), 4-corner (square) pyramids, and octahedra — the classic himmeli "diamond".
- **Scissors tool**: click a straw to remove it; prebuilt shapes are deleted entirely, while a fused loop is cut one straw at a time (the rest re-stiffens if it is still closed).
- **Straw size selector**: `1`, `1/2`, `1/4` scale, applied to newly added shapes.
- **Corner connections**: click a corner, then click another corner (or the ceiling hook) to tie a thread between them. Hold two corners overlapping for ~1 second to auto-connect — including free ends of hanging pieces once they settle (hub spokes already tied to the same corner are ignored). Toggle auto-connect with the magnet button (top-right, left of the theme switcher).
- **Rigid loops**: when hand-tied straws close a loop (a triangle, a square, a pyramid face), the loop is fused into one rigid piece so it hangs as steadily as the equivalent prebuilt shape instead of wobbling on its thread joints. A simple loop also snaps to its regular shape on fusing — four equal straws become a true square rather than a frozen parallelogram, two solid plus two 1/2 straws a rectangle, five equal straws a regular pentagon, and so on (braced or 3D builds keep the shape you gave them). Mixed-size pieces remember each straw's size for the inventory and scissors. Toggle with the braced-frame button (top-right); switching it back on also stiffens loops you already built, and undo un-fuses.
- **Undo / Redo**: reverse or re-apply design edits (add/remove shapes, connections, moves, straw size, reset, gallery load) via the Project panel or Ctrl/Cmd+Z / Ctrl/Cmd+Shift+Z.
- **Gallery** (`/gallery`): named local saves with thumbnails; the current project is saved automatically on every edit and when opening the gallery. Browse/load/import/export/delete on the gallery page, plus **New** to clear the draft and start fresh in the designer.
- **Straws Used panel**: a live count of straws in the design, broken down by size.
- **Live gravity**: physics runs while you build. Free pieces stay put on the workbench until they have a connection path to the ceiling hook; once tied into that chain they become real rigid bodies ([@react-three/rapier](https://github.com/pmndrs/react-three-rapier)) linked by ball-and-socket joints, get a gentle wake nudge, and hang/sway under gravity.
- **Lights & shadows**: directional lighting with cast/receive shadows on straws and a workbench floor (unlit fallback on software WebGL).

## Tech stack

- [Vite](https://vite.dev/) + React + TypeScript
- [React Router](https://reactrouter.com/) for designer (`/`) and gallery (`/gallery`) pages
- [three.js](https://threejs.org/) via [@react-three/fiber](https://docs.pmnd.rs/react-three-fiber) and [@react-three/drei](https://docs.pmnd.rs/drei)
- [@react-three/rapier](https://github.com/pmndrs/react-three-rapier) for physics
- [zustand](https://github.com/pmndrs/zustand) for app state

## Development

```bash
npm install
npm run dev
```

## Building

```bash
npm run build
```

## Deployment

This repo deploys to GitHub Pages automatically via [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) on every push to `main`.

The workflow builds the Vite app and publishes the `dist/` output to the **`gh-pages`** branch. Pages must serve that branch — **not** `main` (serving `main` publishes raw `/src/main.tsx` and breaks the app).

In **Settings → Pages**:
- **Source**: Deploy from a branch
- **Branch**: `gh-pages` / `/` (root)
- **Custom domain**: `spider.siaroza.com`

Leave it on `gh-pages`; do not point Pages at `main`.

### If the site is stuck on old/broken HTML

GitHub Pages can latch on `status: errored` with a ghost `in_progress` deployment. Actions cannot change Pages settings (API returns 403), so unlock it in the UI:

1. Open [Deployments → github-pages](https://github.com/colorage/straw-mobile-designer/deployments/activity_log?environments_filter=github-pages) and delete any **in progress** / failed rows.
2. Open [Settings → Pages](https://github.com/colorage/straw-mobile-designer/settings/pages):
   - Remove the custom domain and save
   - Set Source to **None** / disable Pages if shown, save, wait ~30s
   - Set Source back to **Deploy from a branch → `gh-pages` / (root)**
   - Re-add `spider.siaroza.com`, wait for DNS/HTTPS to go green
3. Re-run **Deploy to GitHub Pages** (Actions → workflow_dispatch) or push an empty commit to `main`.

When healthy, https://spider.siaroza.com/ must reference `/assets/*.js` — never `/src/main.tsx`.