import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import '@fontsource/black-han-sans'
import './styles.css'

// ?mediacheck=1: 노래·영화 맞히기 확인 화면 — 노래 미리듣기·지금 차트·영화 이모지 (게임과 따로)
const MediaCheck = React.lazy(() => import('./components/MediaCheck'))
const check = new URLSearchParams(window.location.search).has('mediacheck')

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {check ? (
      <React.Suspense fallback={null}>
        <MediaCheck />
      </React.Suspense>
    ) : (
      <App />
    )}
  </React.StrictMode>,
)
