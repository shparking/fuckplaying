import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import '@fontsource/black-han-sans'
import './styles.css'

// ?mediacheck=1: 드라마·영화·노래 맞히기 미리듣기·사진 확인 화면 (게임과 따로)
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
