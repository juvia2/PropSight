import { useEffect, useRef, useState } from 'react'
import { hasPnu, timestamp } from './publicDataUtils'
import { eumUrl, lookupLandUse, seoulPortalUrl } from './vworld'

const SEOUL_SECTIONS = ['기본정보', '토지이용계획확인서', '도시계획', '도시계획사업', '가로구역별 건축물 높이기준']

function Rows({ items, empty }) {
  if (!items.length) return <p className="hint">{empty}</p>
  return <ul className="land-use-list">{items.map(item => <li key={`${item.group}-${item.layer}-${item.name}-${item.status || ''}`}>
    <strong>{item.name}</strong>
    <span>{[item.group === item.layer ? '' : item.layer, item.status, item.notice].filter(Boolean).join(' · ')}</span>
  </li>)}</ul>
}

export default function LandUsePlan({ parcel, autoRun = false, preview = null }) {
  const [state, setState] = useState(() => preview ? { status: 'ready', result: preview, error: '' } : { status: 'idle', result: null, error: '' })
  const ran = useRef('')
  const valid = hasPnu(parcel.pnu)
  const seoul = valid && parcel.pnu.startsWith('11')

  async function run() {
    if (!valid || state.status === 'loading' || preview) return
    setState({ status: 'loading', result: null, error: '' })
    try { setState({ status: 'ready', result: await lookupLandUse(parcel), error: '' }) }
    catch (error) { setState({ status: 'error', result: null, error: error.message }) }
  }

  useEffect(() => {
    if (!autoRun || !valid || ran.current === parcel.pnu) return
    ran.current = parcel.pnu
    run()
    // Run once per auto-filled parcel.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRun, valid, parcel.pnu])

  if (!valid) return null
  const result = state.result?.pnu === parcel.pnu ? state.result : null

  return <section className="land-use" aria-label="토지이용계획 및 지구단위계획">
    <div className="land-use-head">
      <h3>토지이용계획 · 지구단위계획</h3>
      <button type="button" className="refresh" disabled={state.status === 'loading'} onClick={run}>{state.status === 'loading' ? '조회 중…' : result ? '다시 조회' : '조회'}</button>
    </div>
    {state.status === 'idle' && <p className="hint">용도지역·지구·구역, 지구단위계획구역, 도시계획시설을 브이월드에서 조회합니다.</p>}
    {state.status === 'error' && <p className="public-error" role="alert">{state.error}</p>}
    {result && <div className="land-use-body">
      {result.basic && <dl className="land-use-basic">
        <div><dt>소재지</dt><dd>{result.address || parcel.address}</dd></div>
        {result.basic.price && <div><dt>개별공시지가</dt><dd>{Number(result.basic.price).toLocaleString('ko-KR')}원/㎡{result.basic.priceDate ? ` (${result.basic.priceDate})` : ''}</dd></div>}
      </dl>}
      <h4>지구단위계획구역</h4>
      <Rows items={result.district} empty="이 필지에서 확인된 지구단위계획구역이 없습니다." />
      <h4>용도지역 · 지구 · 구역</h4>
      <Rows items={result.zoning} empty="조회된 용도지역·지구·구역이 없습니다." />
      <h4>도시계획시설</h4>
      <Rows items={result.facilities} empty="필지에 걸친 도시계획시설이 없습니다." />
      {result.partial && <p className="public-error">일부 항목을 불러오지 못했습니다. 다시 조회하거나 아래 공식 사이트에서 확인해 주세요.</p>}
      <p className="hint">조회 {timestamp(result.fetchedAt)} · 브이월드 공간정보 기준이며 법적 효력이 있는 확인서가 아닙니다. 경계에 걸친 항목은 누락될 수 있습니다.</p>
    </div>}
    <div className="land-use-links">
      <a className="land-use-link" href={eumUrl(parcel.pnu)} target="_blank" rel="noreferrer"><strong>토지이음 토지이용계획 열람</strong><small>지목·면적·지역지구·확인도면</small></a>
      {seoul && <a className="land-use-link" href={seoulPortalUrl(parcel.pnu)} target="_blank" rel="noreferrer"><strong>서울도시공간포털에서 열기</strong><small>{SEOUL_SECTIONS.join(' · ')}</small></a>}
    </div>
    {seoul && <p className="hint">서울도시공간포털은 해당 지번이 선택된 상태로 열립니다. 검색 결과의 지번을 누르면 위 항목을 볼 수 있습니다.</p>}
  </section>
}
