import { useState } from 'react'
import { CATEGORIES } from '../config'

export default function RecordSidebar({ draft, onDraftChange, drawing, busy, pending, mapReady, onStartDrawing, onCancelDrawing, onRetry, onDiscard }) {
  const [collapsed, setCollapsed] = useState(() => window.matchMedia('(max-width: 1000px)').matches)
  const setField = (field, value) => onDraftChange(previous => ({ ...previous, [field]: value }))
  return <aside className={`draft-panel ${collapsed ? 'is-collapsed' : ''}`}>
    <div className="draft-panel-heading"><h2>현장 메모</h2><button type="button" className="notes-collapse" aria-label={collapsed ? '현장 메모 펼치기' : '현장 메모 접기'} aria-expanded={!collapsed} onClick={() => setCollapsed(value => !value)}>{collapsed ? '＋' : '−'}</button></div>
    <div className="draft-panel-body" inert={collapsed} aria-hidden={collapsed}>
    <fieldset disabled={drawing || busy || !!pending}>
      <label>분류<select value={draft.category} onChange={event => setField('category', event.target.value)}>{CATEGORIES.map(category => <option key={category}>{category}</option>)}</select></label>
      <label>장소 이름<input maxLength={200} placeholder="장소 이름" value={draft.name} onChange={event => setField('name', event.target.value)} /></label>
      <label>메모<textarea maxLength={10000} placeholder="메모를 입력하세요" value={draft.memo} onChange={event => setField('memo', event.target.value)} /></label>
      <div className="draw-buttons">
        <button disabled={!mapReady} onClick={() => onStartDrawing('MARKER')}>⌖ 핀 찍기</button>
        <button disabled={!mapReady} onClick={() => onStartDrawing('POLYGON')}>⬡ 구역 그리기</button>
      </div>
    </fieldset>
    {drawing && <button className="cancel" onClick={onCancelDrawing}>그리기 취소</button>}
    {busy && <p role="status">저장 중…</p>}
    {pending && !busy && <div className="retry"><p>저장하지 못한 도형이 있습니다.</p><button onClick={onRetry}>다시 저장</button><button onClick={onDiscard}>버리기</button></div>}
    </div>
  </aside>
}
