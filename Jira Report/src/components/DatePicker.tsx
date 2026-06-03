import React, { useCallback, useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react'
import { cn } from '../utils/utils'

interface DatePickerProps {
  value?: string; onChange: (v: string) => void
  min?: string; max?: string; placeholder?: string
}

const toDate = (s?: string) => (s ? new Date(s + 'T00:00:00Z') : null)
const fmtISO = (d: Date) => d.toISOString().slice(0, 10)
const loc = (s: string, o: Intl.DateTimeFormatOptions) => { const d = toDate(s); return d ? d.toLocaleDateString(undefined, o) : s }
const fmtShort = (s: string) => loc(s, { day: 'numeric', month: 'short', year: 'numeric' })
const fmtLong  = (s: string) => loc(s, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
const WEEKDAYS  = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']
const buildGrid = (m: Date) => {
  const off = (new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth(), 1)).getUTCDay() + 6) % 7
  return Array.from({ length: 42 }, (_, i) => new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth(), 1 - off + i)))
}

export default function DatePicker({ value, onChange, min, max, placeholder }: DatePickerProps) {
  const popId = `dp-${useId()}`
  const [open, setOpen]   = useState(false)
  const [month, setMonth] = useState<Date>(() => toDate(value) ?? new Date())
  const [hover, setHover] = useState<Date | null>(null)
  const [pos, setPos]     = useState<React.CSSProperties>({})
  const ref               = useRef<HTMLDivElement>(null)

  useEffect(() => { if (value) setMonth(toDate(value) ?? new Date()) }, [value])
  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => {
      if (ref.current?.contains(e.target as Node)) return
      if (document.getElementById(popId)?.contains(e.target as Node)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open, popId])

  const openCal = useCallback(() => {
    if (!ref.current) return
    const r = ref.current.getBoundingClientRect()
    setPos({ position: 'fixed', top: r.bottom + 8, left: Math.max(8, Math.min(r.left, window.innerWidth - 296)), zIndex: 9999 })
    setOpen(true)
  }, [])

  const changeMonth = (d: number) => setMonth(m => new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + d, 1)))
  const onSelect = useCallback((d: Date) => {
    const s = fmtISO(d)
    if ((min && s < min) || (max && s > max)) return
    onChange(s); setOpen(false)
  }, [min, max, onChange])

  const today = new Date()
  const todayISO = fmtISO(today)
  const sel  = value ?? ''
  const grid = buildGrid(month)

  return (
    <div ref={ref} className="w-full cursor-pointer" onClick={openCal}>
      <div className="flex items-center gap-1.5 group/dp">
        <CalendarDays className={cn('w-3.5 h-3.5 shrink-0 transition-colors', sel ? 'text-blue-500' : 'text-gray-400 group-hover/dp:text-blue-400')} />
        <span className={cn('text-[11px] select-none whitespace-nowrap truncate', sel ? 'text-blue-800 font-semibold' : 'text-gray-400 group-hover/dp:text-gray-600')}>
          {sel ? fmtShort(sel) : (placeholder ?? 'Pick a date')}
        </span>
      </div>

      {open && createPortal(
        <div id={popId} style={{ ...pos, width: 288 }}
          className="bg-white rounded-2xl overflow-hidden shadow-[0_24px_64px_rgba(59,130,246,0.18),0_4px_16px_rgba(0,0,0,0.08)] border border-slate-200/60"
          onMouseDown={e => e.stopPropagation()}>

          {/* header */}
          <div className="relative px-4 pt-4 pb-3 overflow-hidden select-none" style={{ background: 'linear-gradient(135deg,#1d4ed8 0%,#4f46e5 100%)' }}>
            <div className="absolute -top-6 -right-6 w-24 h-24 rounded-full bg-white/10" />
            <div className="absolute -bottom-4 -left-4 w-16 h-16 rounded-full bg-white/10" />
            <div className="relative flex items-center justify-between mb-2">
              <button type="button" onClick={e => { e.stopPropagation(); changeMonth(-1) }}
                className="w-8 h-8 rounded-xl flex items-center justify-center text-white hover:bg-white/20 active:scale-90 transition-all">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <div className="text-center">
                <p className="text-base font-bold text-white tracking-wide leading-tight">{month.toLocaleString(undefined, { month: 'long' })}</p>
                <p className="text-xs text-blue-200 font-semibold">{month.getUTCFullYear()}</p>
              </div>
              <button type="button" onClick={e => { e.stopPropagation(); changeMonth(1) }}
                className="w-8 h-8 rounded-xl flex items-center justify-center text-white hover:bg-white/20 active:scale-90 transition-all">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
            <div className="relative text-center bg-white/10 rounded-xl px-3 py-1.5">
              <p className={cn('text-[11px] font-medium leading-none', sel ? 'text-white' : 'text-blue-300')}>
                {sel ? fmtLong(sel) : 'No date selected'}
              </p>
            </div>
          </div>

          {/* weekdays */}
          <div className="grid grid-cols-7 px-3 pt-3 pb-1.5 bg-slate-50 border-b border-slate-100">
            {WEEKDAYS.map((d, i) => (
              <div key={d} className={cn('text-center text-[10px] font-bold uppercase tracking-wider', i >= 5 ? 'text-rose-400' : 'text-slate-400')}>{d}</div>
            ))}
          </div>

          {/* days */}
          <div className="grid grid-cols-7 gap-y-0.5 px-3 pt-2 pb-2" tabIndex={0}
            onKeyDown={e => {
              if (!hover) return
              const fd = new Date(hover), mv = (n: number) => { fd.setUTCDate(fd.getUTCDate() + n); setHover(fd) }
              const K = e.key
              if      (K === 'ArrowLeft')  { e.preventDefault(); mv(-1) }
              else if (K === 'ArrowRight') { e.preventDefault(); mv(1) }
              else if (K === 'ArrowUp')    { e.preventDefault(); mv(-7) }
              else if (K === 'ArrowDown')  { e.preventDefault(); mv(7) }
              else if (K === 'Enter')   onSelect(hover)
              else if (K === 'Escape')  setOpen(false)
            }}>
            {grid.map(d => {
              const s = fmtISO(d)
              const other  = d.getUTCMonth() !== month.getUTCMonth()
              const dis    = !!(min && s < min) || !!(max && s > max)
              const isSel  = s === sel
              const isToday = s === todayISO
              const isHov  = hover ? fmtISO(hover) === s : false
              const wknd   = d.getUTCDay() === 0 || d.getUTCDay() === 6
              return (
                <button key={s} type="button"
                  onClick={e => { e.stopPropagation(); if (!dis && !other) onSelect(d) }}
                  onMouseEnter={() => !other && setHover(d)}
                  onMouseLeave={() => setHover(null)}
                  className={cn(
                    'relative h-9 w-full rounded-xl text-[12px] font-medium transition-all duration-100 outline-none',
                    other  && 'text-slate-200 pointer-events-none',
                    dis && !other && 'text-slate-300 cursor-not-allowed line-through',
                    !other && !isSel && !dis && !isToday && !isHov && (wknd ? 'text-rose-400' : 'text-slate-700'),
                    !other && !isSel && !dis && isHov && (wknd ? 'bg-rose-50 text-rose-500 scale-110' : 'bg-blue-50 text-blue-600 scale-110'),
                    isToday && !isSel && 'bg-blue-100 text-blue-700 font-bold ring-2 ring-blue-400 ring-inset',
                    isSel  && 'bg-blue-600 text-white font-bold shadow-lg shadow-blue-300/50 scale-110 z-10',
                  )}>
                  {d.getUTCDate()}
                  {isToday && !isSel && <span className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-blue-500" />}
                </button>
              )
            })}
          </div>

          {/* footer */}
          <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 border-t border-slate-100">
            <button type="button" onClick={e => { e.stopPropagation(); onSelect(today) }}
              className="text-[11px] font-bold text-blue-500 hover:text-blue-700 px-2.5 py-1 rounded-lg hover:bg-blue-50 transition-colors">Today</button>
            {sel && <button type="button" onClick={e => { e.stopPropagation(); onChange(''); setOpen(false) }}
              className="text-[11px] font-semibold text-slate-400 hover:text-red-500 px-2.5 py-1 rounded-lg hover:bg-red-50 transition-colors">Clear</button>}
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}
