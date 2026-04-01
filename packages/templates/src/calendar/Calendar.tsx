import { useState } from 'react'
import type { SemanticTokenKey } from '@boardmark/canvas-domain'
import type { TemplateRendererProps } from '../types'

export type CalendarData = {
  /** ISO date string (YYYY-MM-DD). Omit to use today. */
  selectedDate?: string
}

type Props = TemplateRendererProps<CalendarData>

const DAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
]

function tok(key: SemanticTokenKey, tokens?: Props['tokens']): string {
  return tokens?.[key] ?? `var(--bm-${key.replace(/\./g, '-')})`
}

function buildCalendarGrid(year: number, month: number): (number | null)[][] {
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1)
  ]
  const rows: (number | null)[][] = []
  for (let i = 0; i < cells.length; i += 7) {
    rows.push(cells.slice(i, i + 7).concat(Array(7).fill(null)).slice(0, 7))
  }
  return rows
}

export function CalendarTemplate({ data, tokens, selected, width, height }: Props) {
  const today = new Date()
  const initial = data.selectedDate ? new Date(data.selectedDate) : today

  const [year, setYear] = useState(initial.getFullYear())
  const [month, setMonth] = useState(initial.getMonth())
  const [selectedDay, setSelectedDay] = useState<number | null>(
    data.selectedDate ? initial.getDate() : null
  )

  const rows = buildCalendarGrid(year, month)

  const isToday = (day: number) =>
    day === today.getDate() && month === today.getMonth() && year === today.getFullYear()

  const isSelected = (day: number) => day === selectedDay

  function prevMonth() {
    if (month === 0) { setYear(y => y - 1); setMonth(11) }
    else setMonth(m => m - 1)
    setSelectedDay(null)
  }

  function nextMonth() {
    if (month === 11) { setYear(y => y + 1); setMonth(0) }
    else setMonth(m => m + 1)
    setSelectedDay(null)
  }

  return (
    <div
      style={{
        width: width ?? 340,
        height: height ?? 320,
        background: tok('color.surface.lowest', tokens),
        borderRadius: tok('radius.lg', tokens),
        boxShadow: selected
          ? `0 0 0 2px ${tok('color.accent.primary', tokens)}, ${tok('shadow.float', tokens)}`
          : tok('shadow.float', tokens),
        fontFamily: 'inherit',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        userSelect: 'none'
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '14px 16px 10px',
          borderBottom: `1px solid ${tok('color.surface.container', tokens)}`
        }}
      >
        <button
          onClick={prevMonth}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: tok('color.text.secondary', tokens),
            fontSize: 16,
            lineHeight: 1,
            padding: '4px 8px',
            borderRadius: tok('radius.md', tokens)
          }}
        >
          ‹
        </button>
        <span
          style={{
            color: tok('color.text.primary', tokens),
            fontSize: 14,
            fontWeight: 600,
            letterSpacing: '0.01em'
          }}
        >
          {MONTH_NAMES[month]} {year}
        </span>
        <button
          onClick={nextMonth}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: tok('color.text.secondary', tokens),
            fontSize: 16,
            lineHeight: 1,
            padding: '4px 8px',
            borderRadius: tok('radius.md', tokens)
          }}
        >
          ›
        </button>
      </div>

      {/* Body */}
      <div style={{ flex: 1, padding: '8px 12px 12px', display: 'flex', flexDirection: 'column', gap: 4 }}>
        {/* Day labels */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
          {DAY_LABELS.map(d => (
            <div
              key={d}
              style={{
                textAlign: 'center',
                fontSize: 11,
                fontWeight: 500,
                color: tok('color.text.tertiary', tokens),
                padding: '2px 0'
              }}
            >
              {d}
            </div>
          ))}
        </div>

        {/* Day grid */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {rows.map((row, ri) => (
            <div
              key={ri}
              style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, flex: 1 }}
            >
              {row.map((day, ci) => {
                if (day === null) return <div key={ci} />

                const today_ = isToday(day)
                const selected_ = isSelected(day)

                return (
                  <button
                    key={ci}
                    onClick={() => setSelectedDay(day)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: 12,
                      fontWeight: selected_ ? 600 : today_ ? 500 : 400,
                      borderRadius: tok('radius.md', tokens),
                      background: selected_
                        ? tok('color.accent.primary', tokens)
                        : today_
                          ? tok('color.accent.container', tokens)
                          : 'transparent',
                      color: selected_
                        ? tok('color.accent.on', tokens)
                        : today_
                          ? tok('color.accent.primary', tokens)
                          : tok('color.text.primary', tokens)
                    }}
                  >
                    {day}
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
