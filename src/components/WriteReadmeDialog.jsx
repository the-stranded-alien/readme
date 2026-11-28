import { useRef, useState } from 'react'
import { BookOpenText, Sparkles, Wand2, X } from '../icons'
import PickerDropdown from './PickerDropdown'
import { useDialogKeys } from '../useDialogKeys'

const WRITING_OPTIONS = {
  length: [
    { value: 'short', label: 'Short' },
    { value: 'medium', label: 'Balanced' },
    { value: 'long', label: 'Detailed' },
  ],
  tone: [
    { value: 'neutral', label: 'Neutral' },
    { value: 'professional', label: 'Professional' },
    { value: 'friendly', label: 'Friendly' },
    { value: 'academic', label: 'Academic' },
  ],
  audience: [
    { value: 'general', label: 'General readers' },
    { value: 'beginners', label: 'Beginners' },
    { value: 'technical', label: 'Technical readers' },
    { value: 'experts', label: 'Experts' },
  ],
  documentType: [
    { value: 'auto', label: 'Choose from my brief' },
    { value: 'guide', label: 'Guide or instructions' },
    { value: 'reference', label: 'Reference' },
    { value: 'notes', label: 'Notes or overview' },
    { value: 'project', label: 'Software project README' },
  ],
}

const DEFAULT_OPTIONS = { length: 'medium', tone: 'neutral', audience: 'general', documentType: 'auto' }

/** Write a new Markdown document or revise the currently open one. */
export default function WriteReadmeDialog({ withAi, aiHidden, document, folders = [], initialMode = 'write', onGenerate, onClose }) {
  const [mode, setMode] = useState(initialMode === 'edit' && document && withAi ? 'edit' : 'write')
  const [prompt, setPrompt] = useState('')
  const [folder, setFolder] = useState('')
  const [fileName, setFileName] = useState('README.md')
  const [options, setOptions] = useState(DEFAULT_OPTIONS)
  const inputRef = useRef(null)
  const canEdit = Boolean(document && withAi)
  useDialogKeys(onClose, { focus: () => inputRef.current?.focus() })

  const submit = event => {
    event.preventDefault()
    if (mode === 'write' && (!prompt.trim() || !fileName.trim())) return
    onGenerate({ mode, prompt: prompt.trim(), options, folder, fileName })
    onClose()
  }
  const updateOption = (key, value) => setOptions(current => ({ ...current, [key]: value }))

  return (
    <div className="pdf-dialog-backdrop anim-fade-in no-print" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
      <div className="pdf-dialog write-readme-dialog anim-pop-in" role="dialog" aria-modal="true" aria-labelledby="write-readme-title">
        <form onSubmit={submit}>
          <div className="pdf-dialog-header">
            <div>
              <h2 id="write-readme-title" className="flex items-center gap-2"><BookOpenText size={16} style={{ color: 'var(--accent)' }} />{mode === 'edit' ? 'Edit with AI' : 'Write a README'}</h2>
              <p>{mode === 'edit'
                ? `Revise “${document?.name || 'the current document'}” in place. Its current content and your instructions guide the edit.`
                : 'Create a README, guide, reference, notes, or another Markdown document. Describe what it should cover.'}</p>
            </div>
            <button type="button" className="btn-icon" onClick={onClose} aria-label="Close"><X size={15} /></button>
          </div>
          <div className="pdf-dialog-body write-readme-body">
            {document && <div className="write-readme-mode" role="tablist" aria-label="AI document action">
              <button type="button" role="tab" aria-selected={mode === 'write'} className={mode === 'write' ? 'is-active' : ''} onClick={() => setMode('write')}>Write new</button>
              <button type="button" role="tab" aria-selected={mode === 'edit'} className={mode === 'edit' ? 'is-active' : ''} onClick={() => canEdit && setMode('edit')} disabled={!canEdit} title={!withAi ? 'On-device AI writing is unavailable or turned off.' : undefined}>Edit current</button>
            </div>}
            <label className="templates-field">
              <span>{mode === 'edit' ? 'What would you like changed? (optional)' : 'What should the document cover?'}</span>
              <textarea
                ref={inputRef}
                value={prompt}
                onChange={event => setPrompt(event.target.value)}
                onKeyDown={event => { if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) submit(event) }}
                rows={mode === 'edit' ? 3 : 4}
                placeholder={mode === 'edit' ? 'Describe the changes you want, or leave blank for a general improvement.' : 'Describe the subject, purpose, and any details the document should include.'}
                aria-label={mode === 'edit' ? 'Editing instructions' : 'Document brief'}
              />
            </label>
            {mode === 'write' && <div className="write-readme-location">
              <label className="templates-field">
                <span>File name</span>
                <input value={fileName} onChange={event => setFileName(event.target.value)} aria-label="README file name" placeholder="README.md" />
              </label>
              <label className="write-readme-folder">
                <span>Save in</span>
                <PickerDropdown value={folder} options={[{ value: '', label: 'Workspace root' }, ...folders.map(path => ({ value: path, label: path }))]} onChange={setFolder} label="Save folder" className="write-readme-picker" />
              </label>
            </div>}
            <fieldset className="write-readme-options">
              <legend>Writing preferences</legend>
              {[
                ['length', 'Length'], ['tone', 'Tone'], ['audience', 'Audience'], ['documentType', 'Document type'],
              ].map(([key, label]) => <label key={key}>
                <span>{label}</span>
                <PickerDropdown value={options[key]} options={WRITING_OPTIONS[key]} onChange={value => updateOption(key, value)} label={label} className="write-readme-picker" />
              </label>)}
            </fieldset>
            <p className={`write-readme-engine${withAi ? ' is-ai' : ''}`}>
              {withAi ? <Sparkles size={13} /> : <Wand2 size={13} />}
              {withAi
                ? 'Generated with on-device AI in your browser. Your document is not sent to a server.'
                : aiHidden ? 'AI is turned off. A structured document will be generated from your brief.' : 'On-device AI is unavailable in this browser. A structured document will be generated from your brief.'}
            </p>
          </div>
          <div className="pdf-dialog-footer">
            <button type="button" className="reader-chip" onClick={onClose}>Cancel</button>
            <button type="submit" className="pdf-dialog-primary" disabled={(mode === 'write' && (!prompt.trim() || !fileName.trim())) || (mode === 'edit' && !canEdit)}>
              {mode === 'edit' ? <Sparkles size={13} /> : withAi ? <Sparkles size={13} /> : <Wand2 size={13} />}{mode === 'edit' ? 'Edit document' : 'Write README'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
