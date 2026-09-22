import { useEffect, useState } from 'react'
import { request, jsonOptions } from './api'

export default function AuthGate({ children }) {
  const [user, setUser] = useState(null)
  const [checking, setChecking] = useState(true)
  const [mode, setMode] = useState('login')
  const [teamMode, setTeamMode] = useState('new')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [invite, setInvite] = useState('')
  useEffect(() => {
    let alive = true
    request('/api/auth/me').then(value => { if (alive) setUser(value) }).catch(() => {}).finally(() => { if (alive) setChecking(false) })
    const expired = () => { setUser(null); setInvite(''); setError('세션이 만료되었습니다. 다시 로그인하세요.') }
    window.addEventListener('propsight-session-expired', expired)
    return () => { alive = false; window.removeEventListener('propsight-session-expired', expired) }
  }, [])
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError('')
    const values = Object.fromEntries(new FormData(event.currentTarget))
    try {
      const result = await request(`/api/auth/${mode === 'login' ? 'login' : 'register'}`, jsonOptions('POST', values))
      setUser(result.user); setInvite(result.invite_code || '')
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }
  async function logout() {
    setBusy(true)
    try { await request('/api/auth/logout', { method: 'POST' }); setUser(null); setInvite(''); setError('') }
    catch (e) { setError(e.message) } finally { setBusy(false) }
  }
  async function issueInvite() {
    if (!window.confirm('새 초대 코드를 발급하면 이전 초대 코드는 사용할 수 없습니다. 계속할까요?')) return
    try { const result = await request('/api/team/invite', { method: 'POST' }); setInvite(result.invite_code) }
    catch (e) { setError(e.message) }
  }
  if (checking) return <div className="auth-page"><p>로그인 상태 확인 중…</p></div>
  if (user) return <><div className="account-bar"><span><strong>{user.team_name}</strong> · {user.display_name} <small>@{user.username}</small></span><div>{user.is_team_admin && <button onClick={issueInvite}>팀 초대 코드 발급</button>}<button disabled={busy} onClick={logout}>로그아웃</button></div></div>{invite && <div className="invite-banner"><strong>팀 초대 코드</strong><code>{invite}</code><span>팀원에게 전달하세요. 코드는 이 화면을 닫으면 다시 표시되지 않습니다.</span><button onClick={() => setInvite('')}>닫기</button></div>}{error && <p role="alert" className="error">{error}</p>}{children(user)}</>
  return <div className="auth-page"><section className="auth-card"><a className="brand" href="/">▦ <span>PropSight<small>COMMERCIAL REAL ESTATE</small></span></a><h1>팀의 현장 기록을 한곳에</h1><p>내 계정으로 기록하고, 팀과 작성자별로 살펴보세요.</p><div className="auth-tabs"><button aria-pressed={mode === 'login'} onClick={() => { setMode('login'); setError('') }}>로그인</button><button aria-pressed={mode === 'register'} onClick={() => { setMode('register'); setError('') }}>계정 만들기</button></div><form onSubmit={submit} key={`${mode}-${teamMode}`}><fieldset disabled={busy}><label>직원 아이디<input name="username" required pattern="[a-zA-Z0-9_.\-]{3,50}" minLength={3} maxLength={50} autoComplete="username" placeholder="영문·숫자·밑줄·점·하이픈, 3~50자" /></label><label>비밀번호<input name="password" type="password" required minLength={8} maxLength={128} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} placeholder="8자 이상" /></label>{mode === 'register' && <><label>직원 이름<input name="display_name" required maxLength={100} autoComplete="name" /></label><label>팀 가입 방식<select value={teamMode} onChange={e => setTeamMode(e.target.value)}><option value="new">새 팀 만들기</option><option value="join">초대 코드로 기존 팀 가입</option></select></label>{teamMode === 'new' ? <label>팀 이름<input name="team_name" required maxLength={100} placeholder="예: 리테일 1팀" /></label> : <label>팀 초대 코드<input name="invite_code" required maxLength={200} placeholder="팀 생성자에게 받은 코드" /></label>}</>}<button className="auth-submit" type="submit">{busy ? '처리 중…' : mode === 'login' ? '로그인' : '계정 만들기'}</button></fieldset></form>{error && <p role="alert" className="error">{error}</p>}<p className="hint">기록은 로그인한 직원끼리 공유하며 수정·삭제는 작성자만 가능합니다.</p></section></div>
}
