import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// StrictMode disabled - causes double WebSocket connections in dev
// which breaks our event streaming. The dedup logic handles it but
// the timing is fragile. Production doesn't use StrictMode anyway.
createRoot(document.getElementById('root')!).render(<App />)
