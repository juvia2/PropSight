import { CATEGORIES, COLORS, formatCreatedAt } from '../config'

export default function RecordSidebar({ user, draft, onDraftChange, drawing, busy, pending, mapReady, visible, itemCount, search, onSearchChange, onStartDrawing, onCancelDrawing, onRetry, onDiscard, onSelect }) {
  const setField = (field, value) => onDraftChange(previous => ({ ...previous, [field]: value }))
  return <aside>
    <div className="panel-title"><h2>현장 기록</h2><span>NEW RECORD</span></div>
    <p className="author-label">작성자: {user.team_name} · {user.display_name} (@{user.username})</p>
    <fieldset disabled={drawing || busy || !!pending}>
      <label>저장 카테고리<select value={draft.category} onChange={event => setField('category', event.target.value)}>{CATEGORIES.map(category => <option key={category}>{category}</option>)}</select></label>
      <label>장소 · 구역 이름<input maxLength={200} placeholder="예: 성수역 북측 개발 예정지" value={draft.name} onChange={event => setField('name', event.target.value)} /></label>
      <label>임장 메모<textarea maxLength={10000} placeholder="유동 인구, 입지 특성, 확인할 사항…" value={draft.memo} onChange={event => setField('memo', event.target.value)} /></label>
      <div className="draw-buttons">
        <button disabled={!mapReady} onClick={() => onStartDrawing('MARKER')}>⌖ 핀 찍기</button>
        <button disabled={!mapReady} onClick={() => onStartDrawing('POLYGON')}>⬡ 구역 그리기</button>
      </div>
    </fieldset>
    <p className="hint">선택한 카테고리로 그리기 완료 시 자동 저장됩니다. 다각형은 마우스 오른쪽 클릭으로 완성하세요. 저장 후 열리는 상세 화면에서 이미지·파일을 첨부할 수 있습니다.</p>
    {drawing && <button className="cancel" onClick={onCancelDrawing}>그리기 취소</button>}
    {busy && <p role="status">저장 중…</p>}
    {pending && !busy && <div className="retry"><p>저장하지 못한 도형이 있습니다.</p><button onClick={onRetry}>다시 저장</button><button onClick={onDiscard}>버리기</button></div>}
    <div className="records">
      <div className="panel-title"><h2>저장한 장소</h2><span>{visible.length}건</span></div>
      <input aria-label="기록 검색" placeholder="이름 또는 메모 검색" value={search} onChange={event => onSearchChange(event.target.value)} />
      <div className="record-list">{visible.length ? visible.map(item => <button className="record" key={`${item.resource}-${item.id}`} onClick={() => onSelect(item)}>
        <span className="record-icon" style={{ color: COLORS[item.properties.category] }}>{item.geometry.type === 'Point' ? '⌖' : '⬡'}</span>
        <span>
          <span className="record-meta"><small style={{ color: COLORS[item.properties.category] }}>{item.properties.category}</small><time dateTime={item.properties.created_at || undefined}>{formatCreatedAt(item.properties.created_at)}</time></span>
          <strong>{item.properties.name}</strong>
          <p>{item.properties.memo || '메모 없음'}</p>
          <small className="record-author">{item.properties.team_name} · {item.properties.author_name} {item.properties.author_username ? `(@${item.properties.author_username})` : ''}</small>
        </span>
        <span>›</span>
      </button>) : <div className="empty"><span>⌖</span><p>{itemCount ? '표시할 기록이 없습니다.' : '아직 저장한 장소가 없습니다.'}</p><small>핀과 구역으로 첫 현장 기록을 남겨보세요.</small></div>}</div>
    </div>
  </aside>
}
