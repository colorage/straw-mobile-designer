import { Analytics } from '@vercel/analytics/react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { CommunityPage } from './pages/CommunityPage'
import { DesignerPage } from './pages/DesignerPage'
import { GalleryPage } from './pages/GalleryPage'
import { PreviewPage } from './pages/PreviewPage'
import { BuyMeACoffeeButton } from './ui/BuyMeACoffeeButton'
import './ui/ui.css'

function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<DesignerPage />} />
        <Route path="/gallery" element={<GalleryPage />} />
        <Route path="/community/:id" element={<PreviewPage />} />
        <Route path="/community" element={<CommunityPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <BuyMeACoffeeButton />
      <Analytics />
    </>
  )
}

export default App
