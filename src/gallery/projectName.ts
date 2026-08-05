/** Matches default auto-names: "project 1", "project 2", … (case-insensitive). */
const PROJECT_NAME_RE = /^project\s+(\d+)$/i

/**
 * Next unused default project name based on existing names.
 * Scans for "project N" and returns `project ${max + 1}` (always lowercase).
 */
export function nextProjectName(existingNames: Iterable<string>): string {
  let max = 0
  for (const name of existingNames) {
    const match = name.trim().match(PROJECT_NAME_RE)
    if (!match) continue
    const n = Number(match[1])
    if (Number.isFinite(n) && n > max) max = n
  }
  return `project ${max + 1}`
}
