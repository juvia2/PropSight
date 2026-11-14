import { useMemo, useState } from 'react'
import { MapToolbar } from './components/DashboardControls'
import MapSurface from './components/MapSurface'
import RecordSidebar from './components/RecordSidebar'
import RecordDetailModal from './components/RecordDetailModal'
import SavedNotes from './components/SavedNotes'
import LandUsePlan, { LandUseLinks } from './features/public-data/LandUsePlan'
import { CATEGORIES, COLORS } from './config'
import './index.css'
import './App.css'
import './Workspace.css'
import './ListingReference.css'
import './Palette.css'
import './Feedback.css'
import './DesignPreview.css'

const user = { id: 1, team_id: 1, team_name: '리테일 1팀', display_name: '김지우', username: 'jiwoo' }
const sampleRecords = [
  { id: 1, resource: 'records', geometry: { type: 'Point' }, properties: { category: '상권분석', name: '성수역 연무장길', memo: '주말 유동 인구가 많고 신규 브랜드 매장이 이어지는 구간.', created_at: '2026-10-23T02:10:00Z', team_id: 1, team_name: '리테일 1팀', created_by: 1, author_name: '김지우', author_username: 'jiwoo' } },
  { id: 2, resource: 'records', geometry: { type: 'Polygon' }, properties: { category: '개발계획', name: '서울숲 동측 후보지', memo: '주변 개발 계획과 접근 동선을 추가 확인할 예정.', created_at: '2026-10-22T05:30:00Z', team_id: 1, team_name: '리테일 1팀', created_by: 1, author_name: '김지우', author_username: 'jiwoo' } },
  { id: 3, resource: 'records', geometry: { type: 'Point' }, properties: { category: '진행매물', name: '성수동 코너 상가', memo: '1층 가시성이 좋고 보행 동선과 맞닿아 있음.', created_at: '2026-10-21T07:20:00Z', team_id: 1, team_name: '리테일 1팀', created_by: 2, author_name: '박민서', author_username: 'minseo' } },
]

const samplePreviewParcel = { pnu: '1114010300100840000', address: '서울 중구 태평로1가 84' }
const samplePreviewResult = {
  pnu: samplePreviewParcel.pnu, address: '서울특별시 중구 태평로1가 84', fetchedAt: '2026-11-14T09:00:00Z', partial: false,
  basic: { jibun: '84대', price: '65080000', priceDate: '2026.01' },
  district: [{ group: '지구단위계획', layer: '지구단위계획구역', name: '시안용 예시 지구단위계획구역' }],
  zoning: [{ group: '용도지역', layer: '도시지역', name: '일반상업지역' }],
  facilities: [{ group: '도시계획시설', layer: '도로', name: '도로(접합)' }],
}

export default function DesignPreview() {
  const [draft, setDraft] = useState({ category: CATEGORIES[0], name: '', memo: '' })
  const [active, setActive] = useState(CATEGORIES)
  const [search, setSearch] = useState('')
  const [teamFilter, setTeamFilter] = useState('')
  const [authorFilter, setAuthorFilter] = useState('')
  const [notice, setNotice] = useState('')
  const [selected, setSelected] = useState(null)
  const [cadastral, setCadastral] = useState(false)
  const [lookup, setLookup] = useState(false)
  const visible = useMemo(() => sampleRecords.filter(item => active.includes(item.properties.category)
    && (!teamFilter || String(item.properties.team_id) === teamFilter)
    && (!authorFilter || String(item.properties.created_by) === authorFilter)
    && `${item.properties.name} ${item.properties.memo}`.toLowerCase().includes(search.toLowerCase())), [active, search, teamFilter, authorFilter])
  const showNotice = message => { setNotice(message); window.setTimeout(() => setNotice(''), 3500) }

  return <div className="app design-preview">
    <header><a className="brand" href="/design-preview.html">▦ <span>PropSight<small>COMMERCIAL REAL ESTATE</small></span></a>
      <MapToolbar items={sampleRecords} active={active} onActiveChange={setActive} directory={{ teams: [{ id: 1, name: user.team_name }], users: [{ id: 1, team_id: 1, display_name: '김지우', username: 'jiwoo' }, { id: 2, team_id: 1, display_name: '박민서', username: 'minseo' }] }} teamFilter={teamFilter} authorFilter={authorFilter} onTeamChange={setTeamFilter} onAuthorChange={setAuthorFilter} user={user} onOpenLookup={() => { setSelected(null); setLookup(true) }} />
      <div className="header-actions"><span className="account-name">{user.display_name}</span><button className="header-refresh" onClick={() => showNotice('샘플 시안입니다.')}>새로고침</button></div>
    </header>
    <main>
      <div className="dashboard">
        <section className={`map-panel design-map ${selected || lookup ? 'has-detail' : ''}`} aria-label="시안용 지도 이미지">
          <div className="workspace-intro"><div className="workspace-kicker"><span>현장 지도</span><i /><span>기록</span></div><h1>현장 기록을<br />한눈에.</h1></div>
          <MapSurface><div className="preview-map-image" /><span className="preview-pin preview-pin-one" aria-hidden="true">⌖</span><span className="preview-pin preview-pin-two" aria-hidden="true">⬡</span></MapSurface>
          <div className="location-search"><div className="location-search-panel"><form onSubmit={event => { event.preventDefault(); showNotice('시안에서는 검색 위치만 확인할 수 있습니다.') }}><input aria-label="주소 또는 장소 검색" placeholder="지번·주소·장소 검색 · 예: 태평로1가 84" /><button type="submit">검색</button></form></div></div>
          <div className="map-corner-controls"><p className="workspace-summary">지도에 표시 중 <strong>{visible.length}</strong>건</p><button type="button" className="cadastral-map-toggle" aria-pressed={cadastral} onClick={() => setCadastral(value => !value)}>▦ 지적도{cadastral ? ' 켜짐' : ''}</button></div>
          <RecordSidebar draft={draft} onDraftChange={setDraft} drawing={false} busy={false} pending={null} mapReady onStartDrawing={() => showNotice('시안에서는 배치만 확인할 수 있습니다.')} onCancelDrawing={() => {}} onRetry={() => {}} onDiscard={() => {}} />
          <SavedNotes visible={visible} itemCount={sampleRecords.length} search={search} onSearchChange={setSearch} onSelect={item => { setLookup(false); setSelected(item) }} />
          {selected && <RecordDetailModal key={selected.id} record={selected} user={user} busy={false} revisions={[]} revisionStatus="ready" error="" mapReady={false} onClose={() => setSelected(null)} onUpdate={() => showNotice('시안에서는 기록을 저장할 수 없습니다.')} onDelete={() => showNotice('시안에서는 기록을 삭제할 수 없습니다.')} onBusyChange={() => {}} preview />}
          {lookup && !selected && <section className="listing-detail lookup-panel" aria-label="공공자료 조회 시안">
            <div className="listing-detail-top"><span /><strong>건물 · 토지 자료 조회</strong><button type="button" className="listing-close" aria-label="자료 조회 닫기" onClick={() => setLookup(false)}>✕</button></div>
            <div className="listing-detail-scroll"><div className="public-data"><div className="public-data-body">
              <p className="hint">시안 화면입니다. 실제 앱에서는 지도에서 지번을 검색하면 이 화면이 열리고 주소가 자동 입력됩니다.</p>
              <label>조회할 지번 주소<input readOnly value={samplePreviewParcel.address} /></label>
              <p className="public-parcel">{samplePreviewParcel.address}</p>
              <LandUseLinks parcel={samplePreviewParcel} />
              <div className="public-service-buttons"><button type="button"><strong>건축인허가</strong><small>기본개요 조회</small></button><button type="button"><strong>주택인허가</strong><small>기본개요 조회</small></button></div>
              <LandUsePlan parcel={samplePreviewParcel} preview={samplePreviewResult} />
            </div></div></div>
          </section>}
          <div className="map-legend">{CATEGORIES.map(category => <span key={category}><i style={{ background: COLORS[category] }} />{category}</span>)}</div>
        </section>
      </div>
    </main>
    {notice && <div className="preview-toast" role="status">{notice}</div>}
  </div>
}
