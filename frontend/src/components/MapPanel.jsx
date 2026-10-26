import LocationSearch from '../LocationSearch'
import { CATEGORIES, COLORS } from '../config'
import MapSurface from './MapSurface'

export default function MapPanel({ controller, busy, pending, visibleCount, editor, notes, detail }) {
  const { mapNode, getMap, status, error, drawing } = controller
  const mapReady = status === 'ready'
  return <section className={`map-panel ${detail ? 'has-detail' : ''}`} aria-label="카카오 지도">
    <div className="workspace-intro"><div className="workspace-kicker"><span>현장 지도</span><i /><span>기록</span></div><h1>현장 기록을<br />한눈에.</h1></div>
    <p className="workspace-summary">지도에 표시 중 <strong>{visibleCount}</strong>건</p>
    <MapSurface>
      <div ref={mapNode} className="map" />
      {!mapReady && <div className="map-placeholder"><div className="map-grid" /><div className="setup">
        <span className="setup-icon">▦</span>
        <h2>{status === 'loading' ? '지도를 불러오는 중입니다' : '카카오맵을 연결해 주세요'}</h2>
        <p>JavaScript 앱 키를 설정하면 지도를 사용할 수 있습니다.</p>
        <code>frontend/.env.local · VITE_KAKAO_APP_KEY</code>
        <small>사이트 도메인: {window.location.origin}</small>
        {status === 'error' && <p role="alert">{error || '지도 연결 실패 원인을 확인하는 중입니다…'}</p>}
        {status === 'error' && <button className="refresh" onClick={() => window.location.reload()}>다시 연결</button>}
      </div></div>}
    </MapSurface>
    <LocationSearch getMap={getMap} enabled={mapReady} drawing={drawing || busy || !!pending} />
    {editor}
    {notes}
    {detail}
    <div className="map-legend">{CATEGORIES.map(category => <span key={category}><i style={{ background: COLORS[category] }} />{category}</span>)}</div>
  </section>
}
