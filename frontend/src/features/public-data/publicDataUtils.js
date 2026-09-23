export const timestamp = value => new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul', dateStyle: 'medium', timeStyle: 'short',
}).format(new Date(value))

export const hasPnu = value => /^[0-9]{10}[12][0-9]{8}$/.test(value)

export const readableValue = value => {
  if (value === null || value === undefined || typeof value === 'object') return ''
  const text = String(value).replace(/\s+/g, ' ').trim()
  return text && /[\p{L}\p{N}]/u.test(text) ? text : ''
}

export function rowTitle(row, index) {
  const preferred = ['bldNm', 'platPlc', 'newPlatPlc', 'mainPurpsCdNm', 'prposAreaDstrcCodeNm', 'archGbCdNm', 'pmsDay', 'useAprDay']
  const detail = preferred.map(key => readableValue(row[key])).find(Boolean)
  return `상세 정보 ${index + 1}${detail ? ` · ${detail}` : ''}`
}

export function geometryAnchor(geometry) {
  if (geometry?.type === 'Point') return geometry.coordinates
  const ring = geometry?.type === 'Polygon' ? geometry.coordinates?.[0] : null
  if (!Array.isArray(ring) || ring.length < 3) return null
  const closes = ring.length > 3 && ring[0][0] === ring.at(-1)[0] && ring[0][1] === ring.at(-1)[1]
  const points = closes ? ring.slice(0, -1) : ring
  const [originX, originY] = points[0]
  let twiceArea = 0
  let longitude = 0
  let latitude = 0
  points.forEach((point, index) => {
    const next = points[(index + 1) % points.length]
    const x = point[0] - originX
    const y = point[1] - originY
    const nextX = next[0] - originX
    const nextY = next[1] - originY
    const cross = x * nextY - nextX * y
    twiceArea += cross
    longitude += (x + nextX) * cross
    latitude += (y + nextY) * cross
  })
  if (Math.abs(twiceArea) > 1e-12) return [originX + longitude / (3 * twiceArea), originY + latitude / (3 * twiceArea)]
  return [
    points.reduce((sum, point) => sum + point[0], 0) / points.length,
    points.reduce((sum, point) => sum + point[1], 0) / points.length,
  ]
}

export function parcelFromAddress(address) {
  const main = String(address.main_address_no || '')
  const sub = String(address.sub_address_no || '0')
  if (!/^[0-9]{10}$/.test(address.b_code || '') || !/^[0-9]{1,4}$/.test(main) || !/^[0-9]{1,4}$/.test(sub)) {
    throw new Error('지번 정보를 확인할 수 없습니다. 다른 지번 주소를 선택하거나 필지번호를 입력해 주세요.')
  }
  return { pnu: address.b_code + (address.mountain_yn === 'Y' ? '2' : '1') + main.padStart(4, '0') + sub.padStart(4, '0'), address: address.address_name }
}

export function geocode(run, services) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('주소 확인 시간이 초과되었습니다. 다시 시도해 주세요.')), 10000)
    run((data, status) => {
      clearTimeout(timer)
      if (status === services.Status.OK) resolve(data)
      else reject(new Error('지번을 찾지 못했습니다. 주소를 다시 검색해 주세요.'))
    })
  })
}
