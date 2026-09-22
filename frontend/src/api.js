const API = import.meta.env.VITE_API_URL || ''
export async function request(path, options = {}) {
  const response = await fetch(`${API}${path}`, { ...options, credentials: 'include' })
  if (!response.ok) {
    if (response.status === 401 && !path.startsWith('/api/auth/')) window.dispatchEvent(new Event('propsight-session-expired'))
    const body = await response.json().catch(() => ({}))
    throw new Error(typeof body.detail === 'string' ? body.detail : body.detail?.map(x => x.msg).join(', ') || '요청에 실패했습니다.')
  }
  return response.status === 204 ? null : response.json()
}
export const jsonOptions = (method, data) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
