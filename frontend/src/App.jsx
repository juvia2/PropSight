import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import AuthGate from './AuthGate'
import LocationSearch from './LocationSearch'
import { request, jsonOptions } from './api'

const formatCreatedAt = value => value ? new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value)) : '날짜 미기록'
const formatSavedAt = value => new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(value))
const CATEGORIES = ['개발계획', '상권분석', '진행매물']
const COLORS = { 개발계획: '#7970cb', 상권분석: '#168b80', 진행매물: '#d38b36' }
const HAS_MAP_KEY = Boolean(import.meta.env.VITE_KAKAO_APP_KEY && import.meta.env.VITE_KAKAO_APP_KEY !== 'YOUR_KAKAO_APP_KEY')
export default function App() {
  return <AuthGate>{user => <Dashboard user={user} />}</AuthGate>
}

function Dashboard({ user }) {
  const [items, setItems] = useState([])
  const [directory, setDirectory] = useState({ teams: [], users: [] })
  const [teamFilter, setTeamFilter] = useState('')
  const [authorFilter, setAuthorFilter] = useState('')
  const [active, setActive] = useState(CATEGORIES)
  const [category, setCategory] = useState(CATEGORIES[0])
  const [name, setName] = useState('')
  const [memo, setMemo] = useState('')
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('API 연결 중')
  const [error, setError] = useState('')
  const [mapStatus, setMapStatus] = useState(() => HAS_MAP_KEY ? 'loading' : 'key')
  const [mapError, setMapError] = useState('')
  const [drawing, setDrawing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [pending, setPending] = useState(null)
  const [editing, setEditing] = useState(null)
  const [revisions, setRevisions] = useState([])
  const [revisionStatus, setRevisionStatus] = useState('loading')
  const mapNode = useRef(null)
  const map = useRef(null)
  const manager = useRef(null)
  const draft = useRef(null)
  const submitRef = useRef(null)
  const visible = useMemo(() => items.filter(x => active.includes(x.properties.category) && (!teamFilter || String(x.properties.team_id) === teamFilter) && (!authorFilter || String(x.properties.created_by) === authorFilter) && `${x.properties.name} ${x.properties.memo}`.toLowerCase().includes(search.toLowerCase())), [items, active, search, teamFilter, authorFilter])

  const reload = useCallback(async () => {
    try {
      const collections = await Promise.all(['properties', 'commercial_blocks'].map(async resource => {
        const data = await request(`/api/${resource}`)
        return data.features.map(item => ({ ...item, resource }))
      }))
      const people = await request('/api/directory')
      setDirectory(people); setItems(collections.flat()); setStatus('PostGIS 연결됨')
    } catch (e) { setStatus('API 연결 실패'); setError(e.message) }
  }, [])
  // State updates in reload occur only after the network response.
  // oxlint-disable-next-line react/set-state-in-effect
  useEffect(() => { reload() }, [reload])

  const saveDraft = useCallback(async payload => {
    setBusy(true); setError('')
    try {
      const resource = payload.geometry.type === 'Point' ? 'properties' : 'commercial_blocks'
      const feature = await request(`/api/${resource}`, jsonOptions('POST', payload))
      setItems(previous => [{ ...feature, resource }, ...previous])
      setPending(null); setDrawing(false); setName(''); setMemo('')
    } catch (e) { setError(e.message); setPending(payload) }
    finally { setBusy(false) }
  }, [])
  useEffect(() => { submitRef.current = saveDraft }, [saveDraft])

  useEffect(() => {
    let disposed = false
    let initialized = false
    if (!HAS_MAP_KEY) return
    const diagnose = async () => {
      try {
        const response = await fetch('/__map-status')
        const data = await response.json()
        if (!disposed) setMapError(data.message)
      } catch { if (!disposed) setMapError('앱 키, 카카오맵 사용 설정, 등록 도메인과 네트워크를 확인하세요.') }
    }
    const initialize = () => {
      if (disposed || initialized || !window.kakao?.maps?.load) return
      initialized = true
      window.kakao.maps.load(() => {
        if (disposed) return
        const k = window.kakao.maps
        if (!k.drawing) { setMapStatus('error'); return }
        map.current = new k.Map(mapNode.current, { center: new k.LatLng(37.5446, 127.0559), level: 4 })
        const m = new k.drawing.DrawingManager({ map: map.current, drawingMode: [k.drawing.OverlayType.MARKER, k.drawing.OverlayType.POLYGON], guideTooltip: ['draw', 'drag', 'edit'], markerOptions: { draggable: false, removable: false }, polygonOptions: { draggable: false, removable: false, editable: false, strokeWeight: 3, strokeColor: COLORS[CATEGORIES[0]], fillColor: COLORS[CATEGORIES[0]], fillOpacity: 0.2 } })
        manager.current = m
        m.addListener('drawend', e => {
          const type = e.overlayType
          const data = m.getData()[type]?.at(-1)
          if (!data || !draft.current) return
          let geometry
          if (type === 'marker') geometry = { type: 'Point', coordinates: [data.x, data.y] }
          else {
            const ring = data.points.map(p => [p.x, p.y])
            if (JSON.stringify(ring[0]) !== JSON.stringify(ring.at(-1))) ring.push([...ring[0]])
            geometry = { type: 'Polygon', coordinates: [ring] }
          }
          const payload = { ...draft.current, geometry }
          draft.current = null
          m.remove(e.target); m.cancel()
          setDrawing(false); setPending(payload)
          submitRef.current(payload)
        })
        setMapStatus('ready')
      })
    }
    initialize()
    const interval = setInterval(initialize, 200)
    const timeout = setTimeout(() => { if (!map.current) { setMapStatus('error'); diagnose() }; clearInterval(interval) }, 15000)
    return () => { disposed = true; clearInterval(interval); clearTimeout(timeout); manager.current?.cancel(); manager.current = null; map.current = null }
  }, [])

  useEffect(() => {
    if (mapStatus !== 'ready' || !map.current) return
    const k = window.kakao.maps
    const overlays = visible.map(item => {
      const color = COLORS[item.properties.category]
      if (item.geometry.type === 'Point') {
        const button = document.createElement('button')
        button.className = 'map-pin'; button.style.background = color; button.title = item.properties.name; button.textContent = '●'
        button.onclick = () => setEditing(item)
        const [lng, lat] = item.geometry.coordinates
        return new k.CustomOverlay({ map: map.current, position: new k.LatLng(lat, lng), content: button, yAnchor: 1 })
      }
      const polygon = new k.Polygon({ map: map.current, path: item.geometry.coordinates.map(ring => ring.map(([lng, lat]) => new k.LatLng(lat, lng))), strokeWeight: 3, strokeColor: color, fillColor: color, fillOpacity: 0.2 })
      k.event.addListener(polygon, 'click', () => setEditing(item))
      return polygon
    })
    return () => overlays.forEach(overlay => overlay.setMap(null))
  }, [visible, mapStatus])

  const editingResource = editing?.resource
  const editingId = editing?.id
  useEffect(() => {
    if (!editingResource || !editingId) return
    let cancelled = false
    // oxlint-disable-next-line react/set-state-in-effect
    setRevisionStatus('loading')
    request(`/api/${editingResource}/${editingId}/revisions`)
      .then(data => { if (!cancelled) { setRevisions(data); setRevisionStatus('ready') } })
      .catch(() => { if (!cancelled) setRevisionStatus('error') })
    return () => { cancelled = true }
  }, [editingResource, editingId])

  function startDrawing(type) {
    if (!name.trim()) { setError('기록할 장소나 구역의 이름을 먼저 입력하세요.'); return }
    setTeamFilter(''); setAuthorFilter(''); setError(''); draft.current = { name: name.trim(), memo, category }
    setActive(previous => previous.includes(category) ? previous : [...previous, category])
    manager.current.setStyle(window.kakao.maps.drawing.OverlayType.POLYGON, 'strokeColor', COLORS[category])
    manager.current.setStyle(window.kakao.maps.drawing.OverlayType.POLYGON, 'fillColor', COLORS[category])
    manager.current.select(window.kakao.maps.drawing.OverlayType[type]); setDrawing(true)
  }
  function cancelDrawing() { manager.current?.cancel(); draft.current = null; setDrawing(false) }
  function focus(item) {
    if (map.current) {
      const p = item.geometry.type === 'Point' ? item.geometry.coordinates : item.geometry.coordinates[0][0]
      map.current.panTo(new window.kakao.maps.LatLng(p[1], p[0]))
    }
    setEditing(item)
  }
  async function updateItem(event) {
    event.preventDefault(); setBusy(true); setError('')
    const values = Object.fromEntries(new FormData(event.currentTarget))
    try {
      const result = await request(`/api/${editing.resource}/${editing.id}`, jsonOptions('PUT', { ...values, geometry: editing.geometry }))
      setItems(previous => previous.map(x => x.resource === editing.resource && x.id === editing.id ? { ...result, resource: x.resource } : x))
      setEditing(previous => ({ ...result, resource: previous.resource }))
      try {
        setRevisions(await request(`/api/${editing.resource}/${editing.id}/revisions`))
        setRevisionStatus('ready')
      } catch { setRevisionStatus('error') }
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }
  async function deleteItem() {
    if (!window.confirm(`“${editing.properties.name}” 기록을 삭제할까요?`)) return
    setBusy(true); setError('')
    try {
      await request(`/api/${editing.resource}/${editing.id}`, { method: 'DELETE' })
      setItems(previous => previous.filter(x => !(x.resource === editing.resource && x.id === editing.id))); setEditing(null)
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }

  return <div className="app">
    <header><a className="brand" href="/">▦ <span>PropSight<small>COMMERCIAL REAL ESTATE</small></span></a><div className="workspace">서울 · 성수 <span>임장 워크스페이스</span></div><span className={`connection ${status.includes('실패') ? 'offline' : ''}`}>● {status}</span></header>
    <main>
      <section className="heading"><div><div className="eyebrow">YOUR NEXT OPPORTUNITY, MAPPED.</div><h1>도시의 변화를 읽는 지도</h1><p>개발 동향부터 현장 매물까지, 한곳에서 기록하고 살펴보세요.</p></div><button className="refresh" onClick={() => { setError(''); reload() }}>↻ 데이터 새로고침</button></section>
      <section className="filterbar"><span className="filter-label">지도 레이어</span><div className="toggles" role="group" aria-label="지도 카테고리 필터">{CATEGORIES.map(c => <button key={c} aria-pressed={active.includes(c)} className={active.includes(c) ? 'selected' : ''} style={{ '--category': COLORS[c] }} onClick={() => setActive(previous => previous.includes(c) ? previous.filter(x => x !== c) : [...previous, c])}><i />{c}<b>{items.filter(x => x.properties.category === c).length}</b></button>)}</div><span className="filter-count">현재 표시 <strong>{visible.length}</strong>건</span></section>
      <section className="people-filters" aria-label="팀과 작성자 필터"><label>팀별 조회<select value={teamFilter} onChange={e => { setTeamFilter(e.target.value); setAuthorFilter('') }}><option value="">전체 팀</option>{directory.teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label><label>작성자별 조회<select value={authorFilter} onChange={e => setAuthorFilter(e.target.value)}><option value="">전체 직원</option>{directory.users.filter(u => !teamFilter || String(u.team_id) === teamFilter).map(u => <option key={u.id} value={u.id}>{u.display_name} (@{u.username})</option>)}</select></label><button className="refresh" onClick={() => { setTeamFilter(String(user.team_id)); setAuthorFilter('') }}>내 팀</button><button className="refresh" onClick={() => { setTeamFilter(String(user.team_id)); setAuthorFilter(String(user.id)) }}>내 기록</button><button className="refresh" onClick={() => { setTeamFilter(''); setAuthorFilter('') }}>전체 보기</button></section>
      {error && <div role="alert" className="error">{error}<button onClick={() => setError('')}>닫기</button></div>}
      <div className="dashboard"><aside>
        <div className="panel-title"><h2>현장 기록</h2><span>NEW RECORD</span></div>
        <p className="author-label">작성자: {user.team_name} · {user.display_name} (@{user.username})</p><fieldset disabled={drawing || busy || !!pending}><label>저장 카테고리<select value={category} onChange={e => setCategory(e.target.value)}>{CATEGORIES.map(c => <option key={c}>{c}</option>)}</select></label><label>장소 · 구역 이름<input maxLength={200} placeholder="예: 성수역 북측 개발 예정지" value={name} onChange={e => setName(e.target.value)} /></label><label>임장 메모<textarea maxLength={10000} placeholder="유동 인구, 입지 특성, 확인할 사항…" value={memo} onChange={e => setMemo(e.target.value)} /></label><div className="draw-buttons"><button disabled={mapStatus !== 'ready'} onClick={() => startDrawing('MARKER')}>⌖ 핀 찍기</button><button disabled={mapStatus !== 'ready'} onClick={() => startDrawing('POLYGON')}>⬡ 구역 그리기</button></div></fieldset>
        <p className="hint">선택한 카테고리로 그리기 완료 시 자동 저장됩니다. 다각형은 마우스 오른쪽 클릭으로 완성하세요.</p>
        {drawing && <button className="cancel" onClick={cancelDrawing}>그리기 취소</button>}
        {busy && <p role="status">저장 중…</p>}
        {pending && !busy && <div className="retry"><p>저장하지 못한 도형이 있습니다.</p><button onClick={() => saveDraft(pending)}>다시 저장</button><button onClick={() => setPending(null)}>버리기</button></div>}
        <div className="records"><div className="panel-title"><h2>저장한 장소</h2><span>{visible.length}건</span></div><input aria-label="기록 검색" placeholder="이름 또는 메모 검색" value={search} onChange={e => setSearch(e.target.value)} />
        <div className="record-list">{visible.length ? visible.map(item => <button className="record" key={`${item.resource}-${item.id}`} onClick={() => focus(item)}><span className="record-icon" style={{ color: COLORS[item.properties.category] }}>{item.geometry.type === 'Point' ? '⌖' : '⬡'}</span><span><span className="record-meta"><small style={{ color: COLORS[item.properties.category] }}>{item.properties.category}</small><time dateTime={item.properties.created_at || undefined}>{formatCreatedAt(item.properties.created_at)}</time></span><strong>{item.properties.name}</strong><p>{item.properties.memo || '메모 없음'}</p><small className="record-author">{item.properties.team_name} · {item.properties.author_name} {item.properties.author_username ? `(@${item.properties.author_username})` : ''}</small></span><span>›</span></button>) : <div className="empty"><span>⌖</span><p>{items.length ? '표시할 기록이 없습니다.' : '아직 저장한 장소가 없습니다.'}</p><small>핀과 구역으로 첫 현장 기록을 남겨보세요.</small></div>}</div></div>
      </aside><section className="map-panel" aria-label="카카오 지도"><div ref={mapNode} className="map" /><LocationSearch map={map} enabled={mapStatus === 'ready'} drawing={drawing || busy || !!pending} />{mapStatus !== 'ready' && <div className="map-placeholder"><div className="map-grid" /><div className="setup"><span className="setup-icon">▦</span><div className="eyebrow">CONNECT YOUR MAP</div><h2>{mapStatus === 'loading' ? '지도를 불러오는 중입니다' : '카카오맵을 연결해 주세요'}</h2><p>JavaScript 앱 키를 설정하면<br />이곳에서 장소와 상권을 지도에 기록할 수 있습니다.</p><code>frontend/.env.local · VITE_KAKAO_APP_KEY</code><small>사이트 도메인: http://localhost:5173</small>{mapStatus === 'error' && <p role="alert">{mapError || '지도 연결 실패 원인을 확인하는 중입니다…'}</p>}{mapStatus === 'error' && <button className="refresh" onClick={() => window.location.reload()}>지도 다시 연결</button>}</div></div>}<div className="map-tag">SEOUL <span>성수동 일대</span></div><div className="map-legend">{CATEGORIES.map(c => <span key={c}><i style={{ background: COLORS[c] }} />{c}</span>)}</div></section></div>
      <footer>PropSight <span>현장에서 발견하고, 지도에 기록하세요.</span><span>좌표계 WGS 84 · PostGIS</span></footer>
    </main>
    {editing && <div className="modal-backdrop"><section className="modal" role="dialog" aria-modal="true" aria-label="기록 수정"><div className="panel-title"><h2>{editing.properties.created_by === user.id ? '현장 기록 수정' : '현장 기록 보기'}</h2><button disabled={busy} onClick={() => setEditing(null)}>✕</button></div><p className="author-label">작성 날짜: <time dateTime={editing.properties.created_at || undefined}>{formatCreatedAt(editing.properties.created_at)}</time> · {editing.properties.team_name} · {editing.properties.author_name} {editing.properties.author_username ? `(@${editing.properties.author_username})` : ''}</p><form key={`${editing.resource}-${editing.id}`} onSubmit={updateItem}><fieldset disabled={busy || editing.properties.created_by !== user.id}><label>이름<input name="name" required maxLength={200} defaultValue={editing.properties.name} /></label><label>카테고리<select name="category" defaultValue={editing.properties.category}>{CATEGORIES.map(c => <option key={c}>{c}</option>)}</select></label><label>메모<textarea name="memo" maxLength={10000} defaultValue={editing.properties.memo} /></label><div className="modal-actions"><button type="button" className="danger" disabled={busy} onClick={deleteItem}>삭제</button><button disabled={busy} type="submit">변경 저장</button></div></fieldset>{editing.properties.created_by !== user.id && <p className="hint">작성자만 수정·삭제할 수 있습니다.</p>}</form><section className="revision-section" aria-label="메모 저장 이력"><div className="panel-title"><h3>메모 저장 이력</h3><span>{revisionStatus === 'ready' ? `${revisions.length}건` : ''}</span></div>{revisionStatus === 'loading' && <p className="hint">이력을 불러오는 중…</p>}{revisionStatus === 'error' && <p role="alert" className="hint">이력을 불러오지 못했습니다. 기록을 다시 열어 주세요.</p>}{revisionStatus === 'ready' && (revisions.length ? <ol className="revision-list">{revisions.map(revision => <li key={revision.id} className="revision"><div className="revision-meta"><time dateTime={revision.saved_at}>{formatSavedAt(revision.saved_at)}</time><span>{revision.author_name} (@{revision.author_username})</span></div><p>{revision.memo || '메모 없음'}</p></li>)}</ol> : <p className="hint">이전 저장 이력이 없습니다. 다음 저장부터 기록됩니다.</p>)}</section>{error && <p role="alert" className="error">{error}</p>}</section></div>}
  </div>
}
