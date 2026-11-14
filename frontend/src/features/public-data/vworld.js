// VWorld blocks overseas servers (Render runs in Singapore), so these layers are
// read from the user's browser through VWorld's JSONP data API.
import { request } from '../../api'
import { geometryAnchor } from './publicDataUtils'

const DATA_API = 'https://api.vworld.kr/req/data'

export const ZONING_LAYERS = [
  ['LT_C_UQ111', '용도지역', '도시지역'], ['LT_C_UQ112', '용도지역', '관리지역'], ['LT_C_UQ113', '용도지역', '농림지역'], ['LT_C_UQ114', '용도지역', '자연환경보전지역'],
  ['LT_C_UQ121', '용도지구', '경관지구'], ['LT_C_UQ123', '용도지구', '고도지구'], ['LT_C_UQ124', '용도지구', '방화지구'], ['LT_C_UQ125', '용도지구', '방재지구'],
  ['LT_C_UQ126', '용도지구', '보호지구'], ['LT_C_UQ128', '용도지구', '취락지구'], ['LT_C_UQ129', '용도지구', '개발진흥지구'], ['LT_C_UQ130', '용도지구', '특정용도제한지구'],
  ['LT_C_UQ141', '용도구역', '국토계획구역'], ['LT_C_UQ162', '용도구역', '도시자연공원구역'], ['LT_C_UD801', '용도구역', '개발제한구역'],
]
export const DISTRICT_LAYER = ['LT_C_UPISUQ161', '지구단위계획', '지구단위계획구역']
export const FACILITY_LAYERS = [
  ['LT_C_UPISUQ151', '도시계획시설', '도로'], ['LT_C_UPISUQ152', '도시계획시설', '교통시설'], ['LT_C_UPISUQ153', '도시계획시설', '공간시설'],
  ['LT_C_UPISUQ154', '도시계획시설', '유통·공급시설'], ['LT_C_UPISUQ155', '도시계획시설', '공공·문화체육시설'], ['LT_C_UPISUQ156', '도시계획시설', '방재시설'],
  ['LT_C_UPISUQ157', '도시계획시설', '보건위생시설'], ['LT_C_UPISUQ158', '도시계획시설', '환경기초시설'], ['LT_C_UPISUQ159', '도시계획시설', '기타기반시설'],
]

let configPromise = null
export function vworldConfig() {
  configPromise ||= request('/api/public-data/client-config').catch(error => { configPromise = null; throw error })
  return configPromise
}

let sequence = 0
function jsonp(params) {
  return new Promise((resolve, reject) => {
    const name = `__propsightVworld${Date.now()}${sequence++}`
    const script = document.createElement('script')
    const cleanup = () => { clearTimeout(timer); delete window[name]; script.remove() }
    const timer = setTimeout(() => { cleanup(); reject(new Error('브이월드 응답이 지연되었습니다. 잠시 후 다시 조회해 주세요.')) }, 12000)
    window[name] = data => { cleanup(); resolve(data) }
    script.onerror = () => { cleanup(); reject(new Error('브이월드에 연결하지 못했습니다. 네트워크를 확인해 주세요.')) }
    script.src = `${DATA_API}?${new URLSearchParams({ ...params, callback: name })}`
    document.head.appendChild(script)
  })
}

async function getFeatures(config, data, filter) {
  const result = await jsonp({
    service: 'data', version: '2.0', request: 'GetFeature', format: 'json', errorFormat: 'json',
    size: '100', page: '1', crs: 'EPSG:4326', geometry: filter.geometry ? 'true' : 'false', attribute: 'true',
    key: config.vworld_key, domain: config.vworld_domain || window.location.origin, data,
    ...(filter.attrFilter ? { attrFilter: filter.attrFilter } : { geomFilter: filter.geomFilter }),
  })
  const response = result?.response
  if (response?.status === 'NOT_FOUND') return []
  if (response?.status !== 'OK') {
    const code = response?.error?.code || ''
    if (/KEY|DOMAIN/i.test(code)) throw new Error('브이월드 인증키 또는 등록 도메인을 확인해 주세요.')
    throw new Error('브이월드가 조회를 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.')
  }
  return response.result?.featureCollection?.features || []
}

const round = value => Number(value).toFixed(7)
function outerRing(geometry) {
  if (geometry?.type === 'Polygon') return geometry.coordinates[0]
  if (geometry?.type === 'MultiPolygon') return geometry.coordinates.map(polygon => polygon[0]).sort((a, b) => b.length - a.length)[0]
  return null
}

// Shrink the parcel slightly so neighbouring areas that only touch its boundary are not reported.
function insetPolygon(ring) {
  const center = geometryAnchor({ type: 'Polygon', coordinates: [ring] })
  if (!center || ring.length > 300) return null
  const points = ring.map(([x, y]) => `${round(center[0] + (x - center[0]) * 0.97)} ${round(center[1] + (y - center[1]) * 0.97)}`)
  if (points[0] !== points.at(-1)) points.push(points[0])
  return `POLYGON((${points.join(',')}))`
}

const pick = (props, keys) => keys.map(key => props?.[key]).find(value => value !== undefined && value !== null && !['', '미분류'].includes(String(value).trim()))

function describe(layer, feature) {
  const props = feature.properties || {}
  const name = pick(props, ['uname', 'dgm_nm', 'atr_nam', 'scl_nam', 'mls_nam', 'lcl_nam']) || layer[2]
  const year = pick(props, ['dyear'])
  const number = pick(props, ['dnum'])
  const notice = [year && year !== '0000' ? `${year}년` : '', number && number !== '0000' ? `고시 ${number}` : ''].filter(Boolean).join(' ')
  return {
    group: layer[1], layer: layer[2], name: String(name).trim(),
    area: pick(props, ['sig_nam', 'sigg_name']),
    status: pick(props, ['exc_nam']),
    notice,
  }
}

function unique(items) {
  const seen = new Set()
  return items.filter(item => { const key = `${item.group}|${item.name}|${item.status || ''}`; if (seen.has(key)) return false; seen.add(key); return true })
}

export async function lookupLandUse(parcel) {
  const config = await vworldConfig()
  if (!config.vworld_key) throw new Error('브이월드 인증키(VWORLD_API_KEY)가 설정되지 않았습니다.')
  const parcels = await getFeatures(config, 'LP_PA_CBND_BUBUN', { attrFilter: `pnu:=:${parcel.pnu}`, geometry: true })
  const land = parcels[0]
  const ring = outerRing(land?.geometry)
  const anchor = ring ? geometryAnchor({ type: 'Polygon', coordinates: [ring] }) : (parcel.x && parcel.y ? [Number(parcel.x), Number(parcel.y)] : null)
  if (!anchor) throw new Error('필지 위치를 찾지 못했습니다. 지번 주소로 다시 검색해 주세요.')
  const geomFilter = (ring && insetPolygon(ring)) || `POINT(${round(anchor[0])} ${round(anchor[1])})`
  const layers = [...ZONING_LAYERS, DISTRICT_LAYER, ...FACILITY_LAYERS]
  const settled = []
  for (let index = 0; index < layers.length; index += 6) {
    const batch = layers.slice(index, index + 6)
    settled.push(...await Promise.allSettled(batch.map(layer => getFeatures(config, layer[0], { geomFilter }).then(features => features.map(feature => describe(layer, feature))))))
  }
  const authError = settled.find(item => item.status === 'rejected' && /인증키|도메인/.test(item.reason?.message))
  if (authError) throw authError.reason
  const failed = settled.filter(item => item.status === 'rejected').length
  const rows = unique(settled.flatMap(item => item.status === 'fulfilled' ? item.value : []))
  const props = land?.properties || {}
  return {
    pnu: parcel.pnu,
    address: props.addr || parcel.address,
    anchor,
    basic: land ? { jibun: props.jibun, price: props.jiga, priceDate: [props.gosi_year, props.gosi_month].filter(Boolean).join('.') } : null,
    zoning: rows.filter(row => ['용도지역', '용도지구', '용도구역'].includes(row.group)),
    district: rows.filter(row => row.group === '지구단위계획'),
    facilities: rows.filter(row => row.group === '도시계획시설'),
    partial: failed > 0,
    fetchedAt: new Date().toISOString(),
  }
}

export const seoulPortalUrl = pnu => `https://urban.seoul.go.kr/view/map/main.html?pnu=${pnu}`
export const eumUrl = pnu => `https://www.eum.go.kr/web/ar/lu/luLandDet.jsp?pnu=${pnu}&mode=search&isNoScr=script&selGbn=umd`
