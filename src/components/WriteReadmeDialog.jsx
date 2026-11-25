import { useRef, useState } from 'react'
import { BookOpenText, Sparkles, Wand2, X } from 'lucide-react'
import { useDialogKeys } from '../useDialogKeys'

const EXAMPLES = [
  'A React app called TaskFlow that tracks daily habits, shows streaks and sends reminders',
  'A Python CLI tool for renaming photos by the date they were taken',
  'A Rust library called fastcsv for parsing large CSV files quickly',
]

/** Ask for a short project description; the README is written into a new file. */
export default function WriteReadmeDialog({ withAi, aiHidden, onGenerate, onClose }) {
  const [prompt, setPrompt] = useState('')
  const inputRef = useRef(null)
  useDialogKeys(onClose, { focus: () => inputRef.current?.focus() })

  const submit = event => {
    event.preventDefault()
    if (!prompt.trim()) return
    onGenerate(prompt.trim())
    onClose()
  }

  return (
    <div className="pdf-dialog-backdrop anim-fade-in no-print" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
      <div className="pdf-dialog write-readme-dialog anim-pop-in" role="dialog" aria-modal="true" aria-labelledby="write-readme-title">
        <form onSubmit={submit}>
          <div className="pdf-dialog-header">
            <div>
              <h2 id="write-readme-title" className="flex items-center gap-2"><BookOpenText size={16} style={{ color: 'var(--accent)' }} />Write a README</h2>
              <p>Describe your project in a sentence or two. A new README file opens and fills in live in the editor and the page.</p>
            </div>
            <button type="button" className="btn-icon" onClick={onClose} aria-label="Close"><X size={15} /></button>
          </div>
          <div className="pdf-dialog-body">
            <label className="templates-field">
              <span>What is the project?</span>
              <textarea
                ref={inputRef}
                value={prompt}
                onChange={event => setPrompt(event.target.value)}
                onKeyDown={event => { if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) submit(event) }}
                rows={4}
                placeholder="e.g. A React app called TaskFlow that tracks daily habits and sends reminders"
                aria-label="Project description"
              />
            </label>
            <div className="write-readme-examples" aria-label="Examples">
              {EXAMPLES.map(example => (
                <button key={example} type="button" className="write-readme-example" onClick={() => setPrompt(example)}>{example}</button>
              ))}
            </div>
            <p className={`write-readme-engine${withAi ? ' is-ai' : ''}`}>
              {withAi ? <Sparkles size={13} /> : <Wand2 size={13} />}
              {withAi
                ? 'Written by the on-device AI in your browser — nothing is sent to a server.'
                : aiHidden ? 'AI features are turned off in Settings, so a structured README is generated from your description.' : 'Your browser has no built-in AI writer, so a structured README is generated from your description.'}
            </p>
          </div>
          <div className="pdf-dialog-footer">
            <button type="button" className="reader-chip" onClick={onClose}>Cancel</button>
            <button type="submit" className="pdf-dialog-primary" disabled={!prompt.trim()}>
              {withAi ? <Sparkles size={13} /> : <Wand2 size={13} />}Write README
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
