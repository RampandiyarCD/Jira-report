import { Select } from './Select'
import { Label } from './Label'
import { getBoards, getProjects } from '../api/jira'
import { useEffect, useState } from 'react'
import { useFilter } from '../context/FilterContext'
import { CalendarRange, ArrowRight, X } from 'lucide-react'
import { cn } from '../utils/utils'
import DatePicker from './DatePicker'

export function GlobalFilters() {
  const [projects, setProjects] = useState<{ name: string; key: string }[]>([])
  const [boards, setBoards]     = useState<{ name: string; id: string; projectKey: string; type: string }[]>([])
  const { selectedProject, selectedBoard, dateFrom, dateTo, setSelectedProject, setSelectedBoard, setDateFrom, setDateTo } = useFilter()

  useEffect(() => {
    getProjects().then(r => { if (r?.data?.projects) setProjects(r.data.projects) }).catch(console.error)
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!selectedProject) { setBoards([]); setSelectedBoard(''); return }
    getBoards(selectedProject)
      .then(r => {
        if (!r?.data?.boards) return
        const b = r.data.boards; setBoards(b)
        if (!b.some((x: { id: string }) => String(x.id) === String(selectedBoard))) setSelectedBoard('')
      })
      .catch(() => { setBoards([]); setSelectedBoard('') })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProject])

  const isActive = !!(dateFrom || dateTo)
  const pillCls  = isActive
    ? 'border-blue-400 shadow-lg shadow-blue-100/60'
    : 'border-gray-200 shadow-sm hover:border-blue-200 hover:shadow-md hover:shadow-blue-50'

  return (
    <div className="flex flex-wrap items-center gap-3 px-6 py-2.5 border-b border-gray-100 bg-white">
      <div className="flex items-center gap-2">
        <Label htmlFor="gf-proj" className="text-xs text-gray-500 whitespace-nowrap">Project</Label>
        <Select id="gf-proj" className="h-7 text-xs py-0" value={selectedProject} onChange={e => setSelectedProject(e.target.value)}>
          <option value="">All Projects</option>
          {projects.map(p => <option key={p.key} value={p.key}>{p.name}</option>)}
        </Select>
        <Label htmlFor="gf-board" className="text-xs text-gray-500 whitespace-nowrap">Board</Label>
        <Select id="gf-board" className="h-7 text-xs py-0" value={selectedBoard} onChange={e => setSelectedBoard(e.target.value)} disabled={!selectedProject}>
          <option value="">All boards</option>
          {boards.map(b => <option key={b.id} value={b.id}>{b.name} ({b.type})</option>)}
        </Select>
      </div>

      <div className="h-6 w-px bg-gray-200" />

      <div className="flex items-center gap-2">
        <div className={cn('group relative flex items-stretch rounded-xl border-2 transition-all duration-200', pillCls)}>
          <div className={cn('flex items-center justify-center px-3 transition-all duration-200', isActive ? 'bg-linear-to-b from-blue-500 to-blue-600' : 'bg-gray-50 group-hover:bg-blue-50')}>
            <CalendarRange className={cn('w-4 h-4 transition-colors', isActive ? 'text-white' : 'text-gray-400 group-hover:text-blue-400')} />
          </div>
          <div className={cn('flex flex-col justify-center px-3 py-1.5 border-l transition-colors', dateFrom ? 'bg-blue-50 border-blue-200' : 'bg-white border-gray-100 group-hover:bg-slate-50 group-hover:border-blue-100')}>
            <span className={cn('text-[9px] font-bold tracking-widest uppercase leading-none mb-0.5 select-none', dateFrom ? 'text-blue-500' : 'text-gray-400')}>FROM</span>
            <div className="w-28"><DatePicker value={dateFrom} onChange={setDateFrom} max={dateTo || undefined} placeholder="Pick date" /></div>
          </div>
          <div className={cn('flex items-center px-1.5 transition-colors', isActive ? 'bg-blue-50/70' : 'bg-white group-hover:bg-slate-50')}>
            <ArrowRight className={cn('w-3 h-3 shrink-0', dateFrom && dateTo ? 'text-blue-400' : 'text-gray-300')} />
          </div>
          <div className={cn('flex flex-col justify-center px-3 py-1.5 transition-colors', dateTo ? 'bg-blue-50' : 'bg-white group-hover:bg-slate-50')}>
            <span className={cn('text-[9px] font-bold tracking-widest uppercase leading-none mb-0.5 select-none', dateTo ? 'text-blue-500' : 'text-gray-400')}>TO</span>
            <div className="w-28"><DatePicker value={dateTo} onChange={setDateTo} min={dateFrom || undefined} placeholder="Pick date" /></div>
          </div>
          {isActive
            ? <button onClick={() => { setDateFrom(''); setDateTo('') }} className="flex items-center justify-center px-2.5 border-l border-blue-200 bg-blue-50/60 text-blue-300 hover:bg-red-50 hover:text-red-500 hover:border-red-200 transition-all" title="Clear"><X className="w-3.5 h-3.5" /></button>
            : <div className="w-1 bg-white" />
          }
        </div>
        {isActive && (
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold bg-blue-500 text-white px-2 py-0.5 rounded-full shadow-sm shadow-blue-200">
            <span className="w-1.5 h-1.5 rounded-full bg-white/80 animate-pulse" />ACTIVE
          </span>
        )}
      </div>
    </div>
  )
}
