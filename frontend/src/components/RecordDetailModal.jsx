import { useEffect, useState } from 'react'
import Attachments from '../Attachments'
import MemoEditor from '../MemoEditor'
import MemoHistory from '../MemoHistory'
import PublicData from '../PublicData'
import { CATEGORIES, COLORS, formatCreatedAt } from '../config'

const TABS = [
  { id: 'record', label: '기록' },
  { id: 'public', label: '건물·토지' },
  { id: 'files', label: '첨부' },
  { id: 'history', label: '변경 이력' },
]

export default function RecordDetailModal({ record, user, busy, revisions, revisionStatus, error, mapReady, onClose, onUpdate, onDelete, onBusyChange, preview = false }) {
  const [tab, setTab] = useState('record')
  const [editing, setEditing] = useState(false)
  useEffect(() => {
    const onEscape = event => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onEscape)
    return () => window.removeEventListener('keydown', onEscape)
  }, [onClose])
  if (!record) return null

  const { properties } = record
  const canEdit = properties.created_by === user.id
  const isPoint = record.geometry?.type === 'Point'
  const submit = async event => {
    event.preventDefault()
    const saved = await onUpdate(Object.fromEntries(new FormData(event.currentTarget)))
    if (saved) setEditing(false)
  }

  return <section className="listing-detail" role="dialog" aria-modal="false" aria-label={`${properties.name} 상세 정보`}>
    <div className="listing-detail-top">
      <button type="button" className="listing-back" onClick={onClose} aria-label="상세 정보 닫기">←</button>
      <strong>현장 기록 상세</strong>
      <button type="button" className="listing-close" onClick={onClose} aria-label="상세 정보 닫기">✕</button>
    </div>
    <div className="listing-detail-head">
      <span className="listing-category" style={{ '--listing-color': COLORS[properties.category] || '#2861dd' }}>{properties.category}</span>
      <h2>{properties.name}</h2>
      <p>{properties.team_name} · {properties.author_name}{properties.author_username ? ` (@${properties.author_username})` : ''}</p>
      <div className="listing-facts">
        <span><small>기록 형태</small><strong>{isPoint ? '핀 위치' : '구역'}</strong></span>
        <span><small>등록일</small><strong>{formatCreatedAt(properties.created_at)}</strong></span>
      </div>
    </div>
    <div className="listing-tabs" role="tablist" aria-label="상세 정보 항목">{TABS.map(item => <button key={item.id} id={`listing-tab-${item.id}`} type="button" role="tab" aria-selected={tab === item.id} aria-controls={`listing-panel-${item.id}`} onClick={() => setTab(item.id)}>{item.label}</button>)}</div>
    <div className="listing-detail-scroll">
      <div id="listing-panel-record" role="tabpanel" aria-labelledby="listing-tab-record" hidden={tab !== 'record'}>
          <div className="listing-section-title"><h3>현장 정보</h3>{canEdit && !editing && <button type="button" onClick={() => setEditing(true)}>수정</button>}</div>
          {editing ? <form key={`${record.resource}-${record.id}`} className="listing-edit-form" onSubmit={submit}>
            <fieldset disabled={busy}>
              <label>이름<input name="name" required maxLength={200} defaultValue={properties.name} /></label>
              <label>카테고리<select name="category" defaultValue={properties.category}>{CATEGORIES.map(category => <option key={category}>{category}</option>)}</select></label>
              <label>메모<MemoEditor defaultValue={properties.memo} /></label>
              <div className="modal-actions"><button type="button" className="listing-cancel" onClick={() => setEditing(false)}>취소</button><button type="submit">변경 저장</button></div>
            </fieldset>
          </form> : <>
            <dl className="listing-data-table">
              <div><dt>이름</dt><dd>{properties.name}</dd></div>
              <div><dt>분류</dt><dd>{properties.category}</dd></div>
              <div><dt>위치 형태</dt><dd>{isPoint ? '핀' : '구역'}</dd></div>
              <div><dt>작성자</dt><dd>{properties.author_name}</dd></div>
              <div><dt>등록일</dt><dd>{formatCreatedAt(properties.created_at)}</dd></div>
            </dl>
            <div className="listing-section-title"><h3>현장 메모</h3></div>
            <p className="listing-memo">{properties.memo || '등록된 메모가 없습니다.'}</p>
            {canEdit && <button type="button" className="listing-delete" disabled={busy} onClick={onDelete}>기록 삭제</button>}
          </>}
      </div>
      <div id="listing-panel-public" role="tabpanel" aria-labelledby="listing-tab-public" hidden={tab !== 'public'}>
        {preview ? <p className="listing-empty">실제 앱에서 저장된 건물·토지 공공자료를 확인할 수 있습니다.</p> : <PublicData key={`${record.resource}-${record.id}`} resource={record.resource} recordId={record.id} geometry={record.geometry} canEdit={canEdit} busy={busy} onBusyChange={onBusyChange} mapReady={mapReady} expanded />}
      </div>
      <div id="listing-panel-files" role="tabpanel" aria-labelledby="listing-tab-files" hidden={tab !== 'files'}>
        {preview ? <p className="listing-empty">실제 앱에서 첨부 이미지와 파일을 확인할 수 있습니다.</p> : <Attachments key={`${record.resource}-${record.id}`} resource={record.resource} recordId={record.id} canEdit={canEdit} busy={busy} onBusyChange={onBusyChange} />}
      </div>
      <div id="listing-panel-history" role="tabpanel" aria-labelledby="listing-tab-history" hidden={tab !== 'history'}>
        <MemoHistory revisions={revisions} status={revisionStatus} />
      </div>
      {error && <p role="alert" className="error">{error}</p>}
    </div>
  </section>
}
