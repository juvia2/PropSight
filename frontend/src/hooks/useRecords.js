import { useCallback, useEffect, useState } from 'react'
import { jsonOptions, request } from '../api'

const RESOURCES = ['properties', 'commercial_blocks']

export default function useRecords(teamId = '') {
  const [items, setItems] = useState([])
  const [directory, setDirectory] = useState({ teams: [], users: [] })
  const [status, setStatus] = useState('API 연결 중')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [pending, setPending] = useState(null)
  const [editing, setEditing] = useState(null)
  const [revisions, setRevisions] = useState([])
  const [revisionStatus, setRevisionStatus] = useState('loading')

  const reload = useCallback(async () => {
    try {
      const collections = await Promise.all(RESOURCES.map(async resource => {
        const query = teamId ? `?team_id=${encodeURIComponent(teamId)}` : ''
        const data = await request(`/api/${resource}${query}`)
        return data.features.map(item => ({ ...item, resource }))
      }))
      const people = await request('/api/directory')
      setDirectory(people)
      setItems(collections.flat())
      setStatus('PostGIS 연결됨')
    } catch (requestError) {
      setStatus('API 연결 실패')
      setError(requestError.message)
    }
  }, [teamId])

  useEffect(() => {
    reload()
  }, [reload])

  const createRecord = useCallback(async payload => {
    setBusy(true)
    setError('')
    try {
      const resource = payload.geometry.type === 'Point' ? 'properties' : 'commercial_blocks'
      const feature = await request(`/api/${resource}`, jsonOptions('POST', payload))
      const record = { ...feature, resource }
      setItems(previous => [record, ...previous])
      setEditing(record)
      setPending(null)
      return true
    } catch (requestError) {
      setError(requestError.message)
      setPending(payload)
      return false
    } finally {
      setBusy(false)
    }
  }, [])

  const updateRecord = useCallback(async values => {
    if (!editing) return
    setBusy(true)
    setError('')
    try {
      const result = await request(
        `/api/${editing.resource}/${editing.id}`,
        jsonOptions('PUT', { ...values, geometry: editing.geometry }),
      )
      const updated = { ...result, resource: editing.resource }
      setItems(previous => previous.map(item => item.resource === editing.resource && item.id === editing.id ? updated : item))
      setEditing(updated)
      try {
        setRevisions(await request(`/api/${editing.resource}/${editing.id}/revisions`))
        setRevisionStatus('ready')
      } catch {
        setRevisionStatus('error')
      }
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setBusy(false)
    }
  }, [editing])

  const deleteRecord = useCallback(async () => {
    if (!editing || !window.confirm(`“${editing.properties.name}” 기록을 삭제할까요?`)) return
    setBusy(true)
    setError('')
    try {
      await request(`/api/${editing.resource}/${editing.id}`, { method: 'DELETE' })
      setItems(previous => previous.filter(item => !(item.resource === editing.resource && item.id === editing.id)))
      setEditing(null)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setBusy(false)
    }
  }, [editing])

  const editingResource = editing?.resource
  const editingId = editing?.id

  useEffect(() => {
    if (!editing) {
      setRevisions([])
      return
    }
    let cancelled = false
    setRevisionStatus('loading')
    request(`/api/${editingResource}/${editingId}/revisions`)
      .then(data => { if (!cancelled) { setRevisions(data); setRevisionStatus('ready') } })
      .catch(() => { if (!cancelled) setRevisionStatus('error') })
    return () => { cancelled = true }
  }, [editing, editingResource, editingId])

  return {
    items,
    directory,
    status,
    error,
    busy,
    pending,
    editing,
    revisions,
    revisionStatus,
    reload,
    createRecord,
    updateRecord,
    deleteRecord,
    setError,
    setBusy,
    setPending,
    setEditing,
  }
}
