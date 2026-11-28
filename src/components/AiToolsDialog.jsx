import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, Copy, Crosshair, FilePlus, Languages, Loader2, ScrollText, Sparkles, SpellCheck, X } from '../icons'
import {
  REVIEW_KINDS, TRANSLATION_LANGUAGES, aiSupport, applyCorrections, detectLanguage, proofread, reviewWriting, summarize, translateMarkdown,
} from '../onDeviceAi'
import PickerDropdown from './PickerDropdown'

const TABS = [
  { id: 'summarize', label: 'Summarize', icon: Sparkles, needs: 'summarizer' },
  { id: 'translate', label: 'Translate', icon: Languages, needs: 'translator' },
  { id: 'proofread', label: 'Proofread', icon: SpellCheck, needs: 'proofreader' },
  { id: 'review', label: 'Review writing', icon: ScrollText, needs: 'languageModel' },
]
const SUMMARY_TYPES = [
  { value: 'key-points', label: 'Key points' }, { value: 'tldr', label: 'TL;DR' },
  { value: 'teaser', label: 'Teaser' }, { value: 'headline', label: 'Headline' },
]
const LENGTHS = [
  { value: 'short', label: 'Short' }, { value: 'medium', label: 'Balanced' }, { value: 'long', label: 'Detailed' },
]
const SUMMARY_FOCUS = [
  { value: 'balanced', label: 'Everything important' }, { value: 'actions', label: 'Actions and next steps' },
  { value: 'decisions', label: 'Decisions and conclusions' }, { value: 'concepts', label: 'Concepts and definitions' },
  { value: 'risks', label: 'Risks and open questions' },
]
const SUMMARY_FORMATS = [
  { value: 'markdown', label: 'Markdown' }, { value: 'plain-text', label: 'Plain text' },
]

/**
 * Summarize / translate / proofread the current document with Chrome's
 * built-in, on-device models. Only the features the browser supports show up.
 */
export default function AiToolsDialog({ fileName, markdown, renderMarkdown, initialTab, savedReview, onReviewChange, onInsertSummary, onCreateFile, onApplyText, onReveal, onClose }) {
  const support = useMemo(() => aiSupport(), [])
  // Every tool is listed; ones this browser can't run explain why instead.
  const tabs = TABS
  const [tab, setTab] = useState(() => (TABS.some(item => item.id === initialTab) ? initialTab : (TABS.find(item => support[item.needs]) ?? TABS[0]).id))
  const supported = Boolean(support[TABS.find(item => item.id === tab)?.needs])
  const noAiAtAll = !TABS.some(item => support[item.needs])
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(null) // download progress 0–1
  const [step, setStep] = useState(null) // { done, total }
  const [preparing, setPreparing] = useState(false)
  const [error, setError] = useState('')
  const [summaryType, setSummaryType] = useState('key-points')
  const [summaryLength, setSummaryLength] = useState('medium')
  const [summaryFocus, setSummaryFocus] = useState('balanced')
  const [summaryFormat, setSummaryFormat] = useState('markdown')
  const [summaryPrompt, setSummaryPrompt] = useState('')
  const [summary, setSummary] = useState('')
  const [targetLanguage, setTargetLanguage] = useState(() => (navigator.language || 'en').slice(0, 2) === 'en' ? 'es' : 'en')
  const [sourceLanguage, setSourceLanguage] = useState(null)
  const [translation, setTranslation] = useState('')
  const [corrections, setCorrections] = useState(null)
  // A review survives "Show in document" (which closes the dialog) while the text is unchanged.
  const [review, setReview] = useState(() => savedReview ?? null)
  const onReviewChangeRef = useRef(onReviewChange)
  useEffect(() => { onReviewChangeRef.current = onReviewChange }, [onReviewChange])
  useEffect(() => { onReviewChangeRef.current?.(review) }, [review])
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
      type: summaryType, length: summaryLength, focus: summaryFocus, format: summaryFormat, prompt: summaryPrompt, language: sourceLanguage || 'en', onProgress, onStatus, signal,
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

  const runReview = () => run(async signal => {
    setReview(null)
    const result = await reviewWriting(markdown, { onProgress, onStatus, onStep: (done, total) => { setPreparing(false); setStep({ done, total }) }, signal })
    setReview(result.map(item => ({ ...item, accepted: Boolean(item.correction) })))
  })
  const reviewAccepted = review?.filter(item => item.accepted && item.correction) ?? []

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
                  : `On-device ${tab === 'summarize' ? 'summarizing' : tab === 'translate' ? 'translation' : tab === 'review' ? 'writing review' : 'proofreading'} isn’t supported in this browser.`}
              </strong>
              <span>
                These tools use the AI model built into recent desktop Google Chrome (version 138 or later, on a computer that meets its hardware requirements).
                {tab === 'proofread' && ' Proofreading is still experimental: enable “Proofreader API” at chrome://flags.'}
                {tab === 'review' && ' Writing review uses Chrome’s on-device language model: enable “Prompt API for Gemini Nano” at chrome://flags.'}
                {' '}Writing a README still works everywhere with the built-in generator.
              </span>
            </div>
          )}
          {tab === 'summarize' && supported && (
            <>
              <div className="ai-options ai-summary-options">
                <label><span>Style</span><PickerDropdown value={summaryType} options={SUMMARY_TYPES} onChange={value => { setSummaryType(value); setSummary('') }} label="Summary style" disabled={busy} className="ai-summary-picker" /></label>
                <label><span>Length</span><PickerDropdown value={summaryLength} options={LENGTHS} onChange={value => { setSummaryLength(value); setSummary('') }} label="Summary length" disabled={busy} className="ai-summary-picker" /></label>
                <label><span>Focus</span><PickerDropdown value={summaryFocus} options={SUMMARY_FOCUS} onChange={value => { setSummaryFocus(value); setSummary('') }} label="Summary focus" disabled={busy} className="ai-summary-picker" /></label>
                <label><span>Format</span><PickerDropdown value={summaryFormat} options={SUMMARY_FORMATS} onChange={value => { setSummaryFormat(value); setSummary('') }} label="Summary format" disabled={busy} className="ai-summary-picker" /></label>
              </div>
              <label className="ai-summary-prompt"><span>Optional prompt</span><textarea value={summaryPrompt} onChange={event => { setSummaryPrompt(event.target.value); setSummary('') }} disabled={busy} rows={2} placeholder="Tell the summary what to focus on or how to present the key information." aria-label="Optional summary prompt" /></label>
              <p className="ai-hint">Choose a summary style, detail level, focus, and output format. Add a prompt for a specific question or perspective.</p>
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

          {tab === 'review' && supported && (
            review === null ? <p className="ai-hint">Reads your paragraphs and points out hard-to-follow or long sentences, passive voice, wordy phrases, repetition, tone and inconsistent terms, with suggested rewrites. Code and tables are skipped.</p>
              : review.length === 0 ? <p className="ai-hint ai-ok"><Check size={14} /> The writing reads well. No suggestions.</p>
                : (
                  <ul className="ai-corrections ai-review" aria-label="Writing suggestions">
                    {review.map(item => (
                      <li key={item.id}>
                        <div className="ai-review-head">
                          <span className="ai-review-kind">{REVIEW_KINDS[item.kind]}</span>
                          <span className="ai-review-issue">{item.issue}</span>
                          {onReveal && (
                            <button type="button" className="btn-icon" onClick={() => onReveal(item.from, item.to)} aria-label={`Show in document: ${item.original}`} data-tip="Show in document"><Crosshair size={13} /></button>
                          )}
                        </div>
                        {item.correction ? (
                          <label>
                            <input type="checkbox" checked={item.accepted} onChange={event => setReview(list => list.map(entry => (entry.id === item.id ? { ...entry, accepted: event.target.checked } : entry)))} />
                            <span className="ai-correction"><del>{item.original}</del> → <ins>{item.correction}</ins></span>
                          </label>
                        ) : <p className="ai-review-quote">“{item.original}”</p>}
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
          {tab === 'review' && reviewAccepted.length > 0 && !busy && (
            <button type="button" className="reader-chip" onClick={() => { onApplyText(applyCorrections(markdown, reviewAccepted), 'review'); onClose() }}>
              <Check size={12} /> Apply {reviewAccepted.length} suggestion{reviewAccepted.length === 1 ? '' : 's'}
            </button>
          )}
          <span style={{ flex: 1 }} />
          {busy
            ? <button type="button" className="reader-chip" onClick={() => abortRef.current?.abort()}>Stop</button>
            : !supported ? null : (
              <button type="button" className="pdf-dialog-primary" onClick={tab === 'summarize' ? runSummary : tab === 'translate' ? runTranslation : tab === 'review' ? runReview : runProofread}>
                {tab === 'summarize' ? <Sparkles size={13} /> : tab === 'translate' ? <Languages size={13} /> : tab === 'review' ? <ScrollText size={13} /> : <SpellCheck size={13} />}
                {tab === 'summarize' ? (summary ? 'Summarize again' : 'Summarize') : tab === 'translate' ? `Translate to ${languageName(targetLanguage)}` : tab === 'review' ? (review ? 'Review again' : 'Review writing') : 'Check document'}
              </button>
            )}
        </div>
      </div>
    </div>
  )
}
