import { useCallback, useEffect, useRef, useState } from 'react'
import { CATEGORIES, COLORS, HAS_MAP_KEY } from '../config'

// Seoul Finance Center (136 Sejong-daero, Jung-gu, Seoul).
const DEFAULT_MAP_CENTER = { latitude: 37.5651, longitude: 126.9770 }

export default function useKakaoMap({ visible, cadastral, onSelect, onDrawn }) {
  const [status, setStatus] = useState(() => HAS_MAP_KEY ? 'loading' : 'key')
  const [error, setError] = useState('')
  const [drawing, setDrawing] = useState(false)
  const mapNode = useRef(null)
  const map = useRef(null)
  const manager = useRef(null)
  const draft = useRef(null)
  const onSelectRef = useRef(onSelect)
  const onDrawnRef = useRef(onDrawn)

  useEffect(() => { onSelectRef.current = onSelect }, [onSelect])
  useEffect(() => { onDrawnRef.current = onDrawn }, [onDrawn])

  useEffect(() => {
    let disposed = false
    let initialized = false
    if (!HAS_MAP_KEY) return

    const diagnose = async () => {
      try {
        const response = await fetch('/__map-status')
        const data = await response.json()
        if (!disposed) setError(data.message)
      } catch {
        if (!disposed) setError('앱 키, 카카오맵 사용 설정, 등록 도메인과 네트워크를 확인하세요.')
      }
    }
    const initialize = () => {
      if (disposed || initialized || !window.kakao?.maps?.load) return
      initialized = true
      window.kakao.maps.load(() => {
        if (disposed) return
        const kakaoMaps = window.kakao.maps
        if (!kakaoMaps.drawing) {
          setStatus('error')
          return
        }
        map.current = new kakaoMaps.Map(mapNode.current, {
          center: new kakaoMaps.LatLng(DEFAULT_MAP_CENTER.latitude, DEFAULT_MAP_CENTER.longitude),
          level: 4,
        })
        const drawingManager = new kakaoMaps.drawing.DrawingManager({
          map: map.current,
          drawingMode: [kakaoMaps.drawing.OverlayType.MARKER, kakaoMaps.drawing.OverlayType.POLYGON],
          guideTooltip: ['draw', 'drag', 'edit'],
          markerOptions: { draggable: false, removable: false },
          polygonOptions: {
            draggable: false,
            removable: false,
            editable: false,
            strokeWeight: 3,
            strokeColor: COLORS[CATEGORIES[0]],
            fillColor: COLORS[CATEGORIES[0]],
            fillOpacity: 0.2,
          },
        })
        manager.current = drawingManager
        drawingManager.addListener('drawend', event => {
          const data = drawingManager.getData()[event.overlayType]?.at(-1)
          if (!data || !draft.current) return
          let geometry
          if (event.overlayType === 'marker') {
            geometry = { type: 'Point', coordinates: [data.x, data.y] }
          } else {
            const ring = data.points.map(point => [point.x, point.y])
            if (JSON.stringify(ring[0]) !== JSON.stringify(ring.at(-1))) ring.push([...ring[0]])
            geometry = { type: 'Polygon', coordinates: [ring] }
          }
          const payload = { ...draft.current, geometry }
          draft.current = null
          drawingManager.remove(event.target)
          drawingManager.cancel()
          setDrawing(false)
          onDrawnRef.current(payload)
        })
        setStatus('ready')
      })
    }

    initialize()
    const interval = setInterval(initialize, 200)
    const timeout = setTimeout(() => {
      if (!map.current) {
        setStatus('error')
        diagnose()
      }
      clearInterval(interval)
    }, 15000)
    return () => {
      disposed = true
      clearInterval(interval)
      clearTimeout(timeout)
      manager.current?.cancel()
      manager.current = null
      map.current = null
    }
  }, [])

  useEffect(() => {
    if (status !== 'ready' || !map.current) return
    const kakaoMaps = window.kakao.maps
    const overlays = visible.map(item => {
      const color = COLORS[item.properties.category]
      if (item.geometry.type === 'Point') {
        const button = document.createElement('button')
        button.className = 'map-pin'
        button.style.background = color
        button.title = item.properties.name
        button.textContent = '●'
        button.onclick = () => onSelectRef.current(item)
        const [longitude, latitude] = item.geometry.coordinates
        return new kakaoMaps.CustomOverlay({
          map: map.current,
          position: new kakaoMaps.LatLng(latitude, longitude),
          content: button,
          yAnchor: 1,
        })
      }
      const polygon = new kakaoMaps.Polygon({
        map: map.current,
        path: item.geometry.coordinates.map(ring => ring.map(([longitude, latitude]) => new kakaoMaps.LatLng(latitude, longitude))),
        strokeWeight: 3,
        strokeColor: color,
        fillColor: color,
        fillOpacity: 0.2,
      })
      kakaoMaps.event.addListener(polygon, 'click', () => onSelectRef.current(item))
      return polygon
    })
    return () => overlays.forEach(overlay => overlay.setMap(null))
  }, [visible, status])

  useEffect(() => {
    if (status !== 'ready' || !map.current || !cadastral) return
    const currentMap = map.current
    const layer = window.kakao.maps.MapTypeId.USE_DISTRICT
    currentMap.addOverlayMapTypeId(layer)
    return () => currentMap.removeOverlayMapTypeId(layer)
  }, [cadastral, status])

  const startDrawing = useCallback((type, payload) => {
    if (!manager.current) return false
    draft.current = payload
    const overlayType = window.kakao.maps.drawing.OverlayType
    manager.current.setStyle(overlayType.POLYGON, 'strokeColor', COLORS[payload.category])
    manager.current.setStyle(overlayType.POLYGON, 'fillColor', COLORS[payload.category])
    manager.current.select(overlayType[type])
    setDrawing(true)
    return true
  }, [])

  const cancelDrawing = useCallback(() => {
    manager.current?.cancel()
    draft.current = null
    setDrawing(false)
  }, [])

  const focus = useCallback(item => {
    if (!map.current) return
    const position = item.geometry.type === 'Point' ? item.geometry.coordinates : item.geometry.coordinates[0][0]
    map.current.panTo(new window.kakao.maps.LatLng(position[1], position[0]))
  }, [])

  const getMap = useCallback(() => map.current, [])

  return { mapNode, getMap, status, error, drawing, startDrawing, cancelDrawing, focus }
}
