import { useMemo, useState } from 'react'
import { MapToolbar } from './components/DashboardControls'
import MapSurface from './components/MapSurface'
import RecordSidebar from './components/RecordSidebar'
import RecordDetailModal from './components/RecordDetailModal'
import SavedNotes from './components/SavedNotes'
import { CATEGORIES, COLORS } from './config'
import './index.css'
import './App.css'
import './Workspace.css'
import './ListingReference.css'
import './DesignPreview.css'

const user = { id: 1, team_id: 1, team_name: '리테일 1팀', display_name: '김지우', username: 'jiwoo' }
const sampleRecords = [
  { id: 1, resource: 'records', geometry: { type: 'Point' }, properties: { category: '상권분석', name: '성수역 연무장길', memo: '주말 유동 인구가 많고 신규 브랜드 매장이 이어지는 구간.', created_at: '2026-10-23T02:10:00Z', team_id: 1, team_name: '리테일 1팀', created_by: 1, author_name: '김지우', author_username: 'jiwoo' } },
  { id: 2, resource: 'records', geometry: { type: 'Polygon' }, properties: { category: '개발계획', name: '서울숲 동측 후보지', memo: '주변 개발 계획과 접근 동선을 추가 확인할 예정.', created_at: '2026-10-22T05:30:00Z', team_id: 1, team_name: '리테일 1팀', created_by: 1, author_name: '김지우', author_username: 'jiwoo' } },
  { id: 3, resource: 'records', geometry: { type: 'Point' }, properties: { category: '진행매물', name: '성수동 코너 상가', memo: '1층 가시성이 좋고 보행 동선과 맞닿아 있음.', created_at: '2026-10-21T07:20:00Z', team_id: 1, team_name: '리테일 1팀', created_by: 2, author_name: '박민서', author_username: 'minseo' } },
]

export default function DesignPreview() {
  const [draft, setDraft] = useState({ category: CATEGORIES[0], name: '', memo: '' })
  const [active, setActive] = useState(CATEGORIES)
  const [search, setSearch] = useState('')
  const [teamFilter, setTeamFilter] = useState('')
  const [authorFilter, setAuthorFilter] = useState('')
  const [notice, setNotice] = useState('')
  const [selected, setSelected] = useState(null)
  const visible = useMemo(() => sampleRecords.filter(item => active.includes(item.properties.category)
    && (!teamFilter || String(item.properties.team_id) === teamFilter)
    && (!authorFilter || String(item.properties.created_by) === authorFilter)
    && `${item.properties.name} ${item.properties.memo}`.toLowerCase().includes(search.toLowerCase())), [active, search, teamFilter, authorFilter])
  const showNotice = message => { setNotice(message); window.setTimeout(() => setNotice(''), 3500) }

  return <div className="app design-preview">
    <header><a className="brand" href="/design-preview.html">▦ <span>PropSight<small>COMMERCIAL REAL ESTATE</small></span></a>
      <MapToolbar items={sampleRecords} active={active} onActiveChange={setActive} directory={{ teams: [{ id: 1, name: user.team_name }], users: [{ id: 1, team_id: 1, display_name: '김지우', username: 'jiwoo' }, { id: 2, team_id: 1, display_name: '박민서', username: 'minseo' }] }} teamFilter={teamFilter} authorFilter={authorFilter} onTeamChange={setTeamFilter} onAuthorChange={setAuthorFilter} user={user} cadastral={false} mapReady={false} onCadastralChange={() => {}} onOpenLookup={() => showNotice('자료 조회는 실제 앱에서 사용할 수 있습니다.')} />
      <div className="header-actions"><span className="account-name">{user.display_name}</span><button className="header-refresh" onClick={() => showNotice('샘플 시안입니다.')}>새로고침</button></div>
    </header>
    <main>
      <div className="dashboard">
        <section className={`map-panel design-map ${selected ? 'has-detail' : ''}`} aria-label="시안용 지도 이미지">
          <div className="workspace-intro"><div className="workspace-kicker"><span>현장 지도</span><i /><span>기록</span></div><h1>현장 기록을<br />한눈에.</h1></div>
          <p className="workspace-summary">지도에 표시 중 <strong>{visible.length}</strong>건</p>
          <MapSurface><div className="preview-map-image" /><span className="preview-pin preview-pin-one" aria-hidden="true">⌖</span><span className="preview-pin preview-pin-two" aria-hidden="true">⬡</span></MapSurface>
          <span className="location-toggle preview-location">⌕ 위치 검색</span>
          <RecordSidebar draft={draft} onDraftChange={setDraft} drawing={false} busy={false} pending={null} mapReady onStartDrawing={() => showNotice('시안에서는 배치만 확인할 수 있습니다.')} onCancelDrawing={() => {}} onRetry={() => {}} onDiscard={() => {}} />
          <SavedNotes visible={visible} itemCount={sampleRecords.length} search={search} onSearchChange={setSearch} onSelect={setSelected} />
          {selected && <RecordDetailModal key={selected.id} record={selected} user={user} busy={false} revisions={[]} revisionStatus="ready" error="" mapReady={false} onClose={() => setSelected(null)} onUpdate={() => showNotice('시안에서는 기록을 저장할 수 없습니다.')} onDelete={() => showNotice('시안에서는 기록을 삭제할 수 없습니다.')} onBusyChange={() => {}} preview />}
          <div className="map-legend">{CATEGORIES.map(category => <span key={category}><i style={{ background: COLORS[category] }} />{category}</span>)}</div>
        </section>
      </div>
    </main>
    {notice && <div className="preview-toast" role="status">{notice}</div>}
  </div>
}
