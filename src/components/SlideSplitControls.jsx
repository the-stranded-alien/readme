import { SPLIT_CUSTOM_LEVELS, SPLIT_CUSTOM_TRIGGERS, SPLIT_LEVELS, SPLIT_MODES, SPLIT_TARGETS } from '../presentationSettings'
import PickerDropdown from './PickerDropdown'

/** Shared split mode and custom combination controls for Settings and the presentation toolbar. */
export default function SlideSplitControls({ settings, onChange, label = 'Slide splitting options', variant = 'popover', className = '' }) {
  const setMode = mode => onChange(current => ({ ...current, splitMode: mode, splitModeExplicit: true }))
  const set = (key, value) => onChange(current => ({ ...current, [key]: value }))
  const modeOptions = SPLIT_MODES
  const levelOptions = SPLIT_LEVELS.map(level => ({ value: level.value, label: level.label }))
  const targetOptions = SPLIT_TARGETS.map(target => ({ value: target.value, label: target.label }))
  const isHeadingSplit = settings.splitMode === 'headings' || settings.splitMode === 'smart'
  const toggle = (key, value) => set(key, settings[key].includes(value) ? settings[key].filter(item => item !== value) : [...settings[key], value])
  return (
    <div className={`presentation-split-popover${variant === 'settings' ? ' split-settings-inline' : ''} ${className}`} role="group" aria-label={label}>
      <label><span>Split mode</span><PickerDropdown label="Slide splitting mode" value={settings.splitMode || 'headings'} options={modeOptions}
        className="split-picker" width={210} onChange={setMode} /></label>
      {isHeadingSplit && <label><span>Heading level</span><PickerDropdown label="Heading level for slides" value={settings.splitLevel} options={levelOptions}
        className="split-picker" width={210} onChange={value => set('splitLevel', Number(value))} /></label>}
      {settings.splitMode === 'custom' && <fieldset className="split-at-options split-custom-options" aria-label="Start a new slide at">
        <legend>Start a new slide at</legend>
        <div className="split-custom-heading-grid">{SPLIT_CUSTOM_LEVELS.map(option => <label key={option.value}>
          <input type="checkbox" aria-label={option.label} checked={settings.splitLevels.includes(option.value)} onChange={() => toggle('splitLevels', option.value)} />
          <span>{option.label}</span>
        </label>)}</div>
        <div className="split-custom-trigger-grid">{SPLIT_CUSTOM_TRIGGERS.map(option => <label key={option.value}>
          <input type="checkbox" aria-label={option.label} checked={settings.splitTriggers.includes(option.value)} onChange={() => toggle('splitTriggers', option.value)} />
          <span>{option.label}</span>
        </label>)}</div>
      </fieldset>}
      {['smart', 'length'].includes(settings.splitMode) && <label><span>Target slide length</span><PickerDropdown label="Target slide length" value={settings.splitTargetWords} options={targetOptions}
        className="split-picker" width={210} onChange={value => set('splitTargetWords', Number(value))} /></label>}
    </div>
  )
}
