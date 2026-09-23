import { useEffect, useState } from 'react'
import { request, jsonOptions } from './api'
import PublicDataSnapshot from './features/public-data/PublicDataSnapshot'
import { geocode, geometryAnchor, hasPnu, parcelFromAddress } from './features/public-data/publicDataUtils'

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
      {saved.map(snapshot => <PublicDataSnapshot key={snapshot.id + snapshot.fetched_at} snapshot={snapshot} />)}
    </div>
  </details>
}
