import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, Copy, FilePlus, Languages, Loader2, Sparkles, SpellCheck, X } from 'lucide-react'
import {
  TRANSLATION_LANGUAGES, aiSupport, applyCorrections, detectLanguage, proofread, summarize, translateMarkdown,
} from '../onDeviceAi'

const TABS = [
  { id: 'summarize', label: 'Summarize', icon: Sparkles, needs: 'summarizer' },
  { id: 'translate', label: 'Translate', icon: Languages, needs: 'translator' },
  { id: 'proofread', label: 'Proofread', icon: SpellCheck, needs: 'proofreader' },
]
const SUMMARY_TYPES = [['key-points', 'Key points'], ['tldr', 'TL;DR'], ['teaser', 'Teaser'], ['headline', 'Headline']]
const LENGTHS = [['short', 'Short'], ['medium', 'Medium'], ['long', 'Long']]

function Segmented({ label, options, value, onChange, disabled }) {
  return (
    <div className="pdf-option" role="radiogroup" aria-label={label}>
      <span className="pdf-option-label">{label}</span>
      <div className="pdf-segmented">
        {options.map(([id, text]) => (
          <button key={id} type="button" role="radio" aria-checked={value === id} className={value === id ? 'is-active' : ''}
            onClick={() => onChange(id)} disabled={disabled}>{text}</button>
        ))}
      </div>
    </div>
  )
}

/**
 * Summarize / translate / proofread the current document with Chrome's
 * built-in, on-device models. Only the features the browser supports show up.
 */
export default function AiToolsDialog({ fileName, markdown, renderMarkdown, onInsertSummary, onCreateFile, onApplyText, onClose }) {
  const support = useMemo(() => aiSupport(), [])
  // Every tool is listed; ones this browser can't run explain why instead.
  const tabs = TABS
  const [tab, setTab] = useState(() => (TABS.find(item => support[item.needs]) ?? TABS[0]).id)
  const supported = Boolean(support[TABS.find(item => item.id === tab)?.needs])
  const noAiAtAll = !TABS.some(item => support[item.needs])
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(null) // download progress 0–1
  const [step, setStep] = useState(null) // { done, total }
  const [preparing, setPreparing] = useState(false)
  const [error, setError] = useState('')
  const [summaryType, setSummaryType] = useState('key-points')
  const [summaryLength, setSummaryLength] = useState('medium')
  const [summary, setSummary] = useState('')
  const [targetLanguage, setTargetLanguage] = useState(() => (navigator.language || 'en').slice(0, 2) === 'en' ? 'es' : 'en')
  const [sourceLanguage, setSourceLanguage] = useState(null)
  const [translation, setTranslation] = useState('')
  const [corrections, setCorrections] = useState(null)
  const [copied, setCopied] = useState(false)
  const abortRef = useRef(null)
  const closeRef = useRef(null)

  // Keep the latest onClose without re-running effects (re-running would abort a running model call).
  const onCloseRef = useRef(onClose)
  useEffect(() => { onCloseRef.current = onClose }, [onClose])
  useEffect(() => {
    closeRef.current?.focus()
    const onKey = event => { if (event.key === 'Escape') { event.preventDefault(); abortRef.current?.abort(); onCloseRef.current() } }
    window.addEventListener('keydown', onKey)
    // Stop any running model call when the dialog closes.
    return () => { window.removeEventListener('keydown', onKey); abortRef.current?.abort() }
  }, [])

  useEffect(() => {
    if (!support.detector) return
    let cancelled = false
    detectLanguage(markdown).then(language => { if (!cancelled && language) setSourceLanguage(language) }).catch(() => {})
    return () => { cancelled = true }
  }, [markdown, support.detector])

  const run = async task => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setBusy(true); setError(''); setProgress(null); setStep(null); setPreparing(false)
    try {
      await task(controller.signal)
    } catch (caught) {
      if (caught?.name !== 'AbortError') setError(caught?.message || 'Something went wrong running the on-device model.')
    } finally {
      setBusy(false); setProgress(null); setPreparing(false)
    }
  }
  const onProgress = loaded => setProgress(loaded < 1 ? loaded : null)
  const onStatus = status => setPreparing(status === 'preparing')

  const runSummary = () => run(async signal => {
    setSummary('')
    const result = await summarize(markdown, {
      type: summaryType, length: summaryLength, language: sourceLanguage || 'en', onProgress, onStatus, signal,
      onChunk: text => { setPreparing(false); setSummary(text) },
    })
    setSummary(result)
  })
  const runTranslation = () => run(async signal => {
    setTranslation('')
    const source = sourceLanguage || 'en'
    if (source === targetLanguage) throw new Error('The document is already in that language.')
    const result = await translateMarkdown(markdown, {
      sourceLanguage: source, targetLanguage, onProgress, onStatus, signal,
      onStep: (done, total) => { setPreparing(false); setStep({ done, total }) },
    })
    setTranslation(result)
  })
  const runProofread = () => run(async signal => {
    setCorrections(null)
    const result = await proofread(markdown, { onProgress, onStatus, onStep: (done, total) => { setPreparing(false); setStep({ done, total }) }, signal })
    setCorrections(result.map(item => ({ ...item, accepted: true })))
  })

  const copy = async text => {
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500) } catch { /* clipboard blocked */ }
  }
  const languageName = code => TRANSLATION_LANGUAGES.find(([id]) => id === code)?.[1] ?? code
  const baseName = fileName.replace(/\.[^.]+$/, '')

  return (
    <div className="pdf-dialog-backdrop anim-fade-in no-print" onMouseDown={event => { if (event.target === event.currentTarget && !busy) onClose() }}>
      <div className="ai-dialog anim-pop-in" role="dialog" aria-modal="true" aria-labelledby="ai-title">
        <div className="pdf-dialog-header">
          <div>
            <h2 id="ai-title" className="flex items-center gap-2"><Sparkles size={16} style={{ color: 'var(--accent)' }} />AI tools</h2>
            <p>Runs on this device with the browser's built-in model — your document never leaves your computer.</p>
          </div>
          <button ref={closeRef} type="button" className="btn-icon" onClick={() => { abortRef.current?.abort(); onClose() }} aria-label="Close AI tools"><X size={15} /></button>
        </div>

        <div className="ai-tabs" role="tablist" aria-label="AI tools">
          {tabs.map(item => (
            <button key={item.id} type="button" role="tab" aria-selected={tab === item.id} className={`${tab === item.id ? 'is-active' : ''}${support[item.needs] ? '' : ' is-unsupported'}`}
              title={support[item.needs] ? undefined : 'Not supported in this browser'}
              onClick={() => { setTab(item.id); setError('') }} disabled={busy}>
              <item.icon size={13} />{item.label}
            </button>
          ))}
        </div>

        <div className="ai-body" role="tabpanel">
          {!supported && (
            <div className="ai-unsupported" role="note">
              <strong>
                {noAiAtAll
                  ? 'In-browser AI isn’t supported in this browser.'
                  : `On-device ${tab === 'summarize' ? 'summarizing' : tab === 'translate' ? 'translation' : 'proofreading'} isn’t supported in this browser.`}
              </strong>
              <span>
                These tools use the AI model built into recent desktop Google Chrome (version 138 or later, on a computer that meets its hardware requirements).
                {tab === 'proofread' && ' Proofreading is still experimental: enable “Proofreader API” at chrome://flags.'}
                {' '}Writing a README still works everywhere with the built-in generator.
              </span>
            </div>
          )}
          {tab === 'summarize' && supported && (
            <>
              <div className="ai-options">
                <Segmented label="Style" options={SUMMARY_TYPES} value={summaryType} onChange={setSummaryType} disabled={busy} />
                <Segmented label="Length" options={LENGTHS} value={summaryLength} onChange={setSummaryLength} disabled={busy} />
              </div>
              {summary && <div className="ai-result rm-prose">{renderMarkdown(summary)}</div>}
            </>
          )}
          {tab === 'translate' && supported && (
            <>
              <div className="ai-options ai-options-row">
                <div className="pdf-option">
                  <span className="pdf-option-label">From</span>
                  <span className="ai-detected">{sourceLanguage ? `${languageName(sourceLanguage)} (detected)` : 'English (assumed)'}</span>
                </div>
                <label className="pdf-option">
                  <span className="pdf-option-label">To</span>
                  <select className="ai-select" value={targetLanguage} onChange={event => setTargetLanguage(event.target.value)} disabled={busy} aria-label="Translate to">
                    {TRANSLATION_LANGUAGES.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
                  </select>
                </label>
              </div>
              {translation && <pre className="ai-result ai-result-text">{translation}</pre>}
            </>
          )}
          {tab === 'proofread' && supported && (
            corrections === null ? <p className="ai-hint">Checks spelling and grammar in your paragraphs (code and tables are skipped).</p>
              : corrections.length === 0 ? <p className="ai-hint ai-ok"><Check size={14} /> No issues found.</p>
                : (
                  <ul className="ai-corrections" aria-label="Suggested corrections">
                    {corrections.map(item => (
                      <li key={item.id}>
                        <label>
                          <input type="checkbox" checked={item.accepted} onChange={event => setCorrections(list => list.map(entry => (entry.id === item.id ? { ...entry, accepted: event.target.checked } : entry)))} />
                          <span className="ai-correction">
                            <del>{item.original || '∅'}</del> → <ins>{item.correction || '∅'}</ins>
                            {item.type && <em>{item.type}</em>}
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                )
          )}

          {(progress !== null || step) && busy && (
            <div className="ai-progress" aria-live="polite">
              <Loader2 size={13} className="animate-spin" />
              {progress !== null ? `Downloading the on-device model… ${Math.round(progress * 100)}%` : step ? `Working… ${step.done} of ${step.total}` : 'Working…'}
              {progress !== null && <div className="storage-bar"><span style={{ width: `${progress * 100}%` }} /></div>}
            </div>
          )}
          {busy && progress === null && !step && (
            <div className="ai-progress" aria-live="polite">
              <Loader2 size={13} className="animate-spin" />
              {preparing ? 'Preparing the on-device model… The first use downloads it through Chrome, which can take a few minutes.' : 'Working…'}
            </div>
          )}
          {error && <p className="ai-error" role="alert">{error}</p>}
        </div>

        <div className="pdf-dialog-footer">
          {tab === 'summarize' && summary && !busy && (
            <>
              <button type="button" className="reader-chip" onClick={() => copy(summary)}>{copied ? <Check size={12} /> : <Copy size={12} />} Copy</button>
              <button type="button" className="reader-chip" onClick={() => { onInsertSummary(summary); onClose() }}>Insert at top</button>
              <button type="button" className="reader-chip" onClick={() => { onCreateFile(`${baseName} (summary).md`, `# Summary of ${baseName}\n\n${summary}\n`); onClose() }}><FilePlus size={12} /> New file</button>
            </>
          )}
          {tab === 'translate' && translation && !busy && (
            <button type="button" className="reader-chip" onClick={() => { onCreateFile(`${baseName} (${targetLanguage}).md`, translation); onClose() }}><FilePlus size={12} /> Open as new file</button>
          )}
          {tab === 'proofread' && corrections?.some(item => item.accepted) && !busy && (
            <button type="button" className="reader-chip" onClick={() => { onApplyText(applyCorrections(markdown, corrections.filter(item => item.accepted))); onClose() }}>
              <Check size={12} /> Apply {corrections.filter(item => item.accepted).length} correction{corrections.filter(item => item.accepted).length === 1 ? '' : 's'}
            </button>
          )}
          <span style={{ flex: 1 }} />
          {busy
            ? <button type="button" className="reader-chip" onClick={() => abortRef.current?.abort()}>Stop</button>
            : !supported ? null : (
              <button type="button" className="pdf-dialog-primary" onClick={tab === 'summarize' ? runSummary : tab === 'translate' ? runTranslation : runProofread}>
                {tab === 'summarize' ? <Sparkles size={13} /> : tab === 'translate' ? <Languages size={13} /> : <SpellCheck size={13} />}
                {tab === 'summarize' ? (summary ? 'Summarize again' : 'Summarize') : tab === 'translate' ? `Translate to ${languageName(targetLanguage)}` : 'Check document'}
              </button>
            )}
        </div>
      </div>
    </div>
  )
}
