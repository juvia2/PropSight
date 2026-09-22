import { useEffect, useState } from 'react'
import { request } from './api'

const API = import.meta.env.VITE_API_URL || ''
const dateFormat = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' })
const fileSize = bytes => bytes < 1024 * 1024 ? Math.max(1, Math.ceil(bytes / 1024)) + ' KB' : (bytes / (1024 * 1024)).toFixed(1) + ' MB'

export default function Attachments({ resource, recordId, canEdit, busy, onBusyChange }) {
  const [files, setFiles] = useState([])
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState('')
  const [progress, setProgress] = useState('')
  const [retry, setRetry] = useState(0)
  const path = '/api/' + resource + '/' + recordId + '/attachments'

  useEffect(() => {
    let cancelled = false
    request(path).then(data => {
      if (!cancelled) { setFiles(data); setStatus('ready') }
    }).catch(e => {
      if (!cancelled) { setError(e.message); setStatus('error') }
    })
    return () => { cancelled = true }
  }, [path, retry])

  async function upload(event) {
    const selected = Array.from(event.target.files || [])
    event.target.value = ''
    if (!selected.length) return
    if (files.length + selected.length > 20) { setError('기록당 최대 20개까지 첨부할 수 있습니다.'); return }
    onBusyChange(true); setError('')
    const failures = []
    try {
      for (let index = 0; index < selected.length; index++) {
        const file = selected[index]
        if (file.size > 10 * 1024 * 1024 || !file.size) {
          failures.push(file.name + ': 빈 파일 또는 10MB 초과 파일입니다.')
          continue
        }
        setProgress('첨부 저장 중 ' + (index + 1) + '/' + selected.length)
        const body = new FormData()
        body.append('file', file)
        try {
          const saved = await request(path, { method: 'POST', body })
          setFiles(previous => [saved, ...previous])
        } catch (e) { failures.push(file.name + ': ' + e.message) }
      }
      if (failures.length) setError(failures.join('\n'))
    } finally { setProgress(''); onBusyChange(false) }
  }

  async function remove(file) {
    if (!window.confirm('“' + file.filename + '” 첨부파일을 삭제할까요?')) return
    onBusyChange(true); setError('')
    try {
      await request(path + '/' + file.id, { method: 'DELETE' })
      setFiles(previous => previous.filter(item => item.id !== file.id))
    } catch (e) { setError(e.message) }
    finally { onBusyChange(false) }
  }

  return <section className="attachments" aria-label="첨부 이미지와 파일">
    <div className="panel-title"><h3>이미지 · 파일 첨부</h3><span>{files.length}/20</span></div>
    {canEdit && <label className="attachment-picker">이미지 또는 파일 선택<input type="file" multiple onChange={upload} disabled={busy || status !== 'ready'} /><small>선택 즉시 저장 · 파일당 10MB · 최대 20개</small></label>}
    {progress && <p role="status">{progress}</p>}
    {error && <p className="attachment-error" role="alert">{error}</p>}
    {status === 'loading' && <p className="hint">첨부파일을 불러오는 중…</p>}
    {status === 'error' && <button type="button" className="refresh" onClick={() => { setError(''); setStatus('loading'); setRetry(value => value + 1) }}>첨부파일 다시 불러오기</button>}
    {status === 'ready' && !files.length && <p className="hint">첨부된 파일이 없습니다.</p>}
    <ul className="attachment-list">{files.map(file => <li key={file.id}>
      {file.is_image && <a href={API + path + '/' + file.id + '?preview=true'} target="_blank" rel="noreferrer" aria-label={file.filename + ' 이미지 크게 보기'}><img src={API + path + '/' + file.id + '?preview=true'} alt={file.filename} loading="lazy" /></a>}
      <div className="attachment-info"><a href={API + path + '/' + file.id}>{file.filename}</a><small>{fileSize(file.size)} · {dateFormat.format(new Date(file.created_at))} · @{file.author_username}</small><div className="attachment-actions"><a href={API + path + '/' + file.id}>다운로드</a>{canEdit && <button type="button" disabled={busy} onClick={() => remove(file)}>삭제</button>}</div></div>
    </li>)}</ul>
  </section>
}
