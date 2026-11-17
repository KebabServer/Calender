import { RefreshCw } from 'lucide-react'

export function UpdateNotice({ onUpdate, disabled = false }: { onUpdate: () => void; disabled?: boolean }) {
  return <div className={`update-notice ${disabled ? 'is-deferred' : ''}`} role="status">
    <span>{disabled ? 'Update ready. Finish or cancel your event first.' : 'A new version is ready.'}</span>
    <button className="button primary" disabled={disabled} onClick={onUpdate}><RefreshCw size={14}/>Update now</button>
  </div>
}
