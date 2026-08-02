import { useSimulationToggle } from '../physics/useSimulationToggle'
import { useStrawMobileStore } from '../state/store'

/** Build/simulate toggle plus a full reset. */
export function ModeBar() {
  const { mode, startSimulating, stopSimulating } = useSimulationToggle()
  const reset = useStrawMobileStore((s) => s.reset)
  const shapeCount = useStrawMobileStore((s) => s.shapes.length)

  return (
    <div className="panel">
      <h2 className="panel-title">Gravity</h2>
      {mode === 'build' ? (
        <button
          type="button"
          className="primary-button"
          disabled={shapeCount === 0}
          onClick={startSimulating}
        >
          ▶ Simulate Gravity
        </button>
      ) : (
        <button type="button" className="primary-button is-active" onClick={stopSimulating}>
          ■ Back to Build
        </button>
      )}
      <button
        type="button"
        className="ghost-button"
        onClick={() => {
          if (window.confirm('Clear the whole mobile (including the autosaved copy) and start over?'))
            reset()
        }}
      >
        Reset
      </button>
    </div>
  )
}
