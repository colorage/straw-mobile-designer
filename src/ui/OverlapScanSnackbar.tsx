import { useStrawMobileStore } from '../state/store'

/** Bottom-center snackbar while the overlap proximity scanner is awake. */
export function OverlapScanSnackbar() {
  const scanUi = useStrawMobileStore((s) => s.overlapScanUi)

  if (!scanUi?.active) return null

  const { connectionsFound, sleepProgress } = scanUi
  const label =
    connectionsFound === 1
      ? '1 connection found'
      : `${connectionsFound} connections found`

  return (
    <div className="hud-cluster hud-bottom-center" aria-live="polite">
      <div className="hud-scan-snackbar">
        <p className="hud-scan-snackbar-label">{label}</p>
        <div
          className="hud-scan-snackbar-track"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(sleepProgress * 100)}
          aria-label="Time until scanner sleep"
        >
          <div
            className="hud-scan-snackbar-fill"
            style={{ width: `${Math.max(0, Math.min(1, sleepProgress)) * 100}%` }}
          />
        </div>
      </div>
    </div>
  )
}
