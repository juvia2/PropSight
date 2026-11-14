import { useEffect } from 'react'
import PublicData from '../PublicData'

// Docked in the left rail like a record's detail so the map stays usable while looking up a parcel.
export default function PublicDataLookupModal({ open, busy, mapReady, parcel, autoLookup, onBusyChange, onClose }) {
  useEffect(() => {
    if (!open) return
    const onEscape = event => { if (event.key === 'Escape' && !busy) onClose() }
    window.addEventListener('keydown', onEscape)
    return () => window.removeEventListener('keydown', onEscape)
  }, [open, busy, onClose])
  if (!open) return null
  return <section className="listing-detail lookup-panel" role="dialog" aria-modal="false" aria-label="공공자료 조회">
    <div className="listing-detail-top">
      <span />
      <strong>건물 · 토지 자료 조회</strong>
      <button type="button" className="listing-close" aria-label="자료 조회 닫기" disabled={busy} onClick={onClose}>✕</button>
    </div>
    <div className="listing-detail-scroll">
      <PublicData key={parcel?.pnu || 'empty'} standalone canEdit busy={busy} onBusyChange={onBusyChange} mapReady={mapReady} initialParcel={parcel} autoLookup={autoLookup} />
    </div>
  </section>
}
