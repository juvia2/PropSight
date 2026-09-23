import { CATEGORIES, COLORS, SANDBOX_TEAM_NAME } from '../config'

export function MapTools({ cadastral, mapReady, onCadastralChange, onOpenLookup }) {
  return <section className="map-tools" aria-label="지도 및 공공자료 도구">
    <div className="map-tools-row">
      <span className="map-tools-title">지도 · 자료 도구</span>
      <div className="map-tools-actions">
        <button type="button" className="cadastral-toggle" aria-pressed={cadastral} disabled={!mapReady} onClick={onCadastralChange}>지적편집도</button>
        <button type="button" className="refresh" onClick={onOpenLookup}>공공자료 조회</button>
      </div>
    </div>
    {cadastral && <p className="cadastral-note">지적편집도는 참고용이며 현행 지적 정보와 다를 수 있습니다.</p>}
  </section>
}

export function RecordFilters({ items, visibleCount, active, onActiveChange, directory, teamFilter, authorFilter, onTeamChange, onAuthorChange, user }) {
  const toggleCategory = category => onActiveChange(previous => previous.includes(category)
    ? previous.filter(value => value !== category)
    : [...previous, category])
  return <>
    <section className="filterbar" aria-label="현장기록 지도 레이어">
      <span className="filter-label">현장기록 레이어</span>
      <div className="toggles" role="group" aria-label="지도 카테고리 필터">
        {CATEGORIES.map(category => <button key={category} aria-pressed={active.includes(category)} className={active.includes(category) ? 'selected' : ''} style={{ '--category': COLORS[category] }} onClick={() => toggleCategory(category)}>
          <i />{category}<b>{items.filter(item => item.properties.category === category).length}</b>
        </button>)}
      </div>
      <span className="filter-count">현재 표시 <strong>{visibleCount}</strong>건</span>
    </section>
    <section className="people-filters" aria-label="팀과 작성자 필터">
      <label>팀별 조회<select value={teamFilter} onChange={event => { onTeamChange(event.target.value); onAuthorChange('') }}>
        <option value="">전체 팀 (시현 전용 제외)</option>
        {directory.teams.map(team => <option key={team.id} value={team.id}>{team.name}{team.name.toLowerCase() === SANDBOX_TEAM_NAME ? ' (시현 전용)' : ''}</option>)}
      </select></label>
      <label>작성자별 조회<select value={authorFilter} onChange={event => onAuthorChange(event.target.value)}>
        <option value="">전체 직원</option>
        {directory.users.filter(person => !teamFilter || String(person.team_id) === teamFilter).map(person => <option key={person.id} value={person.id}>{person.display_name} (@{person.username})</option>)}
      </select></label>
      <button className="refresh" onClick={() => { onTeamChange(String(user.team_id)); onAuthorChange('') }}>내 팀</button>
      <button className="refresh" onClick={() => { onTeamChange(String(user.team_id)); onAuthorChange(String(user.id)) }}>내 기록</button>
      <button className="refresh" onClick={() => { onTeamChange(''); onAuthorChange('') }}>전체 보기</button>
    </section>
  </>
}
