import { useMemo, useState } from 'react'
import { diffChars } from 'diff'

const dateFormat = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' })
const timeFormat = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', second: '2-digit' })

function SavedMemo({ revision, previous }) {
  const parts = useMemo(() => previous ? diffChars(previous.memo, revision.memo, { timeout: 50 }) : null, [previous, revision])
  const changed = previous && previous.memo !== revision.memo
  const removed = parts?.filter(part => part.removed) || []
  return <article className="revision-entry">
    <div className="revision-meta"><time dateTime={revision.saved_at}>{timeFormat.format(new Date(revision.saved_at))}</time><span>{revision.author_name} (@{revision.author_username})</span></div>
    <p className="revision-caption">{!previous ? '비교할 이전 저장 이력 없음' : changed ? '이전 저장 대비 추가·수정된 글을 초록색으로 표시합니다.' : '이전 저장과 메모 내용이 같습니다.'}</p>
    {changed && !parts && <p className="revision-caption">변경량이 많아 강조 표시 대신 저장된 전체 내용을 표시합니다.</p>}
    <p className="revision-memo">{!revision.memo ? '메모 없음' : parts ? parts.filter(part => !part.removed).map((part, index) => part.added ? <mark className="memo-added" key={index}>{part.value}</mark> : <span key={index}>{part.value}</span>) : revision.memo}</p>
    {removed.length > 0 && <div className="memo-removed"><strong>이전 메모 원문 · 삭제·교체된 부분은 취소선</strong><p className="memo-original">{parts.filter(part => !part.added).map((part, index) => part.removed ? <del key={index}>{part.value}</del> : <span key={index}>{part.value}</span>)}</p></div>}
  </article>
}

function HistoryDay({ date, entries }) {
  const [open, setOpen] = useState(false)
  const changed = entries.some(({ revision, previous }) => previous && revision.memo !== previous.memo)
  return <li className="revision">
    <details onToggle={event => setOpen(event.currentTarget.open)}>
      <summary><time dateTime={entries[0].revision.saved_at}>{date}</time>{changed && <span className="revision-changed">수정됨</span>}</summary>
      {open && <div className="revision-day-content">{entries.map(({ revision, previous }) => <SavedMemo key={revision.id} revision={revision} previous={previous} />)}</div>}
    </details>
  </li>
}

export default function MemoHistory({ revisions, status }) {
  const days = useMemo(() => {
    const groups = new Map()
    revisions.forEach((revision, index) => {
      const date = dateFormat.format(new Date(revision.saved_at))
      if (!groups.has(date)) groups.set(date, [])
      groups.get(date).push({ revision, previous: revisions[index + 1] })
    })
    return [...groups]
  }, [revisions])
  return <section className="revision-section" aria-label="메모 저장 이력">
    <div className="panel-title"><h3>메모 저장 이력</h3><span>{status === 'ready' ? revisions.length + '건' : ''}</span></div>
    {status === 'loading' && <p className="hint">이력을 불러오는 중…</p>}
    {status === 'error' && <p role="alert" className="hint">이력을 불러오지 못했습니다. 기록을 다시 열어 주세요.</p>}
    {status === 'ready' && (days.length ? <><p className="hint">날짜를 누르면 당시 메모와 수정 내용을 확인할 수 있습니다.</p><ol className="revision-list">{days.map(([date, entries]) => <HistoryDay key={date} date={date} entries={entries} />)}</ol></> : <p className="hint">이전 저장 이력이 없습니다. 다음 저장부터 기록됩니다.</p>)}
  </section>
}
