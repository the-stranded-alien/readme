import { SettingsToggle } from './SettingsDialog'
import {
  AUTO_ADVANCE_SECONDS, FADE_SECONDS, INK_COLORS, PEN_WIDTHS, SPLIT_LEVELS, SPLIT_MODES, SPLIT_TARGETS, ZOOM_CHOICES,
} from '../presentationSettings'

function Field({ label, description, children }) {
  return (
    <div className="settings-toggle settings-field" role="group" aria-label={label}>
      <span className="settings-toggle-text">
        <strong>{label}</strong>
        {description && <span>{description}</span>}
      </span>
      {children}
    </div>
  )
}

function Select({ label, value, onChange, options }) {
  return (
    <span className="settings-select-wrap">
      <select className="settings-select" aria-label={label} value={String(value)} onChange={event => onChange(event.target.value)}>
        {options.map(option => <option key={String(option.value)} value={String(option.value)}>{option.label}</option>)}
      </select>
    </span>
  )
}

function InkColors({ label, value, onChange }) {
  return (
    <div className="ink-colors" role="radiogroup" aria-label={label}>
      {INK_COLORS.map(color => (
        <button key={color.id} type="button" role="radio" aria-checked={value === color.id} aria-label={color.label} title={color.label}
          className={`ink-color${value === color.id ? ' is-active' : ''}`} style={{ background: color.value }} onClick={() => onChange(color.id)} />
      ))}
    </div>
  )
}

/** Settings → Presentation: how documents become slides, and the pen, laser and display defaults. */
export default function PresentationSettings({ settings, onChange, themes }) {
  const set = (key, value) => onChange({ ...settings, [key]: value })
  return (
    <>
      <h4 className="settings-subhead">Slides</h4>
      <Field label="Slide splitting" description="Choose how to divide a document into slides. Smart split uses headings when present, then falls back to complete content blocks.">
        <Select label="Slide splitting" value={settings.splitMode} onChange={value => set('splitMode', value)} options={SPLIT_MODES} />
      </Field>
      {['smart', 'headings'].includes(settings.splitMode) && <Field label="New slide at" description="Heading level that starts a new slide.">
        <Select label="New slide at" value={settings.splitLevel} onChange={value => set('splitLevel', Number(value))} options={SPLIT_LEVELS} />
      </Field>}
      {['smart', 'length'].includes(settings.splitMode) && <Field label="Target slide length" description={`${settings.splitMode === 'smart' ? 'Used when a document has no headings. ' : ''}An approximate target; lists, tables and code blocks stay intact, so a slide may exceed it.`}>
        <Select label="Target slide length" value={settings.splitTargetWords} onChange={value => set('splitTargetWords', Number(value))} options={SPLIT_TARGETS} />
      </Field>}
      <SettingsToggle label="Break at horizontal rules" description="A --- line on its own also starts a new slide."
        checked={settings.splitRules} onChange={value => set('splitRules', value)} />
      <Field label="Auto-advance" description="Move to the next slide automatically. Pause it from the toolbar.">
        <Select label="Auto-advance" value={settings.autoAdvance} onChange={value => set('autoAdvance', Number(value))}
          options={AUTO_ADVANCE_SECONDS.map(seconds => ({ value: seconds, label: seconds ? `Every ${seconds} seconds` : 'Off' }))} />
      </Field>

      <h4 className="settings-subhead">Display</h4>
      <Field label="Default text size" description="The magnifier size a presentation starts at. “Last used” keeps your last + / − choice.">
        <Select label="Default text size" value={settings.zoom} onChange={value => set('zoom', value === 'last' ? 'last' : Number(value))}
          options={[{ value: 'last', label: 'Last used' }, ...ZOOM_CHOICES.map(zoom => ({ value: zoom, label: `${Math.round(zoom * 100)}%` }))]} />
      </Field>
      <Field label="Default theme" description="The theme presentations use. The app goes back to its own theme when you exit.">
        <Select label="Default presentation theme" value={settings.theme} onChange={value => set('theme', value)}
          options={[{ value: '', label: 'Last used' }, ...themes.map(theme => ({ value: theme.id, label: theme.label }))]} />
      </Field>
      <SettingsToggle label="Show contents on start" description="Open the slide list on the left when a presentation starts."
        checked={settings.showContents} onChange={value => set('showContents', value)} />
      <SettingsToggle label="Progress bar" description="A thin bar at the top shows how far through you are."
        checked={settings.showProgress} onChange={value => set('showProgress', value)} />
      <SettingsToggle label="Timer in toolbar" description="Show the time since the presentation started."
        checked={settings.showTimer} onChange={value => set('showTimer', value)} />

      <h4 className="settings-subhead">Pen and laser</h4>
      <Field label="Pen mode" description="Fading ink trails away like a comet, oldest part first; permanent ink stays on its slide until you clear it.">
        <Select label="Pen mode" value={settings.penMode} onChange={value => set('penMode', value)}
          options={[{ value: 'fade', label: 'Fading' }, { value: 'permanent', label: 'Permanent' }]} />
      </Field>
      <Field label="Fading ink lasts">
        <Select label="Fading ink lasts" value={settings.fadeSeconds} onChange={value => set('fadeSeconds', Number(value))}
          options={FADE_SECONDS.map(seconds => ({ value: seconds, label: `${seconds} second${seconds === 1 ? '' : 's'}` }))} />
      </Field>
      <Field label="Pen colour"><InkColors label="Pen colour" value={settings.penColor} onChange={value => set('penColor', value)} /></Field>
      <Field label="Pen thickness">
        <Select label="Pen thickness" value={settings.penWidth} onChange={value => set('penWidth', Number(value))} options={PEN_WIDTHS} />
      </Field>
      <Field label="Laser colour"><InkColors label="Laser colour" value={settings.laserColor} onChange={value => set('laserColor', value)} /></Field>
    </>
  )
}
