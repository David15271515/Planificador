import type { DaySticker, PlannerItem, Subject } from '../types'

export type PlannerData = {
  version?: number
  updatedAt?: string
  subjects: Subject[]
  items: PlannerItem[]
  stickers: DaySticker[]
}

const TOKEN_KEY = 'mi-plan-token'
const USER_KEY = 'mi-plan-user'
const configuredBase = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '')

function apiUrl(path: string) {
  return `${configuredBase || ''}${path}`
}

function token() {
  return localStorage.getItem(TOKEN_KEY)
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  headers.set('Content-Type', 'application/json')
  const authToken = token()
  if (authToken) headers.set('Authorization', `Bearer ${authToken}`)

  const response = await fetch(apiUrl(path), { ...init, headers })
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?: string }
    if (response.status === 401) clearSession()
    throw new Error(body.error || `Error ${response.status}`)
  }
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

export function saveSession(authToken: string, username: string) {
  localStorage.setItem(TOKEN_KEY, authToken)
  localStorage.setItem(USER_KEY, username)
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
}

export function hasSession() {
  return Boolean(token())
}

export function savedUsername() {
  return localStorage.getItem(USER_KEY)
}

export const api = {
  async health() {
    const controller = new AbortController()
    const timer = window.setTimeout(() => controller.abort(), 1800)
    try {
      const response = await fetch(apiUrl('/api/health'), { signal: controller.signal })
      if (!response.ok) return false
      const body = await response.json().catch(() => null) as { ok?: boolean; storage?: string } | null
      return body?.ok === true && body?.storage === 'json'
    } catch {
      return false
    } finally {
      window.clearTimeout(timer)
    }
  },

  async login(username: string, password: string) {
    const result = await request<{ token: string; username: string }>('/api/login', {
      method: 'POST', body: JSON.stringify({ username, password }),
    })
    saveSession(result.token, result.username)
    return result
  },

  async register(username: string, password: string) {
    const result = await request<{ token: string; username: string }>('/api/register', {
      method: 'POST', body: JSON.stringify({ username, password }),
    })
    saveSession(result.token, result.username)
    return result
  },

  me() {
    return request<{ username: string }>('/api/me')
  },

  data() {
    return request<PlannerData>('/api/data')
  },

  addItem(item: Omit<PlannerItem, 'id'>) {
    return request<{ item: PlannerItem }>('/api/items', { method: 'POST', body: JSON.stringify(item) })
  },

  updateItem(id: string, patch: Partial<PlannerItem>) {
    return request<{ item: PlannerItem }>(`/api/items/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(patch) })
  },

  deleteItem(id: string) {
    return request<void>(`/api/items/${encodeURIComponent(id)}`, { method: 'DELETE' })
  },

  setSticker(date: string, sticker: string) {
    return request<{ sticker: DaySticker }>(`/api/stickers/${encodeURIComponent(date)}`, { method: 'PUT', body: JSON.stringify({ sticker }) })
  },

  logout() {
    clearSession()
  },
}
