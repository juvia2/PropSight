import { useEffect, useRef, useState } from 'react'

export default function LocationSearch({ getMap, enabled, drawing }) {
  const [open, setOpen] = useState(false)
  const input = useRef(null)
  const toggle = useRef(null)
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

  useEffect(() => {
    if (open) input.current?.focus()
  }, [open])

  function closePanel() {
    setOpen(false)
    toggle.current?.focus()
  }

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
      lookup(callback => new services.Places().keywordSearch(keyword, callback, { size: 10 })),
      lookup(callback => new services.Geocoder().addressSearch(keyword, callback)),
    ])
    if (id !== requestId.current) return
    const places = responses[0].status === 'fulfilled' ? responses[0].value.map(item => ({
      id: 'place-' + item.id, name: item.place_name,
      address: item.road_address_name || item.address_name, x: item.x, y: item.y,
    })) : []
    const addresses = responses[1].status === 'fulfilled' ? responses[1].value.map((item, index) => ({
      id: 'address-' + index, name: item.road_address?.building_name || item.address_name,
      address: item.road_address?.address_name || item.address_name, x: item.x, y: item.y,
    })) : []
    setResults([...places, ...addresses].slice(0, 15))
    setSearching(false)
    const failed = responses.some(response => response.status === 'rejected')
    if (!places.length && !addresses.length) setMessage(failed ? '검색에 실패했습니다. 잠시 후 다시 검색해 주세요.' : '검색 결과가 없습니다. 주소나 장소 이름을 확인해 주세요.')
    else if (failed) setMessage('일부 검색 결과만 표시합니다. 다시 검색해 볼 수 있습니다.')
  }

  function choose(item) {
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
  }

  function clear() {
    requestId.current += 1
    marker.current?.setMap(null)
    setResults([]); setSelected(null); setMessage(''); setQuery(''); setSearching(false)
  }

  return <div className="location-search">
    <button ref={toggle} type="button" className="location-toggle" aria-expanded={open} aria-controls="location-search-panel" onClick={() => setOpen(previous => !previous)}>{open ? '✕ 검색 닫기' : '⌕ 위치 검색'}</button>
    <div id="location-search-panel" className="location-search-panel" hidden={!open} onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); closePanel() } }}>

    <form onSubmit={search} role="search" aria-label="지도 위치 검색">
      <input ref={input} aria-label="주소 또는 장소 검색" placeholder="주소 또는 장소 검색 · 예: 성수역" value={query} onChange={event => setQuery(event.target.value)} maxLength={100} disabled={!enabled || drawing} />
      <button type="submit" disabled={!enabled || drawing || searching}>{searching ? '검색 중…' : '검색'}</button>
    </form>
    {!enabled && <p className="location-notice">지도 연결 후 위치를 검색할 수 있습니다.</p>}
    {drawing && <p className="location-notice">그리기를 완료하거나 취소한 후 검색하세요.</p>}
    {message && <p className="location-notice" role="status">{message}</p>}
    {results.length > 0 && <div className="location-results"><div className="location-results-title"><span>검색 결과 {results.length}건</span><button type="button" onClick={clear}>닫기</button></div><ul>{results.map(item => <li key={item.id}><button type="button" disabled={drawing} onClick={() => choose(item)}><strong>{item.name}</strong><span>{item.address}</span></button></li>)}</ul></div>}
    {selected && <div className="location-selected"><div><strong>{selected.name}</strong><span>{selected.address}</span><small>검색 위치입니다. 임장기록은 ‘핀 찍기’로 저장하세요.</small></div><button type="button" onClick={clear} aria-label="검색 위치 지우기">✕</button></div>}
    </div>
  </div>
}
