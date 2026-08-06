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
- **Community gallery** (`/community`): publish a mobile from your gallery to a shared, public gallery backed by [Supabase](https://supabase.com/). Browse everyone's published mobiles, sort by **Recent** or **Most liked**, like your favourites (one like per browser), and open any of them in a read-only **preview** (`/community/:id`) — orbit the hanging mobile, like it, then **Duplicate to my gallery** to remix in the full editor. Publishing is anonymous — no account or sign-up; each browser gets a stable anonymous identity so you can update/unpublish your own mobiles and your likes stick. Requires the Supabase setup below; without it these features hide and the app stays fully local.
- **Straws Used panel**: a live count of straws in the design, broken down by size.
- **Live gravity**: physics runs while you build. Free pieces stay put on the workbench until they have a connection path to the ceiling hook; once tied into that chain they become real rigid bodies ([@react-three/rapier](https://github.com/pmndrs/react-three-rapier)) linked by ball-and-socket joints, get a gentle wake nudge, and hang/sway under gravity.
- **Lights & shadows**: directional lighting with cast/receive shadows on straws and a workbench floor (unlit fallback on software WebGL).

## Tech stack

- [Vite](https://vite.dev/) + React + TypeScript
- [React Router](https://reactrouter.com/) for designer (`/`), gallery (`/gallery`), and community (`/community`) pages
- [Supabase](https://supabase.com/) (Postgres + anonymous auth) for the optional community gallery
- [three.js](https://threejs.org/) via [@react-three/fiber](https://docs.pmnd.rs/react-three-fiber) and [@react-three/drei](https://docs.pmnd.rs/drei)
- [@react-three/rapier](https://github.com/pmndrs/react-three-rapier) for physics
- [zustand](https://github.com/pmndrs/zustand) for app state

## Development

```bash
npm install
npm run dev
```

## Community gallery setup (Supabase)

The designer and local gallery work with zero configuration. The community gallery (publish / browse / like) needs a free Supabase project:

1. Create a project at [supabase.com](https://supabase.com/dashboard).
2. Apply the schema in [`supabase/migrations/`](supabase/migrations/) — either paste the migration SQL into the dashboard's SQL editor, or link the repo and push it with the CLI:

   ```bash
   npx supabase link --project-ref <your-project-ref>
   npx supabase db push
   ```

3. Enable **anonymous sign-ins**: Dashboard → Authentication → Sign In / Up → "Allow anonymous sign-ins". (Publishers and likers are identified by a per-browser anonymous user; enable Supabase's built-in CAPTCHA/rate limits if abuse becomes a concern.)
4. Copy [`.env.example`](.env.example) to `.env` and fill in the **Project URL** and **anon/publishable key** from Project Settings → API.
5. For the deployed site, set the same two values as GitHub Actions **repository variables** (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) — the deploy workflow injects them at build time. Both values are public client-side values; access control lives in the database's row-level-security policies.

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

Actions cannot change these settings (the Pages update API returns 403 for workflow tokens), so if they drift the workflow fails with an error pointing here — fix them manually in the UI.

### If the site is stuck on old/broken HTML

1. Open [Settings → Pages](https://github.com/colorage/straw-mobile-designer/settings/pages) and verify: Source = **Deploy from a branch → `gh-pages` / (root)**, custom domain = `spider.siaroza.com` (DNS already points `spider.siaroza.com` → `colorage.github.io`).
2. Open [Actions](https://github.com/colorage/straw-mobile-designer/actions) and cancel any **pages build and deployment** run stuck on `deployment_in_progress`.
3. Re-run **Deploy to GitHub Pages** (Actions → workflow_dispatch) or push to `main`.

Do not give custom workflows the concurrency group `pages` — GitHub's built-in **pages build and deployment** workflow uses that group, so a workflow that holds it while waiting for the site to update blocks the Pages build itself (this caused the past `deployment_in_progress` hangs).

When healthy, https://spider.siaroza.com/ must reference `/assets/*.js` — never `/src/main.tsx`.