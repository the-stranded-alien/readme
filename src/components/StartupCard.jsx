import { Sparkles, X } from '../icons'

/**
 * A small, non-blocking card in the corner: "Welcome" (offers the tour) on a first visit, or
 * "What's new" after an update (each release can have a "Show me" button).
 */
export default function StartupCard({ notice, onTour, onShow, onClose }) {
  if (!notice) return null
  if (notice.kind === 'welcome') {
    return (
      <section className="startup-card anim-pop-in no-print" role="region" aria-labelledby="startup-title">
        <div className="startup-head">
          <h2 id="startup-title"><Sparkles size={15} aria-hidden="true" />Welcome to ReadMe</h2>
          <button type="button" className="btn-icon" onClick={onClose} aria-label="Close welcome"><X size={13} /></button>
        </div>
        <p>Take a one-minute look at where everything is.</p>
        <div className="startup-actions">
          <button type="button" className="reader-chip" onClick={onClose}>Not now</button>
          <button type="button" className="pdf-dialog-primary" onClick={onTour}>Take the tour</button>
        </div>
      </section>
    )
  }
  return (
    <section className="startup-card anim-pop-in no-print" role="region" aria-labelledby="startup-title">
      <div className="startup-head">
        <h2 id="startup-title"><Sparkles size={15} aria-hidden="true" />What’s new in ReadMe {notice.releases[0].version}</h2>
        <button type="button" className="btn-icon" onClick={onClose} aria-label="Close what’s new"><X size={13} /></button>
      </div>
      <div className="startup-releases">
        {notice.releases.map(release => (
          <div key={release.version} className="startup-release">
            {notice.releases.length > 1 && <h3>Version {release.version}</h3>}
            <ul>{release.notes.map(note => <li key={note}>{note}</li>)}</ul>
            {release.show && <button type="button" className="reader-chip startup-show" onClick={() => onShow(release.show)}>Show me</button>}
          </div>
        ))}
      </div>
      <div className="startup-actions">
        <button type="button" className="pdf-dialog-primary" onClick={onClose}>Got it</button>
      </div>
    </section>
  )
}
