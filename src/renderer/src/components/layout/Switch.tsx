/** Track + knob of an on/off switch. Purely visual: put it inside the element carrying role="switch". */
export function SwitchTrack({ on, tone = 'accent' }: { on: boolean; tone?: 'accent' | 'success' }) {
  const onColour = tone === 'success' ? 'bg-success' : 'bg-accent'
  return (
    <span
      aria-hidden="true"
      className={`relative inline-block shrink-0 w-6 h-3.5 rounded-full transition-colors ${on ? onColour : 'bg-chrome-hover'}`}
    >
      <span
        className={`absolute top-0.5 left-0 w-2.5 h-2.5 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-3' : 'translate-x-0.5'}`}
      />
    </span>
  )
}
