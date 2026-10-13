import { useEffect, useMemo, useState } from 'react'
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
  subMonths,
} from 'date-fns'
import { es } from 'date-fns/locale'
import {
  Bell,
  BookOpen,
  CalendarDays,
  CalendarRange,
  Check,
  ChevronLeft,
  ChevronRight,
  CirclePlus,
  Heart,
  Home,
  LogOut,
  Plus,
  Sparkles,
  X,
} from 'lucide-react'
import { api, clearSession, hasSession, savedUsername } from './lib/api'
import { demoStorage } from './lib/demoStorage'
import type { DaySticker, ItemType, PlannerItem, Subject, ViewMode } from './types'

const stickerChoices = ['♡', '★', '✿', '☕', '📚', '🎀', '✨', '🌿', '🧠']
type RuntimeMode = 'checking' | 'server' | 'demo'

function isoDate(date: Date) {
  return format(date, 'yyyy-MM-dd')
}

function App() {
  const [runtimeMode, setRuntimeMode] = useState<RuntimeMode>('checking')
  const [sessionUser, setSessionUser] = useState<string | null>(savedUsername())
  const [authLoading, setAuthLoading] = useState(true)
  const [view, setView] = useState<ViewMode>('day')
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [monthCursor, setMonthCursor] = useState(startOfMonth(new Date()))
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [items, setItems] = useState<PlannerItem[]>([])
  const [stickers, setStickers] = useState<DaySticker[]>([])
  const [filter, setFilter] = useState<string>('all')
  const [addOpen, setAddOpen] = useState(false)
  const [stickerOpen, setStickerOpen] = useState(false)

  useEffect(() => {
    let active = true

    const start = async () => {
      const serverAvailable = await api.health()
      if (!active) return

      if (!serverAvailable) {
        setRuntimeMode('demo')
        setSessionUser(null)
        setSubjects(demoStorage.getSubjects())
        setItems(demoStorage.getItems())
        setStickers(demoStorage.getStickers())
        setAuthLoading(false)
        return
      }

      setRuntimeMode('server')
      if (!hasSession()) {
        setSessionUser(null)
        setAuthLoading(false)
        return
      }

      try {
        const me = await api.me()
        if (!active) return
        setSessionUser(me.username)
      } catch {
        clearSession()
        setSessionUser(null)
      } finally {
        if (active) setAuthLoading(false)
      }
    }

    start()
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (runtimeMode !== 'server' || !sessionUser) return
    let active = true
    let loading = false

    const load = async () => {
      if (loading) return
      loading = true
      try {
        const data = await api.data()
        if (!active) return
        setSubjects(data.subjects ?? [])
        setItems(data.items ?? [])
        setStickers(data.stickers ?? [])
      } catch {
        if (!hasSession()) setSessionUser(null)
      } finally {
        loading = false
      }
    }

    load()
    const timer = window.setInterval(load, 5000)
    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [runtimeMode, sessionUser])

  const selectedIso = isoDate(selectedDate)

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (filter === 'all') return true
      if (filter === 'personal') return item.item_type === 'personal'
      return item.subject_id === filter
    })
  }, [items, filter])

  const dayItems = filteredItems.filter((item) => item.date === selectedIso)
  const studyItems = dayItems.filter((item) => item.item_type === 'study')
  const personalItems = dayItems.filter((item) => item.item_type === 'personal')
  const doneCount = dayItems.filter((i) => i.completed).length

  const weekDays = eachDayOfInterval({
    start: startOfWeek(selectedDate, { weekStartsOn: 1 }),
    end: endOfWeek(selectedDate, { weekStartsOn: 1 }),
  })

  async function toggleItem(item: PlannerItem) {
    const nextCompleted = !item.completed
    const previous = items
    const next = items.map((i) => i.id === item.id ? { ...i, completed: nextCompleted } : i)
    setItems(next)

    if (runtimeMode === 'server' && sessionUser) {
      try {
        const result = await api.updateItem(item.id, { completed: nextCompleted })
        setItems((current) => current.map((i) => i.id === item.id ? result.item : i))
      } catch {
        setItems(previous)
      }
      return
    }

    demoStorage.saveItems(next)
  }

  async function addItem(newItem: Omit<PlannerItem, 'id'>) {
    if (runtimeMode === 'server' && sessionUser) {
      const result = await api.addItem(newItem)
      setItems((current) => [result.item, ...current])
      return
    }

    const next = [{ ...newItem, id: crypto.randomUUID() }, ...items]
    setItems(next)
    demoStorage.saveItems(next)
  }

  async function setSticker(sticker: string) {
    const existing = stickers.find((s) => s.date === selectedIso)

    if (runtimeMode === 'server' && sessionUser) {
      const result = await api.setSticker(selectedIso, sticker)
      setStickers((current) => {
        const found = current.some((s) => s.date === selectedIso)
        return found
          ? current.map((s) => s.date === selectedIso ? result.sticker : s)
          : [...current, result.sticker]
      })
      setStickerOpen(false)
      return
    }

    const next = existing
      ? stickers.map((s) => s.id === existing.id ? { ...s, sticker } : s)
      : [...stickers, { id: crypto.randomUUID(), date: selectedIso, sticker }]
    setStickers(next)
    demoStorage.saveStickers(next)
    setStickerOpen(false)
  }

  if (authLoading || runtimeMode === 'checking') return <div className="loading-screen">Cargando Mi Plan…</div>
  if (runtimeMode === 'server' && !sessionUser) {
    return <AuthScreen onAuthenticated={(username) => setSessionUser(username)} />
  }

  return (
    <div className="app-shell">
      <div className="doodle-bg" aria-hidden="true">
        <span>♡</span><span>✿</span><span>★</span><span>📚</span><span>✎</span><span>☕</span><span>♡</span><span>✦</span>
      </div>
      <main className="phone-app">
        <header className="topbar">
          <div>
            <div className="brand">mi plan <Heart size={20} strokeWidth={1.7} /></div>
            <div className="subtitle">ESTUDIA · ORGANIZA · DISFRUTA</div>
          </div>
          <div className="top-actions">
            <span className={runtimeMode === 'server' ? 'mode-pill online' : 'mode-pill'}>
              {runtimeMode === 'server' ? sessionUser : 'Modo local'}
            </span>
            <button className="icon-btn" aria-label="Notificaciones"><Bell size={21} /></button>
          </div>
        </header>

        <section className="hero-row">
          <div>
            <h1>¡Hola{sessionUser ? `, ${sessionUser}` : ''}! <span>♡</span></h1>
            <p>{format(selectedDate, "EEEE, d 'de' MMMM 'de' yyyy", { locale: es })}</p>
          </div>
          <button className="sticker-button" onClick={() => setStickerOpen(true)}>
            {stickers.find((s) => s.date === selectedIso)?.sticker ?? '✿'}
            <small>Pegatina</small>
          </button>
        </section>

        <nav className="view-tabs">
          <button className={view === 'day' ? 'active' : ''} onClick={() => setView('day')}><Home size={17} /> Día</button>
          <button className={view === 'week' ? 'active' : ''} onClick={() => setView('week')}><CalendarRange size={17} /> Semana</button>
          <button className={view === 'month' ? 'active' : ''} onClick={() => setView('month')}><CalendarDays size={17} /> Mes</button>
        </nav>

        <WeekStrip days={weekDays} selectedDate={selectedDate} setSelectedDate={setSelectedDate} stickers={stickers} />

        <div className="filter-row">
          <button className={filter === 'all' ? 'chip active' : 'chip'} onClick={() => setFilter('all')}>Todos</button>
          {subjects.map((s) => (
            <button key={s.id} className={filter === s.id ? 'chip active' : 'chip'} onClick={() => setFilter(s.id)}>{s.icon} {s.name}</button>
          ))}
          <button className={filter === 'personal' ? 'chip active' : 'chip'} onClick={() => setFilter('personal')}>♡ Personal</button>
        </div>

        {view === 'day' && (
          <DayView
            studyItems={studyItems}
            personalItems={personalItems}
            doneCount={doneCount}
            totalCount={dayItems.length}
            onToggle={toggleItem}
            onAdd={() => setAddOpen(true)}
          />
        )}

        {view === 'week' && (
          <WeekView days={weekDays} items={filteredItems} stickers={stickers} onPick={(d) => { setSelectedDate(d); setView('day') }} />
        )}

        {view === 'month' && (
          <MonthView
            cursor={monthCursor}
            selectedDate={selectedDate}
            items={filteredItems}
            stickers={stickers}
            onPrev={() => setMonthCursor(subMonths(monthCursor, 1))}
            onNext={() => setMonthCursor(addMonths(monthCursor, 1))}
            onPick={(d) => { setSelectedDate(d); setMonthCursor(startOfMonth(d)); setView('day') }}
          />
        )}

        <footer className="bottom-nav">
          <button className="active"><Home size={20} /><span>Inicio</span></button>
          <button onClick={() => setView('month')}><CalendarDays size={20} /><span>Agenda</span></button>
          <button className="fab" onClick={() => setAddOpen(true)} aria-label="Añadir"><Plus size={30} /></button>
          <button><Sparkles size={20} /><span>Progreso</span></button>
          {runtimeMode === 'server' ? (
            <button onClick={() => { api.logout(); setSessionUser(null); setItems([]); setStickers([]) }}><LogOut size={20} /><span>Salir</span></button>
          ) : (
            <button><Heart size={20} /><span>Más</span></button>
          )}
        </footer>
      </main>

      {addOpen && <AddItemModal subjects={subjects} defaultDate={selectedIso} onClose={() => setAddOpen(false)} onSave={async (item) => { await addItem(item); setAddOpen(false) }} />}
      {stickerOpen && <StickerModal onClose={() => setStickerOpen(false)} onSelect={setSticker} />}
    </div>
  )
}

function WeekStrip({ days, selectedDate, setSelectedDate, stickers }: { days: Date[]; selectedDate: Date; setSelectedDate: (d: Date) => void; stickers: DaySticker[] }) {
  return (
    <div className="week-strip">
      {days.map((d) => {
        const sticker = stickers.find((s) => s.date === isoDate(d))?.sticker
        return (
          <button key={isoDate(d)} className={isSameDay(d, selectedDate) ? 'day-cell selected' : 'day-cell'} onClick={() => setSelectedDate(d)}>
            <span>{format(d, 'EEE', { locale: es }).replace('.', '')}</span>
            <strong>{format(d, 'd')}</strong>
            <small>{sticker ?? '♡'}</small>
          </button>
        )
      })}
    </div>
  )
}

function DayView({ studyItems, personalItems, doneCount, totalCount, onToggle, onAdd }: { studyItems: PlannerItem[]; personalItems: PlannerItem[]; doneCount: number; totalCount: number; onToggle: (i: PlannerItem) => void; onAdd: () => void }) {
  const pct = totalCount ? Math.round((doneCount / totalCount) * 100) : 0
  return (
    <>
      <section className="panel">
        <div className="panel-title-row">
          <div className="panel-title"><BookOpen size={24} /> Mis tareas de hoy</div>
          <div className="progress-wrap"><span>{doneCount} de {totalCount || 0}</span><div className="progress"><i style={{ width: `${pct}%` }} /></div></div>
        </div>
        <div className="item-list">
          {studyItems.length === 0 ? <Empty text="No tienes tareas de estudio para este día." /> : studyItems.map((item) => <PlannerRow key={item.id} item={item} onToggle={onToggle} />)}
        </div>
      </section>

      <section className="panel">
        <div className="panel-title-row">
          <div className="panel-title"><CalendarDays size={24} /> Mis planes de hoy</div>
          <button className="round-add" onClick={onAdd}><Plus size={20} /></button>
        </div>
        <div className="item-list">
          {personalItems.length === 0 ? <Empty text="No tienes planes personales para este día." /> : personalItems.map((item) => <PlannerRow key={item.id} item={item} onToggle={onToggle} />)}
        </div>
      </section>
    </>
  )
}

function PlannerRow({ item, onToggle }: { item: PlannerItem; onToggle: (i: PlannerItem) => void }) {
  return (
    <button className={item.completed ? 'planner-row done' : 'planner-row'} onClick={() => onToggle(item)}>
      <span className={item.completed ? 'check-box checked' : 'check-box'}>{item.completed && <Check size={16} />}</span>
      {item.item_type === 'personal' && <time>{item.start_time?.slice(0, 5) || 'Todo el día'}</time>}
      <span className="row-main">
        <strong>{item.title}</strong>
        <small>{item.item_type === 'study' ? (item.subject_name || 'Estudio') : 'Personal'}</small>
      </span>
      <span className="row-icon">{item.item_type === 'personal' ? '♡' : '📘'}</span>
    </button>
  )
}

function WeekView({ days, items, stickers, onPick }: { days: Date[]; items: PlannerItem[]; stickers: DaySticker[]; onPick: (d: Date) => void }) {
  return (
    <section className="panel week-list-panel">
      <div className="panel-title"><CalendarRange size={24} /> Vista semanal</div>
      {days.map((d) => {
        const dayItems = items.filter((i) => i.date === isoDate(d))
        const sticker = stickers.find((s) => s.date === isoDate(d))?.sticker
        return (
          <button className="week-list-row" key={isoDate(d)} onClick={() => onPick(d)}>
            <div className="week-date"><strong>{format(d, 'd')}</strong><span>{format(d, 'EEE', { locale: es })}</span></div>
            <div className="week-summary">
              <strong>{dayItems.length ? `${dayItems.length} cosas planeadas` : 'Día libre'}</strong>
              <small>{dayItems.slice(0, 2).map((i) => i.title).join(' · ') || 'Sin tareas ni eventos'}</small>
            </div>
            <div className="week-sticker">{sticker ?? '♡'}</div>
          </button>
        )
      })}
    </section>
  )
}

function MonthView({ cursor, selectedDate, items, stickers, onPrev, onNext, onPick }: { cursor: Date; selectedDate: Date; items: PlannerItem[]; stickers: DaySticker[]; onPrev: () => void; onNext: () => void; onPick: (d: Date) => void }) {
  const gridStart = startOfWeek(startOfMonth(cursor), { weekStartsOn: 1 })
  const gridEnd = endOfWeek(endOfMonth(cursor), { weekStartsOn: 1 })
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd })
  const weekNames = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

  return (
    <section className="panel month-panel">
      <div className="month-head">
        <button className="icon-btn" onClick={onPrev}><ChevronLeft size={21} /></button>
        <div><small>Vista mensual</small><strong>{format(cursor, 'MMMM yyyy', { locale: es })}</strong></div>
        <button className="icon-btn" onClick={onNext}><ChevronRight size={21} /></button>
      </div>
      <div className="month-weeknames">{weekNames.map((n) => <span key={n}>{n}</span>)}</div>
      <div className="month-grid">
        {days.map((d) => {
          const dIso = isoDate(d)
          const dayItems = items.filter((i) => i.date === dIso)
          const sticker = stickers.find((s) => s.date === dIso)?.sticker
          return (
            <button key={dIso} onClick={() => onPick(d)} className={`${!isSameMonth(d, cursor) ? 'outside ' : ''}${isSameDay(d, selectedDate) ? 'selected' : ''}`}>
              <span>{format(d, 'd')}</span>
              <small>{sticker || (dayItems.length ? '•'.repeat(Math.min(dayItems.length, 3)) : '')}</small>
            </button>
          )
        })}
      </div>
    </section>
  )
}

function AddItemModal({ subjects, defaultDate, onClose, onSave }: { subjects: Subject[]; defaultDate: string; onClose: () => void; onSave: (item: Omit<PlannerItem, 'id'>) => void }) {
  const [itemType, setItemType] = useState<ItemType>('study')
  const [title, setTitle] = useState('')
  const [subjectId, setSubjectId] = useState(subjects[0]?.id ?? '')
  const [date, setDate] = useState(defaultDate)
  const [time, setTime] = useState('17:30')

  const selectedSubject = subjects.find((s) => s.id === subjectId)

  return (
    <div className="modal-backdrop">
      <div className="modal-card">
        <div className="modal-title"><strong>Añadir a mi plan</strong><button className="icon-btn" onClick={onClose}><X /></button></div>
        <div className="type-toggle">
          <button className={itemType === 'study' ? 'active' : ''} onClick={() => setItemType('study')}>📚 Estudio</button>
          <button className={itemType === 'personal' ? 'active' : ''} onClick={() => setItemType('personal')}>♡ Personal</button>
        </div>
        <label>Qué quieres hacer<input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={itemType === 'study' ? 'Ej. Repasar Tema 4' : 'Ej. Cena con amigas'} autoFocus /></label>
        {itemType === 'study' && <label>Asignatura<select value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>{subjects.map((s) => <option value={s.id} key={s.id}>{s.icon} {s.name}</option>)}</select></label>}
        <div className="two-cols">
          <label>Fecha<input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
          {itemType === 'personal' && <label>Hora<input type="time" value={time} onChange={(e) => setTime(e.target.value)} /></label>}
        </div>
        <button className="primary-btn" disabled={!title.trim()} onClick={() => onSave({
          date,
          item_type: itemType,
          title: title.trim(),
          subject_id: itemType === 'study' ? subjectId : null,
          subject_name: itemType === 'study' ? selectedSubject?.name : null,
          all_day: itemType === 'study',
          start_time: itemType === 'personal' ? time : null,
          completed: false,
        })}><CirclePlus size={18} /> Añadir</button>
      </div>
    </div>
  )
}

function StickerModal({ onClose, onSelect }: { onClose: () => void; onSelect: (s: string) => void }) {
  return (
    <div className="modal-backdrop">
      <div className="modal-card sticker-card">
        <div className="modal-title"><strong>Pegatina del día</strong><button className="icon-btn" onClick={onClose}><X /></button></div>
        <div className="sticker-grid">{stickerChoices.map((s) => <button key={s} onClick={() => onSelect(s)}>{s}</button>)}</div>
      </div>
    </div>
  )
}

function AuthScreen({ onAuthenticated }: { onAuthenticated: (username: string) => void }) {
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(event?: React.FormEvent) {
    event?.preventDefault()
    if (!username.trim() || !password) return
    setBusy(true)
    setMessage('')
    try {
      const result = mode === 'signup'
        ? await api.register(username.trim(), password)
        : await api.login(username.trim(), password)
      onAuthenticated(result.username)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se ha podido entrar.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={submit}>
        <div className="brand large">mi plan <Heart size={24} /></div>
        <p>La misma agenda desde móvil, ordenador o tablet.</p>
        <label>Usuario<input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" placeholder="Ej. Conso" autoFocus /></label>
        <label>Contraseña<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} /></label>
        <button className="primary-btn" disabled={busy || !username.trim() || !password} type="submit">
          {busy ? 'Un momento…' : mode === 'login' ? 'Entrar' : 'Crear usuario'}
        </button>
        <button className="text-btn" type="button" onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setMessage('') }}>
          {mode === 'login' ? 'Crear un usuario' : 'Ya tengo usuario'}
        </button>
        {message && <small className="auth-message">{message}</small>}
        <small>La sesión queda guardada en este dispositivo. No necesitas correo.</small>
      </form>
    </div>
  )
}

function Empty({ text }: { text: string }) {
  return <div className="empty-state">{text}</div>
}

export default App
