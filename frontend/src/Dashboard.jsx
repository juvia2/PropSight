import { useCallback, useMemo, useState } from 'react'
import { MapToolbar } from './components/DashboardControls'
import MapPanel from './components/MapPanel'
import PublicDataLookupModal from './components/PublicDataLookupModal'
import RecordDetailModal from './components/RecordDetailModal'
import RecordSidebar from './components/RecordSidebar'
import SavedNotes from './components/SavedNotes'
import { CATEGORIES, isSandboxTeamName } from './config'
import useKakaoMap from './hooks/useKakaoMap'
import useRecords from './hooks/useRecords'

export default function Dashboard({ user, account }) {
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
    <header><a className="brand" href="/">▦ <span>PropSight<small>COMMERCIAL REAL ESTATE</small></span></a>
      <MapToolbar items={records.items} active={active} onActiveChange={setActive} directory={records.directory} teamFilter={teamFilter} authorFilter={authorFilter} onTeamChange={setTeamFilter} onAuthorChange={setAuthorFilter} user={user} cadastral={cadastral} mapReady={map.status === 'ready'} onCadastralChange={() => setCadastral(value => !value)} onOpenLookup={() => setLookupOpen(true)} />
      <div className="header-actions"><span className="account-name">{user.display_name}</span>{user.is_team_admin && <button className="account-link" onClick={account.issueInvite}>팀 초대</button>}<button className="account-link" disabled={account.busy} onClick={account.logout}>로그아웃</button><button className="header-refresh" onClick={refresh}>↻ 새로고침</button></div>
    </header>
    <main>
      {account.invite && <div className="invite-banner"><strong>팀 초대 코드</strong><code>{account.invite}</code><span>팀원에게 전달하세요. 코드는 이 화면을 닫으면 다시 표시되지 않습니다.</span><button onClick={account.dismissInvite}>닫기</button></div>}
      {account.error && <p role="alert" className="error">{account.error}</p>}
      {records.error && <div role="alert" className="error">{records.error}<button onClick={() => records.setError('')}>닫기</button></div>}
      <div className="dashboard">
        <MapPanel controller={map} busy={records.busy} pending={records.pending} visibleCount={visible.length} editor={<RecordSidebar draft={draft} onDraftChange={setDraft} drawing={map.drawing} busy={records.busy} pending={records.pending} mapReady={map.status === 'ready'} onStartDrawing={startDrawing} onCancelDrawing={map.cancelDrawing} onRetry={() => records.createRecord(records.pending)} onDiscard={() => records.setPending(null)} />} notes={<SavedNotes visible={visible} itemCount={records.items.length} search={search} onSearchChange={setSearch} onSelect={selectRecord} />} detail={records.editing && <RecordDetailModal key={`${records.editing.resource}-${records.editing.id}`} record={records.editing} user={user} busy={records.busy} revisions={records.revisions} revisionStatus={records.revisionStatus} error={records.error} mapReady={map.status === 'ready'} onClose={() => records.setEditing(null)} onUpdate={records.updateRecord} onDelete={records.deleteRecord} onBusyChange={records.setBusy} />} />
      </div>
    </main>
    <PublicDataLookupModal open={lookupOpen} busy={lookupBusy} mapReady={map.status === 'ready'} onBusyChange={setLookupBusy} onClose={() => setLookupOpen(false)} />
  </div>
}
