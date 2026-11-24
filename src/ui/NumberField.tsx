import { useEffect, useState } from 'react'

interface Props {
  value: number | undefined
  onChange(v: number | undefined): void
  min?: number
  max?: number
  /** Empty means "no value" (e.g. automatic weight) instead of snapping back. */
  allowEmpty?: boolean
  label: string
  placeholder?: string
  disabled?: boolean
  width?: string
}

/** A number input that lets you clear it while typing and only normalizes (clamps, rounds) when you leave it. */
export function NumberField({ value, onChange, min = 0, max = 1e6, allowEmpty = false, label, placeholder, disabled, width = '5.5rem' }: Props) {
  const [text, setText] = useState(value === undefined ? '' : String(value))
  useEffect(() => {
    // Follow external changes (presets, resets) but never fight the user's typing.
    setText((t) => (t.trim() !== '' && Number(t) === value ? t : value === undefined ? (t === '' ? t : '') : String(value)))
  }, [value])
  const commit = (raw: string) => {
    if (raw.trim() === '') return allowEmpty ? onChange(undefined) : undefined
    const n = Number(raw)
    if (Number.isFinite(n)) onChange(Math.max(min, Math.min(max, Math.round(n))))
  }
  return (
    <input
      type="number"
      inputMode="numeric"
      aria-label={label}
      min={min}
      max={max}
      style={{ width }}
      disabled={disabled}
      placeholder={placeholder}
      value={text}
      onChange={(e) => {
        setText(e.target.value)
        commit(e.target.value)
      }}
      onBlur={() => setText(value === undefined ? '' : String(value))}
    />
  )
}
