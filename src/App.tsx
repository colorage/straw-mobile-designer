import { Navigate, Route, Routes } from 'react-router-dom'
import { DesignerPage } from './pages/DesignerPage'
import { GalleryPage } from './pages/GalleryPage'
import { BuyMeACoffeeButton } from './ui/BuyMeACoffeeButton'
import './ui/ui.css'

function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<DesignerPage />} />
        <Route path="/gallery" element={<GalleryPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <BuyMeACoffeeButton />
    </>
  )
}

export default App
