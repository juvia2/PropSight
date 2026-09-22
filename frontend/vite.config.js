import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => ({
  plugins: [react(), {
    name: 'local-map-diagnostics',
    configureServer(server) {
      server.middlewares.use('/__map-status', async (req, res) => {
        const key = loadEnv(mode, process.cwd(), 'VITE_').VITE_KAKAO_APP_KEY
        const origin = req.headers.host === '127.0.0.1:5173' ? 'http://127.0.0.1:5173' : 'http://localhost:5173'
        let result = { code: 'missing_key', message: 'frontend/.env.local에 JavaScript 키를 입력하세요.' }
        if (key && key !== 'YOUR_KAKAO_APP_KEY') {
          try {
            const response = await fetch(`https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(key)}&libraries=drawing,services&autoload=false`, { headers: { Referer: `${origin}/` }, signal: AbortSignal.timeout(7000) })
            const body = response.ok ? '' : await response.text()
            if (response.ok) result = { code: 'ok', message: '카카오 인증은 정상입니다. 네트워크 또는 브라우저 차단 설정을 확인하고 다시 연결하세요.' }
            else if (body.includes('disabled OPEN_MAP_AND_LOCAL')) result = { code: 'service_disabled', message: '카카오맵 서비스가 꺼져 있습니다. 카카오 개발자 콘솔 → PropSight 앱 → 카카오맵 → 사용 설정을 활성화한 뒤 다시 연결하세요.' }
            else if (body.includes('domain mismatched')) result = { code: 'domain_mismatch', message: `JavaScript SDK 도메인에 ${origin}을 등록한 뒤 다시 연결하세요.` }
            else result = { code: 'authorization_failed', message: `카카오 인증 실패 (HTTP ${response.status}). JavaScript 키와 앱의 사용 권한을 확인하세요.` }
          } catch { result = { code: 'network_error', message: '카카오 서버에 연결할 수 없습니다. 네트워크를 확인한 뒤 다시 연결하세요.' } }
        }
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.setHeader('Cache-Control', 'no-store')
        res.end(JSON.stringify(result))
      })
    },
  }],
  server: { host: '127.0.0.1', port: 5173, strictPort: true, proxy: { '/api': 'http://127.0.0.1:8000' } },
}))
