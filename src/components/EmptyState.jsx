/** A friendly "nothing here yet" message: multi-colour icon, title and one line of guidance. */
export default function EmptyState({ icon: Icon, title, text, compact = false, className = '' }) {
  return (
    <div className={`empty-state${compact ? ' is-compact' : ''}${className ? ` ${className}` : ''}`}>
      {Icon && <span className="empty-state-icon"><Icon size={compact ? 22 : 30} /></span>}
      <strong>{title}</strong>
      {text && <span>{text}</span>}
    </div>
  )
}
