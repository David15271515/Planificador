export type ViewMode = 'day' | 'week' | 'month'
export type ItemType = 'study' | 'personal'

export type Subject = {
  id: string
  name: string
  icon: string
  color?: string | null
}

export type PlannerItem = {
  id: string
  user_id?: string
  date: string
  item_type: ItemType
  title: string
  subject_id: string | null
  subject_name?: string | null
  action?: string | null
  topic_from?: number | null
  topic_to?: number | null
  all_day: boolean
  start_time?: string | null
  completed: boolean
  notes?: string | null
}

export type DaySticker = {
  id: string
  user_id?: string
  date: string
  sticker: string
}
