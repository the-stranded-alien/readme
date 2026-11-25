import { BookOpenText, FilePlus, FolderOpen, Globe, LayoutTemplate, RotateCcw } from 'lucide-react'

function PagesIllustration() {
  return (
    <svg className="empty-illustration" viewBox="0 0 220 150" role="img" aria-label="Stacked Markdown pages">
      <defs>
        <linearGradient id="empty-accent" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--accent)" />
          <stop offset="1" stopColor="var(--accent-2)" />
        </linearGradient>
      </defs>
      <rect x="62" y="22" width="104" height="120" rx="12" transform="rotate(-8 114 82)" className="empty-page is-back" />
      <rect x="66" y="14" width="104" height="120" rx="12" transform="rotate(5 118 74)" className="empty-page is-middle" />
      <g className="empty-page-front">
        <rect x="58" y="10" width="104" height="124" rx="12" className="empty-page" />
        <text x="72" y="40" className="empty-page-hash">#</text>
        <rect x="88" y="29" width="54" height="9" rx="4.5" fill="url(#empty-accent)" />
        <rect x="72" y="52" width="76" height="6" rx="3" className="empty-page-line" />
        <rect x="72" y="64" width="62" height="6" rx="3" className="empty-page-line" />
        <circle cx="75" cy="83" r="3" fill="url(#empty-accent)" />
        <rect x="83" y="80" width="56" height="6" rx="3" className="empty-page-line" />
        <circle cx="75" cy="97" r="3" fill="url(#empty-accent)" />
        <rect x="83" y="94" width="44" height="6" rx="3" className="empty-page-line" />
        <rect x="72" y="110" width="76" height="14" rx="4" className="empty-page-code" />
      </g>
      <circle cx="178" cy="30" r="5" fill="url(#empty-accent)" opacity=".5" />
      <circle cx="40" cy="112" r="7" fill="url(#empty-accent)" opacity=".25" />
    </svg>
  )
}

export default function EmptyWorkspace({ templates, canReopen, onNew, onOpen, onImportUrl, onReopen, onTemplate, onWriteReadme }) {
  const actions = [
    { id: 'new', icon: FilePlus, title: 'New blank file', text: 'Start writing from scratch', run: onNew, primary: true },
    { id: 'open', icon: FolderOpen, title: 'Open files', text: 'Markdown files or a whole folder', run: onOpen },
    ...(onWriteReadme ? [{ id: 'write', icon: BookOpenText, title: 'Write a README', text: 'Describe a project, get a README', run: onWriteReadme }] : []),
    { id: 'url', icon: Globe, title: 'Import from URL', text: 'Fetch a public .md file', run: onImportUrl },
    ...(canReopen ? [{ id: 'reopen', icon: RotateCcw, title: 'Reopen closed tab', text: 'Bring back what you just closed', run: onReopen }] : []),
  ]
  return (
    <div className="empty-workspace surface-preview anim-fade-in">
      <div className="empty-workspace-inner">
        <PagesIllustration />
        <h1>Start something new</h1>
        <p>Write, preview and export Markdown — everything stays in your browser. Drop .md files anywhere to open them.</p>
        <div className="empty-actions">
          {actions.map(action => (
            <button key={action.id} type="button" className={`empty-card${action.primary ? ' is-primary' : ''}`} onClick={action.run}>
              <span className="empty-card-icon"><action.icon size={17} /></span>
              <span className="empty-card-text">
                <strong>{action.title}</strong>
                <span>{action.text}</span>
              </span>
            </button>
          ))}
        </div>
        <div className="empty-templates-heading">Or start from a template</div>
        <div className="empty-templates">
          {templates.map(template => (
            <button key={template.id} type="button" className="empty-template" onClick={() => onTemplate(template)}>
              <LayoutTemplate size={14} aria-hidden="true" />
              <span>
                <strong>{template.name}</strong>
                {template.description && <span>{template.description}</span>}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
