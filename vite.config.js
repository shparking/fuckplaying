import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'
export default defineConfig({
  plugins: [react()],
  build: {
    // 글꼴 조각(woff/woff2)은 CSS 안에 base64 로 넣지 않고 파일로 둠 → 필요한 글자 조각만 내려받음
    assetsInlineLimit: (file) => (/\.(woff2?|ttf|otf)$/.test(file) ? false : undefined),
    rollupOptions: {
      // 게임(index.html) + 3D 수달 말 예시(otter.html)
      input: { main: resolve(__dirname, 'index.html'), otter: resolve(__dirname, 'otter.html') },
    },
  },
})
