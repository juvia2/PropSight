import { useEffect, useRef, useState } from 'react'
import { geocode, parcelFromAddress } from './features/public-data/publicDataUtils'

// Resolves the chosen search result to a parcel (PNU) so the data lookup can be prefilled.
async function resolveParcel(item, services) {
  if (item.raw?.main_address_no) {
    try { return { ...parcelFromAddress(item.raw), x: item.x, y: item.y } } catch { /* fall back to coordinates */ }
  }
  const geocoder = new services.Geocoder()
  const [addresses, regions] = await Promise.all([
    geocode(callback => geocoder.coord2Address(item.x, item.y, callback), services),
    geocode(callback => geocoder.coord2RegionCode(item.x, item.y, callback), services),
  ])
  const address = addresses[0]?.address
  const region = regions.find(entry => entry.region_type === 'B')
  if (!address || !region) return null
  return { ...parcelFromAddress({ ...address, b_code: region.code }), x: item.x, y: item.y }
}

export default function LocationSearch({ getMap, enabled, drawing, onParcel }) {
  const input = useRef(null)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [message, setMessage] = useState('')
  const [searching, setSearching] = useState(false)
  const [selected, setSelected] = useState(null)
  const marker = useRef(null)
  const requestId = useRef(0)

  useEffect(() => () => {
    requestId.current += 1
    marker.current?.setMap(null)
  }, [])

  async function search(event) {
    event.preventDefault()
    if (!enabled || drawing || searching) return
    const keyword = query.trim()
    if (!keyword) { setMessage('주소 또는 장소 이름을 입력하세요.'); return }
    const services = window.kakao?.maps?.services
    if (!services) { setMessage('검색 기능을 불러오지 못했습니다. 페이지를 새로고침해 주세요.'); return }
    const id = ++requestId.current
    setSearching(true); setMessage(''); setResults([]); setSelected(null)
    marker.current?.setMap(null)
    const lookup = run => new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timeout')), 10000)
      run((data, status) => {
        clearTimeout(timer)
        if (status === services.Status.OK) resolve(data)
        else if (status === services.Status.ZERO_RESULT) resolve([])
        else reject(new Error('search failed'))
      })
    })
    const responses = await Promise.allSettled([
      lookup(callback => new services.Geocoder().addressSearch(keyword, callback)),
      lookup(callback => new services.Places().keywordSearch(keyword, callback, { size: 10 })),
    ])
    if (id !== requestId.current) return
    // Address matches come first: a 지번 search should land on the parcel itself.
    const addresses = responses[0].status === 'fulfilled' ? responses[0].value.map((item, index) => ({
      id: 'address-' + index, kind: 'address', name: item.address?.address_name || item.address_name,
      address: item.road_address?.address_name ? '도로명 ' + item.road_address.address_name : '지번 주소',
      x: item.x, y: item.y, raw: item.address, parcelLevel: ['REGION_ADDR', 'ROAD_ADDR'].includes(item.address_type),
    })) : []
    const places = responses[1].status === 'fulfilled' ? responses[1].value.map(item => ({
      id: 'place-' + item.id, kind: 'place', name: item.place_name,
      address: item.road_address_name || item.address_name, x: item.x, y: item.y,
    })) : []
    const merged = [...addresses, ...places].slice(0, 15)
    setSearching(false)
    const failed = responses.some(response => response.status === 'rejected')
    if (merged.length === 1 && merged[0].kind === 'address') { choose(merged[0]); return }
    setResults(merged)
    if (!merged.length) setMessage(failed ? '검색에 실패했습니다. 잠시 후 다시 검색해 주세요.' : '검색 결과가 없습니다. 주소나 장소 이름을 확인해 주세요.')
    else if (failed) setMessage('일부 검색 결과만 표시합니다. 다시 검색해 볼 수 있습니다.')
  }

  async function choose(item) {
    const map = getMap()
    if (!map || drawing) return
    const k = window.kakao.maps
    const position = new k.LatLng(Number(item.y), Number(item.x))
    marker.current?.setMap(null)
    marker.current = new k.Marker({ map, position, title: item.name })
    map.setLevel(3)
    map.panTo(position)
    setSelected(item)
    setResults([])
    setMessage('')
    if (!onParcel) return
    const id = ++requestId.current
    try {
      const parcel = await resolveParcel(item, k.services)
      if (id !== requestId.current) return
      if (parcel) onParcel(parcel, { open: item.kind === 'address' && item.parcelLevel })
      else setMessage('이 위치의 지번을 확인하지 못했습니다. 지번 주소로 검색해 보세요.')
    } catch {
      if (id === requestId.current) setMessage('이 위치의 지번을 확인하지 못했습니다. 지번 주소로 검색해 보세요.')
    }
  }

  function clear() {
    requestId.current += 1
    marker.current?.setMap(null)
    setResults([]); setSelected(null); setMessage(''); setQuery(''); setSearching(false)
    input.current?.focus()
  }

  return <div className="location-search">
    <div id="location-search-panel" className="location-search-panel" onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); setResults([]) } }}>
    <form onSubmit={search} role="search" aria-label="지도 위치 검색">
      <input ref={input} aria-label="주소 또는 장소 검색" placeholder="지번·주소·장소 검색 · 예: 태평로1가 84" value={query} onChange={event => setQuery(event.target.value)} maxLength={100} disabled={!enabled || drawing} />
      <button type="submit" disabled={!enabled || drawing || searching}>{searching ? '검색 중…' : '검색'}</button>
    </form>
    {!enabled && <p className="location-notice">지도 연결 후 위치를 검색할 수 있습니다.</p>}
    {drawing && <p className="location-notice">그리기를 완료하거나 취소한 후 검색하세요.</p>}
    {message && <p className="location-notice" role="status">{message}</p>}
    {results.length > 0 && <div className="location-results"><div className="location-results-title"><span>검색 결과 {results.length}건</span><button type="button" onClick={clear}>닫기</button></div><ul>{results.map(item => <li key={item.id}><button type="button" disabled={drawing} onClick={() => choose(item)}><strong>{item.name}</strong><span>{item.address}</span></button></li>)}</ul></div>}
    {selected && <div className="location-selected"><div><strong>{selected.name}</strong><span>{selected.address}</span><small>지번은 자료 조회에 자동 입력됩니다. 임장기록은 ‘핀 찍기’로 저장하세요.</small></div><button type="button" onClick={clear} aria-label="검색 위치 지우기">✕</button></div>}
    </div>
  </div>
}
