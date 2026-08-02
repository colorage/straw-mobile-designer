# Straw Mobile Designer

A browser-based [straw mobile](https://en.wikipedia.org/wiki/Straw_mobile) (himmeli) designer built with React, Three.js, and a real physics engine. Build up a mobile from straws and geometric primitives, tie corners together with thread, then let gravity hang and balance the whole thing — just like a real one.

## Features

- **Primitives**: single straw lines, 3-corner pyramids (tetrahedra), 4-corner (square) pyramids, and octahedra — the classic himmeli "diamond".
- **Straw size selector**: `1`, `1/2`, `1/4` scale, applied to newly added shapes.
- **Corner connections**: click a corner, then click another corner (or the ceiling hook) to tie a thread between them.
- **Straws Used panel**: a live count of straws in the design, broken down by size.
- **Gravity simulation**: toggling "Simulate Gravity" turns every shape into a real rigid body ([@react-three/rapier](https://github.com/pmndrs/react-three-rapier)) connected by ball-and-socket joints at the exact corners you tied together. Gravity pulls the whole assembly down and each piece rotates on its joints until it settles into balance — no custom torque math, just real physics.

## Tech stack

- [Vite](https://vite.dev/) + React + TypeScript
- [three.js](https://threejs.org/) via [@react-three/fiber](https://docs.pmnd.rs/react-three-fiber) and [@react-three/drei](https://github.com/pmndrs/drei)
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

One-time setup after pushing to GitHub: in the repo's **Settings → Pages**, set **Source** to **GitHub Actions**. The site will then be available at:

```
https://<your-github-username>.github.io/straw-mobile-designer/
```
