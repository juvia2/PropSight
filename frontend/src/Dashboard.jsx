import { useCallback, useMemo, useState } from 'react'
import { MapTools, RecordFilters } from './components/DashboardControls'
import MapPanel from './components/MapPanel'
import PublicDataLookupModal from './components/PublicDataLookupModal'
import RecordDetailModal from './components/RecordDetailModal'
import RecordSidebar from './components/RecordSidebar'
import { CATEGORIES, isSandboxTeamName } from './config'
import useKakaoMap from './hooks/useKakaoMap'
import useRecords from './hooks/useRecords'

export default function Dashboard({ user }) {
  const [teamFilter, setTeamFilter] = useState(() => isSandboxTeamName(user.team_name) ? String(user.team_id) : '')
  const records = useRecords(teamFilter)
  const { createRecord, setEditing, setError } = records
  const [authorFilter, setAuthorFilter] = useState('')
  const [active, setActive] = useState(CATEGORIES)
  const [cadastral, setCadastral] = useState(false)
  const [lookupOpen, setLookupOpen] = useState(false)
  const [lookupBusy, setLookupBusy] = useState(false)
  const [search, setSearch] = useState('')
  const [draft, setDraft] = useState({ category: CATEGORIES[0], name: '', memo: '' })

  const visible = useMemo(() => records.items.filter(item =>
    active.includes(item.properties.category)
    && (!teamFilter || String(item.properties.team_id) === teamFilter)
    && (!authorFilter || String(item.properties.created_by) === authorFilter)
    && `${item.properties.name} ${item.properties.memo}`.toLowerCase().includes(search.toLowerCase())
  ), [records.items, active, teamFilter, authorFilter, search])

  const handleDrawn = useCallback(async payload => {
    if (await createRecord(payload)) setDraft(previous => ({ ...previous, name: '', memo: '' }))
  }, [createRecord])

  const map = useKakaoMap({
    visible,
    cadastral,
    onSelect: setEditing,
    onDrawn: handleDrawn,
  })

  const startDrawing = type => {
    if (!draft.name.trim()) {
      setError('기록할 장소나 구역의 이름을 먼저 입력하세요.')
      return
    }
    setTeamFilter('')
    setAuthorFilter('')
    setError('')
    setActive(previous => previous.includes(draft.category) ? previous : [...previous, draft.category])
    map.startDrawing(type, { ...draft, name: draft.name.trim() })
  }

  const selectRecord = item => {
    map.focus(item)
    setEditing(item)
  }

  const refresh = () => {
    setError('')
    records.reload()
  }

  return <div className="app">
    <header><a className="brand" href="/">▦ <span>PropSight<small>COMMERCIAL REAL ESTATE</small></span></a><div className="workspace">임장 워크스페이스</div><div className="header-actions"><button className="header-refresh" onClick={refresh}>↻ 새로고침</button><span className={`connection ${records.status.includes('실패') ? 'offline' : ''}`}>● {records.status}</span></div></header>
    <main>
      <MapTools cadastral={cadastral} mapReady={map.status === 'ready'} onCadastralChange={() => setCadastral(value => !value)} onOpenLookup={() => setLookupOpen(true)} />
      <RecordFilters items={records.items} visibleCount={visible.length} active={active} onActiveChange={setActive} directory={records.directory} teamFilter={teamFilter} authorFilter={authorFilter} onTeamChange={setTeamFilter} onAuthorChange={setAuthorFilter} user={user} />
      {records.error && <div role="alert" className="error">{records.error}<button onClick={() => records.setError('')}>닫기</button></div>}
      <div className="dashboard">
        <RecordSidebar user={user} draft={draft} onDraftChange={setDraft} drawing={map.drawing} busy={records.busy} pending={records.pending} mapReady={map.status === 'ready'} visible={visible} itemCount={records.items.length} search={search} onSearchChange={setSearch} onStartDrawing={startDrawing} onCancelDrawing={map.cancelDrawing} onRetry={() => records.createRecord(records.pending)} onDiscard={() => records.setPending(null)} onSelect={selectRecord} />
        <MapPanel controller={map} busy={records.busy} pending={records.pending} />
      </div>
    </main>
    <PublicDataLookupModal open={lookupOpen} busy={lookupBusy} mapReady={map.status === 'ready'} onBusyChange={setLookupBusy} onClose={() => setLookupOpen(false)} />
    <RecordDetailModal record={records.editing} user={user} busy={records.busy} revisions={records.revisions} revisionStatus={records.revisionStatus} error={records.error} mapReady={map.status === 'ready'} onClose={() => records.setEditing(null)} onUpdate={records.updateRecord} onDelete={records.deleteRecord} onBusyChange={records.setBusy} />
  </div>
}
