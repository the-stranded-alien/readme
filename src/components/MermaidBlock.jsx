import { useEffect, useId, useState, useCallback } from 'react'
import { Copy, Check, AlertTriangle } from '../icons'

let mermaidPromise = null
function getMermaid() {
  if (!mermaidPromise) {
    mermaidPromise = import('mermaid').then(m => m.default)
  }
  return mermaidPromise
}

export default function MermaidBlock({ code, dark }) {
  const reactId = useId().replace(/:/g, '')
  const [svg, setSvg] = useState('')
  const [error, setError] = useState(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let cancelled = false
    const renderDiagram = async () => {
      try {
        const mermaid = await getMermaid()
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: 'loose',
          theme: dark ? 'dark' : 'default',
          fontFamily: "'Inter', system-ui, sans-serif",
        })
        const renderId = `mermaid-${reactId}-${Date.now()}`
        const { svg: renderedSvg } = await mermaid.render(renderId, code)
        if (!cancelled) {
          setSvg(renderedSvg)
          setError(null)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err?.message || 'Invalid Mermaid diagram syntax')
        }
      }
    }
    renderDiagram()
    return () => { cancelled = true }
  }, [code, dark, reactId])

  const copySource = useCallback(async () => {
    await navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [code])

  return (
    <div className="code-wrapper anim-slide-up">
      <div className="code-header">
        <div className="traffic-lights">
          <span className="tl tl-r" />
          <span className="tl tl-y" />
          <span className="tl tl-g" />
        </div>
        <div className="code-filelang">
          <span>mermaid</span>
          <span className="code-filename">diagram</span>
        </div>
        <div className="code-actions">
          <button onClick={copySource} className={`copy-btn ${copied ? 'copied' : ''}`}>
            {copied ? <Check size={11} /> : <Copy size={11} />}
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
      </div>

      <div
        className="p-5 overflow-x-auto flex justify-center"
        style={{ background: 'var(--code-bg)' }}
      >
        {error ? (
          <div className="w-full flex items-start gap-2.5 text-xs p-3 rounded-lg"
            style={{ background: 'var(--accent-soft)', color: 'var(--text-3)', border: '1px solid var(--accent-border)' }}>
            <AlertTriangle size={14} style={{ color: 'var(--accent)', flexShrink: 0, marginTop: 1 }} />
            <div className="min-w-0">
              <div className="font-semibold mb-1" style={{ color: 'var(--text-2)' }}>Mermaid syntax error</div>
              <pre className="whitespace-pre-wrap break-words font-mono text-[11px] opacity-80">{error}</pre>
            </div>
          </div>
        ) : svg ? (
          <div
            className="mermaid-svg max-w-full"
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        ) : (
          <div className="py-6 text-xs" style={{ color: 'var(--text-4)' }}>
            Rendering diagram…
          </div>
        )}
      </div>
    </div>
  )
}
