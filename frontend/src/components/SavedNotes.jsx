import { useState } from 'react'
import { COLORS, formatCreatedAt } from '../config'

export default function SavedNotes({ visible, itemCount, search, onSearchChange, onSelect }) {
  const [collapsed, setCollapsed] = useState(() => window.matchMedia('(max-width: 1000px)').matches)

  return <><section className={`saved-notes ${collapsed ? 'is-collapsed' : ''}`} aria-label="저장 노트">
    <div className="saved-notes-heading">
      <h2>저장 노트 <span>{visible.length}</span></h2>
      <button className="notes-collapse" type="button" aria-label={collapsed ? '저장 노트 펼치기' : '저장 노트 접기'} aria-expanded={!collapsed} onClick={() => setCollapsed(value => !value)}>{collapsed ? '＋' : '−'}</button>
    </div>
    <div className="saved-notes-body" inert={collapsed} aria-hidden={collapsed}>
      <input aria-label="저장 노트 검색" placeholder="검색" value={search} onChange={event => onSearchChange(event.target.value)} />
      <div className="record-list">{visible.length ? visible.map(item => <button className="record" key={`${item.resource}-${item.id}`} onClick={() => onSelect(item)}>
        <span className="record-icon" style={{ color: COLORS[item.properties.category] }}>{item.geometry.type === 'Point' ? '⌖' : '⬡'}</span>
        <span>
          <span className="record-meta"><small style={{ color: COLORS[item.properties.category] }}>{item.properties.category}</small><time dateTime={item.properties.created_at || undefined}>{formatCreatedAt(item.properties.created_at)}</time></span>
          <strong>{item.properties.name}</strong>
          <p>{item.properties.memo || '메모 없음'}</p>
          <small className="record-author">{item.properties.team_name} · {item.properties.author_name} {item.properties.author_username ? `(@${item.properties.author_username})` : ''}</small>
        </span>
        <span aria-hidden="true">›</span>
      </button>) : <div className="empty"><span>⌖</span><p>{itemCount ? '검색 결과가 없습니다.' : '저장된 기록이 없습니다.'}</p></div>}</div>
    </div>
  </section><div className="saved-notes-stat" aria-label={`저장된 기록 ${itemCount}건`}><span className="stat-ring" aria-hidden="true" /><strong>{itemCount}</strong><small>저장된 기록</small></div></>
}
