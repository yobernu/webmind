import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './dev.css'
import './index.css'
import App from './sidepanel/App'

// Dev harness: renders the side panel at its real width in a normal browser
// tab so the UI can be worked on without reloading the unpacked extension.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <div className="dev-stage">
      <div className="dev-frame">
        <App />
      </div>
      <p className="dev-note">
        Side panel preview — Chrome APIs are unavailable outside the extension.
      </p>
    </div>
  </StrictMode>,
)
