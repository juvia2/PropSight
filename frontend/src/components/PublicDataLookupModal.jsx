import PublicData from '../PublicData'

export default function PublicDataLookupModal({ open, busy, mapReady, onBusyChange, onClose }) {
  if (!open) return null
  return <div className="modal-backdrop"><section className="modal" role="dialog" aria-modal="true" aria-label="공공자료 조회">
    <div className="panel-title"><h2>공공자료 조회</h2><button type="button" aria-label="공공자료 조회 닫기" disabled={busy} onClick={onClose}>✕</button></div>
    <PublicData standalone canEdit busy={busy} onBusyChange={onBusyChange} mapReady={mapReady} />
  </section></div>
}
