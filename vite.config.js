import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
export default defineConfig({
  plugins: [react()],
  build: {
    // 글꼴 조각(woff/woff2)은 CSS 안에 base64 로 넣지 않고 파일로 둠 → 필요한 글자 조각만 내려받음
    assetsInlineLimit: (file) => (/\.(woff2?|ttf|otf)$/.test(file) ? false : undefined),
  },
})
