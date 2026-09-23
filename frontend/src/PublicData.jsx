import { useEffect, useState } from 'react'
import { request, jsonOptions } from './api'

const timestamp = value => new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
const hasPnu = value => /^[0-9]{10}[12][0-9]{8}$/.test(value)

const readableValue = value => {
  if (value === null || value === undefined || typeof value === 'object') return ''
  const text = String(value).replace(/\s+/g, ' ').trim()
  return text && /[\p{L}\p{N}]/u.test(text) ? text : ''
}

function rowTitle(row, index) {
  const preferred = ['bldNm', 'platPlc', 'newPlatPlc', 'mainPurpsCdNm', 'prposAreaDstrcCodeNm', 'archGbCdNm', 'pmsDay', 'useAprDay']
  const detail = preferred.map(key => readableValue(row[key])).find(Boolean)
  return `상세 정보 ${index + 1}${detail ? ` · ${detail}` : ''}`
}

function geometryAnchor(geometry) {
  if (geometry?.type === 'Point') return geometry.coordinates
  const ring = geometry?.type === 'Polygon' ? geometry.coordinates?.[0] : null
  if (!Array.isArray(ring) || ring.length < 3) return null
  const points = ring.length > 3 && ring[0][0] === ring.at(-1)[0] && ring[0][1] === ring.at(-1)[1] ? ring.slice(0, -1) : ring
  const [originX, originY] = points[0]
  let twiceArea = 0, longitude = 0, latitude = 0
  points.forEach((point, index) => {
    const next = points[(index + 1) % points.length]
    const x = point[0] - originX, y = point[1] - originY
    const nextX = next[0] - originX, nextY = next[1] - originY
    const cross = x * nextY - nextX * y
    twiceArea += cross
    longitude += (x + nextX) * cross
    latitude += (y + nextY) * cross
  })
  if (Math.abs(twiceArea) > 1e-12) return [originX + longitude / (3 * twiceArea), originY + latitude / (3 * twiceArea)]
  return [points.reduce((sum, point) => sum + point[0], 0) / points.length, points.reduce((sum, point) => sum + point[1], 0) / points.length]
}

function parcelFromAddress(address) {
  const main = String(address.main_address_no || '')
  const sub = String(address.sub_address_no || '0')
  if (!/^[0-9]{10}$/.test(address.b_code || '') || !/^[0-9]{1,4}$/.test(main) || !/^[0-9]{1,4}$/.test(sub)) throw new Error('지번 정보를 확인할 수 없습니다. 다른 지번 주소를 선택하거나 필지번호를 입력해 주세요.')
  return { pnu: address.b_code + (address.mountain_yn === 'Y' ? '2' : '1') + main.padStart(4, '0') + sub.padStart(4, '0'), address: address.address_name }
}

function geocode(run, services) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('주소 확인 시간이 초과되었습니다. 다시 시도해 주세요.')), 10000)
    run((data, status) => {
      clearTimeout(timer)
      if (status === services.Status.OK) resolve(data)
      else reject(new Error('지번을 찾지 못했습니다. 주소를 다시 검색해 주세요.'))
    })
  })
}

function Snapshot({ snapshot }) {
  const [limit, setLimit] = useState(20)
  return <details className="public-snapshot">
    <summary>{snapshot.label} · {snapshot.rows.length}건<span>{snapshot.address || snapshot.pnu}</span></summary>
    <div className="public-snapshot-body">
      <p className="hint">조회 {timestamp(snapshot.fetched_at)} · @{snapshot.author_username}<br />필지번호 {snapshot.pnu} · <a href={snapshot.source} target="_blank" rel="noreferrer">자료 출처</a></p>
      {snapshot.truncated && <p className="public-error">전체 {snapshot.total_count}건 중 {snapshot.rows.length}건만 표시됩니다. 전체 자료는 출처에서 확인하세요.</p>}
      {!snapshot.rows.length && <p className="hint">이 지번에서 조회된 자료가 없습니다. 다른 지번 또는 부속지번으로 등록된 자료는 포함되지 않을 수 있습니다.</p>}
      {snapshot.rows.slice(0, limit).map((row, index) => {
        const fields = Object.entries(row).filter(([, value]) => typeof value === 'object' ? value !== null : Boolean(readableValue(value)))
        return <details className="public-row" key={index}>
          <summary>{rowTitle(row, index)}</summary>
          {fields.length ? <dl>{fields.map(([key, value]) => <div key={key}><dt>{snapshot.field_labels[key] || key}</dt><dd>{typeof value === 'object' ? JSON.stringify(value) : String(value).trim()}</dd></div>)}</dl> : <p className="hint">표시할 상세 항목이 없습니다.</p>}
        </details>
      })}
      {snapshot.rows.length > limit && <button type="button" className="refresh" onClick={() => setLimit(value => value + 20)}>20건 더 보기</button>}
    </div>
  </details>
}

export default function PublicData({ resource, recordId, geometry, canEdit, busy, onBusyChange, mapReady, standalone = false }) {
  const [services, setServices] = useState([])
  const [saved, setSaved] = useState([])
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [matches, setMatches] = useState([])
  const [parcel, setParcel] = useState({ pnu: '', address: '' })
  const [working, setWorking] = useState('')
  const [retry, setRetry] = useState(0)
  const path = standalone ? '/api/public-data/lookup' : '/api/' + resource + '/' + recordId + '/public-data'

  useEffect(() => {
    let cancelled = false
    Promise.all([request('/api/public-data/services'), standalone ? Promise.resolve([]) : request(path)]).then(([options, data]) => {
      if (cancelled) return
      setServices(options); setSaved(data); setStatus('ready')
      if (data.length) { setParcel({ pnu: data[0].pnu, address: data[0].address }); setQuery(data[0].address) }
    }).catch(e => { if (!cancelled) { setError(e.message); setStatus('error') } })
    return () => { cancelled = true }
  }, [path, retry, standalone])

  async function findAddress(event) {
    event.preventDefault()
    if (!query.trim() || busy) return
    const sdk = window.kakao?.maps?.services
    if (!sdk) { setError('지도 연결 후 주소 검색을 사용할 수 있습니다. 필지번호 직접 입력도 가능합니다.'); return }
    onBusyChange(true); setWorking('주소 검색 중…'); setError(''); setMatches([])
    try {
      const results = await geocode(callback => new sdk.Geocoder().addressSearch(query.trim(), callback), sdk)
      const candidates = results.filter(item => item.address).map(item => parcelFromAddress(item.address))
      if (!candidates.length) throw new Error('검색된 주소의 지번 정보를 확인할 수 없습니다.')
      setMatches(candidates)
    } catch (e) { setError(e.message) }
    finally { setWorking(''); onBusyChange(false) }
  }

  async function locateParcel() {
    const sdk = window.kakao?.maps?.services
    const anchor = geometryAnchor(geometry)
    if (!sdk || !anchor) return
    const locationLabel = geometry.type === 'Point' ? '핀 위치' : '구역 중심'
    onBusyChange(true); setWorking(locationLabel + '의 지번 확인 중…'); setError(''); setMatches([])
    try {
      const [x, y] = anchor
      const geocoder = new sdk.Geocoder()
      const [addresses, regions] = await Promise.all([
        geocode(callback => geocoder.coord2Address(x, y, callback), sdk),
        geocode(callback => geocoder.coord2RegionCode(x, y, callback), sdk),
      ])
      const address = addresses[0]?.address
      const region = regions.find(item => item.region_type === 'B')
      if (!address || !region) throw new Error(locationLabel + '의 지번을 확인하지 못했습니다. 지번 주소로 검색해 주세요.')
      const found = parcelFromAddress({ ...address, b_code: region.code })
      setParcel(found); setQuery(found.address)
    } catch (e) { setError(e.message) }
    finally { setWorking(''); onBusyChange(false) }
  }

  async function fetchService(service) {
    onBusyChange(true); setWorking(service.label + (standalone ? ' 조회 중…' : ' 조회·저장 중…')); setError('')
    try {
      const result = await request(path + '/' + service.kind, jsonOptions('POST', parcel))
      setSaved(previous => [result, ...previous.filter(item => item.id !== result.id)])
    } catch (e) { setError(e.message) }
    finally { setWorking(''); onBusyChange(false) }
  }

  return <details className="public-data" open={standalone || undefined}>
    <summary>건물 · 토지 공공자료</summary>
    <div className="public-data-body">
      <p className="hint">토지이용계획 정보 조회는 관공서 발급 확인서 원본이 아닙니다. {standalone ? '핀 없이 주소로 조회할 수 있으며, 조회 결과는 창을 닫으면 사라집니다.' : '조회한 자료는 이 기록에 저장됩니다.'}</p>
      {status === 'loading' && <p role="status" className="hint">저장 자료를 불러오는 중…</p>}
      {status === 'error' && <button type="button" className="refresh" disabled={busy} onClick={() => { setStatus('loading'); setError(''); setRetry(value => value + 1) }}>다시 불러오기</button>}
      {canEdit && status === 'ready' && <>
        <form className="public-address-search" onSubmit={findAddress}>
          <label>조회할 지번 주소<input value={query} onChange={event => { setQuery(event.target.value); setParcel({ pnu: '', address: '' }); setMatches([]) }} placeholder="예: 서울 성동구 성수동2가 300-1" disabled={busy} maxLength={200} /></label>
          <button type="submit" className="refresh" disabled={busy || !query.trim() || !mapReady}>주소 검색</button>
        </form>
        {geometry?.type === 'Point' && <button type="button" className="refresh" disabled={busy || !mapReady} onClick={locateParcel}>핀 위치의 지번 찾기</button>}
        {geometry?.type === 'Polygon' && <><button type="button" className="refresh" disabled={busy || !mapReady} onClick={locateParcel}>구역 중심의 지번 추천</button><p className="hint">구역은 여러 필지를 포함할 수 있습니다. 중심 지번을 추천하므로 실제 조회할 필지가 맞는지 확인해 주세요.</p></>}
        <p className="hint public-address-note">자동으로 찾은 주소는 실제 위치와 다를 수 있으므로, 조회 전 정확한 지번 주소를 확인하는 것을 권장합니다.</p>
        {matches.length > 0 && <ul className="public-address-results">{matches.map(item => <li key={item.pnu}><button type="button" disabled={busy} onClick={() => { setParcel(item); setQuery(item.address); setMatches([]); setError('') }}>{item.address}</button></li>)}</ul>}
        <p className="public-parcel">{parcel.address || '조회할 지번을 선택해 주세요.'}</p>
        <details className="public-pnu"><summary>필지번호(PNU) 직접 입력</summary><label>19자리 필지번호<input value={parcel.pnu} onChange={event => { setParcel({ pnu: event.target.value, address: '' }); setQuery(''); setMatches([]) }} inputMode="numeric" maxLength={19} disabled={busy} /></label></details>
        {parcel.pnu && <p className="hint">필지번호 {parcel.pnu}{!hasPnu(parcel.pnu) && ' · 올바른 19자리 번호를 입력하세요.'}</p>}
        <div className="public-service-buttons">{services.map(service => <button type="button" key={service.kind} disabled={busy || !service.configured || !hasPnu(parcel.pnu)} onClick={() => fetchService(service)}><strong>{service.label}</strong><small>{service.configured ? service.scope + (standalone ? ' 조회' : ' 조회·저장') : '인증키 미설정'}</small></button>)}</div>
      </>}
      {working && <p className="hint" role="status">{working}</p>}
      {error && <p className="public-error" role="alert">{error}</p>}
      {status === 'ready' && !saved.length && <p className="hint">{standalone ? '주소를 선택한 뒤 원하는 자료를 조회해 주세요.' : '저장된 공공자료가 없습니다.'}</p>}
      {saved.map(snapshot => <Snapshot key={snapshot.id + snapshot.fetched_at} snapshot={snapshot} />)}
    </div>
  </details>
}
