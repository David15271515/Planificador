import type { DaySticker, PlannerItem, Subject } from '../types'

const SUBJECTS_KEY = 'mi-plan-demo-subjects'
const ITEMS_KEY = 'mi-plan-demo-items'
const STICKERS_KEY = 'mi-plan-demo-stickers'

const defaultSubjects: Subject[] = [
  { id: 'anat', name: 'Anatomía', icon: '🧠' },
  { id: 'bioq', name: 'Bioquímica', icon: '🧪' },
  { id: 'fisio', name: 'Fisiología', icon: '💗' },
  { id: 'psico', name: 'Psicosocial', icon: '👥' },
  { id: 'promo', name: 'Promoción', icon: '🌿' },
]

const today = new Date().toISOString().slice(0, 10)

const defaultItems: PlannerItem[] = [
  { id: crypto.randomUUID(), date: today, item_type: 'study', title: 'Estudiar Tema 1', subject_id: 'anat', subject_name: 'Anatomía', action: 'Estudiar', topic_from: 1, topic_to: 1, all_day: true, completed: true },
  { id: crypto.randomUUID(), date: today, item_type: 'study', title: 'Repasar Tema 6', subject_id: 'bioq', subject_name: 'Bioquímica', action: 'Repasar', topic_from: 6, topic_to: 6, all_day: true, completed: false },
  { id: crypto.randomUUID(), date: today, item_type: 'study', title: 'Simulacro', subject_id: 'fisio', subject_name: 'Fisiología', action: 'Simulacro', all_day: true, completed: false },
  { id: crypto.randomUUID(), date: today, item_type: 'personal', title: 'Uñas', subject_id: null, all_day: false, start_time: '17:30', completed: false },
  { id: crypto.randomUUID(), date: today, item_type: 'personal', title: 'Peluquería', subject_id: null, all_day: false, start_time: '19:00', completed: false },
]

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) as T : fallback
  } catch {
    return fallback
  }
}

export const demoStorage = {
  getSubjects(): Subject[] {
    const current = read<Subject[]>(SUBJECTS_KEY, [])
    if (current.length) return current
    localStorage.setItem(SUBJECTS_KEY, JSON.stringify(defaultSubjects))
    return defaultSubjects
  },
  saveSubjects(subjects: Subject[]) {
    localStorage.setItem(SUBJECTS_KEY, JSON.stringify(subjects))
  },
  getItems(): PlannerItem[] {
    const current = read<PlannerItem[]>(ITEMS_KEY, [])
    if (current.length) return current
    localStorage.setItem(ITEMS_KEY, JSON.stringify(defaultItems))
    return defaultItems
  },
  saveItems(items: PlannerItem[]) {
    localStorage.setItem(ITEMS_KEY, JSON.stringify(items))
  },
  getStickers(): DaySticker[] {
    return read<DaySticker[]>(STICKERS_KEY, [])
  },
  saveStickers(stickers: DaySticker[]) {
    localStorage.setItem(STICKERS_KEY, JSON.stringify(stickers))
  }
}
