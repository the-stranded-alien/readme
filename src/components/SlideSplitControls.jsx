import { SPLIT_LEVELS, SPLIT_MODES, SPLIT_TARGETS, SPLIT_TRIGGERS } from '../presentationSettings'

/** Compact, reusable controls for choosing where presentation slides begin. */
export default function SlideSplitControls({ settings, onChange, label = 'Slide splitting options', className = '' }) {
  const set = (key, value) => onChange(current => ({ ...current, [key]: value, ...(key === 'splitMode' ? { splitModeExplicit: true } : {}) }))
  const triggers = settings.splitTriggers || ['heading', 'list', 'table', 'quote', 'code']
  const showsNewSlideAt = settings.splitMode === 'blocks'
  return (
    <div className={`presentation-split-popover ${className}`} role="group" aria-label={label}>
      <label><span>Split mode</span><select className="settings-select" aria-label="Slide splitting mode" value={settings.splitMode || 'headings'} onChange={event => set('splitMode', event.target.value)}>
        {SPLIT_MODES.map(mode => <option key={mode.value} value={mode.value}>{mode.label}</option>)}
      </select></label>
      {showsNewSlideAt && <fieldset className="split-trigger-options">
        <legend>New slide at</legend>
        {SPLIT_TRIGGERS.map(trigger => <label key={trigger.value}>
          <input type="checkbox" checked={triggers.includes(trigger.value)} onChange={event => {
            const next = event.target.checked ? [...triggers, trigger.value] : triggers.filter(value => value !== trigger.value)
            set('splitTriggers', next)
          }} />
          <span>{trigger.label}</span>
        </label>)}
      </fieldset>}
      {['smart', 'headings'].includes(settings.splitMode) && <label><span>Heading level</span><select className="settings-select" aria-label="Heading level for slides" value={settings.splitLevel} onChange={event => set('splitLevel', Number(event.target.value))}>
        {SPLIT_LEVELS.map(level => <option key={level.value} value={level.value}>{level.label}</option>)}
      </select></label>}
      {['smart', 'length'].includes(settings.splitMode) && <label><span>Target slide length</span><select className="settings-select" aria-label="Target slide length" value={settings.splitTargetWords} onChange={event => set('splitTargetWords', Number(event.target.value))}>
        {SPLIT_TARGETS.map(target => <option key={target.value} value={target.value}>{target.label}</option>)}
      </select></label>}
      <label className="presentation-split-rule"><input type="checkbox" checked={settings.splitRules} onChange={event => set('splitRules', event.target.checked)} /><span>Break at horizontal rules</span></label>
    </div>
  )
}
