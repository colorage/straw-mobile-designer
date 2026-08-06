import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './gallery/accountSync'
import './gallery/autoPersist'
import './index.css'
import App from './App.tsx'
import { ensureRapier } from './physics/initRapier'
import './state/themeStore'

// themeStore applies the persisted dark/light preference on import.

const root = document.getElementById('root')!

ensureRapier()
  .then(() => {
    createRoot(root).render(
      <StrictMode>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </StrictMode>,
    )
  })
  .catch((error: unknown) => {
    console.error('Failed to load physics engine', error)
    root.textContent =
      'Failed to load the physics engine. Check the browser console and reload.'
  })
