import { Experience } from './scene/Experience'
import { ConnectionHint } from './ui/ConnectionHint'
import { ModeBar } from './ui/ModeBar'
import { SaveStatus } from './ui/SaveStatus'
import { ShapesList } from './ui/ShapesList'
import { SizeSelector } from './ui/SizeSelector'
import { StrawInventory } from './ui/StrawInventory'
import { Toolbar } from './ui/Toolbar'
import './ui/ui.css'

function App() {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <h1 className="app-title">Straw Mobile Designer</h1>
        <p className="app-subtitle">
          Build a himmeli-style straw mobile, then let gravity hang and balance it.
        </p>
        <SaveStatus />
        <Toolbar />
        <SizeSelector />
        <ShapesList />
        <StrawInventory />
        <ModeBar />
        <ConnectionHint />
      </aside>
      <main className="canvas-area">
        <Experience />
      </main>
    </div>
  )
}

export default App
