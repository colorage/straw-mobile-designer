import { copyFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * GitHub Pages serves 404.html for unknown paths. Copying index.html there
 * lets client routes like /gallery work on refresh/deep link.
 */
function spaFallback404Plugin(): Plugin {
  return {
    name: 'spa-fallback-404',
    closeBundle() {
      const outDir = resolve(process.cwd(), 'dist')
      const indexHtml = resolve(outDir, 'index.html')
      const notFoundHtml = resolve(outDir, '404.html')
      if (!existsSync(indexHtml)) return
      copyFileSync(indexHtml, notFoundHtml)
    },
  }
}

/**
 * Production builds left <Physics> stuck on its Suspense fallback (grid only).
 *
 * Vite wraps Physics' dynamic `import('@dimforge/rapier3d-compat')` in a module
 * preload helper; combined with suspend-react inside the R3F Canvas, the
 * boundary never retries after the promise settles.
 *
 * main.tsx awaits Rapier.init() before React mounts. This plugin then makes
 * Physics use the already-initialized static module — no dynamic import, no
 * suspend — so the scene mounts on first paint.
 *
 * Note: upstream @react-three/rapier uses the cache key "@react-thee/rapier"
 * (typo in the library). The replace below matches that string on purpose.
 */
function rapierSyncPhysicsPlugin(): Plugin {
  return {
    name: 'rapier-sync-physics',
    enforce: 'pre',
    transform(code, id) {
      if (!id.includes('@react-three/rapier') || !id.includes('react-three-rapier')) {
        return null
      }
      if (!code.includes('suspend(importRapier')) {
        return null
      }

      let next = code

      if (!next.includes('import * as RapierCompat')) {
        next = next.replace(
          /from '@dimforge\/rapier3d-compat';/,
          `from '@dimforge/rapier3d-compat';\nimport * as RapierCompat from '@dimforge/rapier3d-compat';`,
        )
      }

      next = next.replace(
        /const importRapier = async \(\) => \{\s*let r = await import\('@dimforge\/rapier3d-compat'\);\s*await r\.init\(\);\s*return r;\s*\};/,
        `const importRapier = async () => {
  await RapierCompat.init();
  return RapierCompat;
};`,
      )

      next = next.replace(
        /const rapier = suspend\(importRapier, \["@react-thee\/rapier", importRapier\]\);/,
        // Namespace import (World, JointData, …). Do NOT use `.default` — in the
        // production bundle that can resolve to the init function, and
        // `new rapier.World` then silently kills the scene.
        // Rapier WASM is initialized in main.tsx before React mounts.
        'const rapier = RapierCompat;',
      )

      if (next === code) return null
      return { code: next, map: null }
    },
  }
}

// Site is served from the custom domain root (spider.siaroza.com), not the
// /straw-mobile-designer/ project-pages path — base must be '/' or JS/CSS 404.
export default defineConfig({
  base: '/',
  plugins: [rapierSyncPhysicsPlugin(), react(), spaFallback404Plugin()],
})
