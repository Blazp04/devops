import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MotionConfig } from 'motion/react'
// Order matters: tokens + fonts + base → kit areas → site pages.
import './styles/global.css'
import './kit/sketch/sketch.css'
import './kit/doodles/doodles.css'
import './kit/text/text.css'
import './kit/interactive/interactive.css'
import './kit/diagram/diagram.css'
import './styles/pages.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MotionConfig reducedMotion="user">
      <App />
    </MotionConfig>
  </StrictMode>,
)
