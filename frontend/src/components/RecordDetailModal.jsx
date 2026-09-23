import Attachments from '../Attachments'
import MemoEditor from '../MemoEditor'
import MemoHistory from '../MemoHistory'
import PublicData from '../PublicData'
import { CATEGORIES, formatCreatedAt } from '../config'

export default function RecordDetailModal({ record, user, busy, revisions, revisionStatus, error, mapReady, onClose, onUpdate, onDelete, onBusyChange }) {
  if (!record) return null
  const canEdit = record.properties.created_by === user.id
  const submit = event => {
    event.preventDefault()
    onUpdate(Object.fromEntries(new FormData(event.currentTarget)))
  }
  return <div className="modal-backdrop"><section className="modal" role="dialog" aria-modal="true" aria-label="기록 수정">
    <div className="panel-title"><h2>{canEdit ? '현장 기록 수정' : '현장 기록 보기'}</h2><button disabled={busy} onClick={onClose}>✕</button></div>
    <p className="author-label">작성 날짜: <time dateTime={record.properties.created_at || undefined}>{formatCreatedAt(record.properties.created_at)}</time> · {record.properties.team_name} · {record.properties.author_name} {record.properties.author_username ? `(@${record.properties.author_username})` : ''}</p>
    <form key={`${record.resource}-${record.id}`} onSubmit={submit}>
      <fieldset disabled={busy || !canEdit}>
        <label>이름<input name="name" required maxLength={200} defaultValue={record.properties.name} /></label>
        <label>카테고리<select name="category" defaultValue={record.properties.category}>{CATEGORIES.map(category => <option key={category}>{category}</option>)}</select></label>
        <label>메모<MemoEditor defaultValue={record.properties.memo} /></label>
        <div className="modal-actions"><button type="button" className="danger" disabled={busy} onClick={onDelete}>삭제</button><button disabled={busy} type="submit">변경 저장</button></div>
      </fieldset>
      {!canEdit && <p className="hint">작성자만 수정·삭제할 수 있습니다.</p>}
    </form>
    <Attachments key={record.resource + record.id} resource={record.resource} recordId={record.id} canEdit={canEdit} busy={busy} onBusyChange={onBusyChange} />
    <PublicData key={record.resource + record.id} resource={record.resource} recordId={record.id} geometry={record.geometry} canEdit={canEdit} busy={busy} onBusyChange={onBusyChange} mapReady={mapReady} />
    <MemoHistory key={record.resource + record.id} revisions={revisions} status={revisionStatus} />
    {error && <p role="alert" className="error">{error}</p>}
  </section></div>
}
