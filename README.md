# Straw Mobile Designer

A browser-based [straw mobile](https://en.wikipedia.org/wiki/Straw_mobile) (himmeli) designer built with React, Three.js, and a real physics engine. Build up a mobile from straws and geometric primitives, tie corners together with thread, and watch gravity hang and balance each piece as soon as it joins the chain from the ceiling hook — just like a real one.

## Features

- **Primitives**: single straw lines, 3-corner pyramids (tetrahedra), 4-corner (square) pyramids, and octahedra — the classic himmeli "diamond".
- **Straw size selector**: `1`, `1/2`, `1/4` scale, applied to newly added shapes.
- **Corner connections**: click a corner, then click another corner (or the ceiling hook) to tie a thread between them.
- **Straws Used panel**: a live count of straws in the design, broken down by size.
- **Live gravity**: physics runs while you build. Free pieces stay put on the workbench until they have a connection path to the ceiling hook; once tied into that chain they become real rigid bodies ([@react-three/rapier](https://github.com/pmndrs/react-three-rapier)) linked by ball-and-socket joints and hang under gravity.

## Tech stack

- [Vite](https://vite.dev/) + React + TypeScript
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

One-time setup after pushing to GitHub: in the repo's **Settings → Pages**, set **Source** to **GitHub Actions**. The site will then be available at:

```
https://<your-github-username>.github.io/straw-mobile-designer/
```
