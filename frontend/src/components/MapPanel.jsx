import LocationSearch from '../LocationSearch'
import { CATEGORIES, COLORS } from '../config'

export default function MapPanel({ controller, busy, pending }) {
  const { mapNode, getMap, status, error, drawing } = controller
  const mapReady = status === 'ready'
  return <section className="map-panel" aria-label="카카오 지도">
    <div ref={mapNode} className="map" />
    <LocationSearch getMap={getMap} enabled={mapReady} drawing={drawing || busy || !!pending} />
    {!mapReady && <div className="map-placeholder"><div className="map-grid" /><div className="setup">
      <span className="setup-icon">▦</span>
      <div className="eyebrow">CONNECT YOUR MAP</div>
      <h2>{status === 'loading' ? '지도를 불러오는 중입니다' : '카카오맵을 연결해 주세요'}</h2>
      <p>JavaScript 앱 키를 설정하면<br />이곳에서 장소와 상권을 지도에 기록할 수 있습니다.</p>
      <code>frontend/.env.local · VITE_KAKAO_APP_KEY</code>
      <small>사이트 도메인: {window.location.origin}</small>
      {status === 'error' && <p role="alert">{error || '지도 연결 실패 원인을 확인하는 중입니다…'}</p>}
      {status === 'error' && <button className="refresh" onClick={() => window.location.reload()}>지도 다시 연결</button>}
    </div></div>}
    <div className="map-tag">SEOUL <span>성수동 일대</span></div>
    <div className="map-legend">{CATEGORIES.map(category => <span key={category}><i style={{ background: COLORS[category] }} />{category}</span>)}</div>
  </section>
}
