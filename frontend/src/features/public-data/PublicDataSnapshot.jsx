import { useState } from 'react'
import { readableValue, rowTitle, timestamp } from './publicDataUtils'

export default function PublicDataSnapshot({ snapshot }) {
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
