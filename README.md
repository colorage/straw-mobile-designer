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

This app deploys on **Vercel** via Git integration.

| Branch | Environment | URL |
|--------|-------------|-----|
| `main` | Production | your production domain |
| `preview` | Preview (staging) | https://preview.pavuk.club |
| other feature branches / PRs | Preview | unique `*.vercel.app` URL per deploy |

[`vercel.json`](vercel.json) rewrites all routes to `index.html` so client routes like `/gallery` work on refresh.

### Staging domain (`preview.pavuk.club`)

In the Vercel project:

1. **Settings → Git** — Production Branch = `main`
2. **Settings → Domains** — add `preview.pavuk.club` and assign it to Git branch **`preview`** (not Production)
3. At the `pavuk.club` DNS host, add the record Vercel shows (typically **CNAME** `preview` → `cname.vercel-dns.com`)
4. Wait until the domain status is **Valid** (SSL ready)

### Merge workflow (feature → preview → main)

Do not merge feature work straight into `main`. Promote through staging first.

**1. Branch from `preview`**

```bash
git checkout preview
git pull origin preview
git checkout -b feature/my-change
# ... commit ...
git push -u origin feature/my-change
```

**2. Merge into staging**

1. Open a PR: **`feature/my-change` → `preview`** (not `main`)
2. Use the Vercel Preview URL on the PR for PR-specific checks
3. Merge into `preview`
4. Test the staging site at **https://preview.pavuk.club**

**3. Promote to production**

1. Open a PR: **`preview` → `main`**
2. Review the staging-tested changes
3. Merge into `main` — Vercel deploys Production

**4. Keep `preview` in sync after hotfixes on `main`**

```bash
git checkout preview
git pull origin preview
git merge main
git push origin preview
```