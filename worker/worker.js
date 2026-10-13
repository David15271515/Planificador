const encoder = new TextEncoder()
const decoder = new TextDecoder()

function cors(env, request) {
  const origin = request.headers.get('Origin') || ''
  const allowed = (env.ALLOWED_ORIGIN || '*').trim()
  const value = allowed === '*' || origin === allowed ? (allowed === '*' ? '*' : origin) : allowed
  return {
    'Access-Control-Allow-Origin': value,
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  }
}

function json(env, request, body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...cors(env, request) },
  })
}

function normalizeUsername(value) {
  return String(value || '').trim().toLowerCase()
}

function validUsername(value) {
  return /^[a-z0-9_.-]{2,32}$/i.test(value)
}

function b64url(bytes) {
  const bin = String.fromCharCode(...bytes)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function fromB64url(value) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4)
  const bin = atob(padded)
  return Uint8Array.from(bin, c => c.charCodeAt(0))
}

async function hmac(secret, text) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify'])
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(text)))
}

async function signToken(env, username) {
  const payload = { sub: username, exp: Date.now() + 1000 * 60 * 60 * 24 * 30 }
  const encoded = b64url(encoder.encode(JSON.stringify(payload)))
  const sig = b64url(await hmac(env.SESSION_SECRET, encoded))
  return `${encoded}.${sig}`
}

async function verifyToken(env, token) {
  if (!token || !token.includes('.')) return null
  const [encoded, sig] = token.split('.')
  const expected = await hmac(env.SESSION_SECRET, encoded)
  const actual = fromB64url(sig)
  if (expected.length !== actual.length) return null
  let diff = 0
  for (let i = 0; i < expected.length; i++) diff |= expected[i] ^ actual[i]
  if (diff !== 0) return null
  try {
    const payload = JSON.parse(decoder.decode(fromB64url(encoded)))
    if (!payload.sub || !payload.exp || payload.exp < Date.now()) return null
    return payload.sub
  } catch { return null }
}

async function passwordHash(password, salt) {
  const keyMaterial = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 120000, hash: 'SHA-256' }, keyMaterial, 256)
  return new Uint8Array(bits)
}

async function makePassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const hash = await passwordHash(password, salt)
  return { salt: b64url(salt), hash: b64url(hash) }
}

async function verifyPassword(password, record) {
  if (!record?.salt || !record?.hash) return false
  const hash = await passwordHash(password, fromB64url(record.salt))
  return b64url(hash) === record.hash
}

function ghHeaders(env) {
  return {
    'Authorization': `Bearer ${env.GITHUB_TOKEN}`,
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'mi-plan-worker',
    'Content-Type': 'application/json',
  }
}

function ghBase(env, path) {
  return `https://api.github.com/repos/${encodeURIComponent(env.GITHUB_OWNER)}/${encodeURIComponent(env.GITHUB_DATA_REPO)}/contents/${path.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(env.GITHUB_BRANCH || 'main')}`
}

async function readFile(env, path, fallback) {
  const res = await fetch(ghBase(env, path), { headers: ghHeaders(env) })
  if (res.status === 404) return { data: fallback, sha: null }
  if (!res.ok) throw new Error(`GitHub read ${res.status}`)
  const body = await res.json()
  const raw = Uint8Array.from(atob(String(body.content || '').replace(/\n/g, '')), c => c.charCodeAt(0))
  return { data: JSON.parse(decoder.decode(raw)), sha: body.sha }
}

async function writeFile(env, path, data, sha = null, message = 'Actualizar Mi Plan') {
  const url = ghBase(env, path).replace(/\?ref=.*$/, '')
  const content = btoa(unescape(encodeURIComponent(JSON.stringify(data, null, 2))))
  const body = { message, content, branch: env.GITHUB_BRANCH || 'main' }
  if (sha) body.sha = sha
  const res = await fetch(url, { method: 'PUT', headers: ghHeaders(env), body: JSON.stringify(body) })
  if (!res.ok) {
    const detail = await res.text()
    throw new Error(`GitHub write ${res.status}: ${detail.slice(0, 200)}`)
  }
  return res.json()
}

function defaultSubjects() {
  return [
    { id: 'anatomia', name: 'Anatomía', icon: '🧠', color: '#9fd8cc' },
    { id: 'bioquimica', name: 'Bioquímica', icon: '🧪', color: '#b7dec8' },
    { id: 'fisiologia', name: 'Fisiología', icon: '♡', color: '#a8d7cf' },
    { id: 'psicosocial', name: 'Psicosocial', icon: '👥', color: '#c0ded5' },
    { id: 'promocion', name: 'Promoción', icon: '🌿', color: '#b8dfd0' },
  ]
}

function defaultData() {
  return { version: 1, updatedAt: new Date().toISOString(), subjects: defaultSubjects(), items: [], stickers: [] }
}

async function authUser(env, request) {
  const auth = request.headers.get('Authorization') || ''
  return verifyToken(env, auth.startsWith('Bearer ') ? auth.slice(7) : '')
}

async function userData(env, username) {
  return readFile(env, `data/${username}.json`, defaultData())
}

async function saveUserData(env, username, data, sha) {
  data.updatedAt = new Date().toISOString()
  await writeFile(env, `data/${username}.json`, data, sha, `Actualizar agenda de ${username}`)
}

function itemId() {
  return crypto.randomUUID()
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(env, request) })

    const url = new URL(request.url)
    const path = url.pathname.replace(/\/+$/, '') || '/'

    try {
      if (path === '/api/health' && request.method === 'GET') {
        return json(env, request, { ok: true, storage: 'github-json' })
      }

      if (path === '/api/register' && request.method === 'POST') {
        const { username: raw, password } = await request.json()
        const username = normalizeUsername(raw)
        if (!validUsername(username)) return json(env, request, { error: 'Usuario: 2-32 caracteres, letras, números, punto, guion o _.' }, 400)
        if (String(password || '').length < 4) return json(env, request, { error: 'La contraseña debe tener al menos 4 caracteres.' }, 400)

        const usersFile = await readFile(env, 'users.json', { users: {} })
        if (usersFile.data.users?.[username]) return json(env, request, { error: 'Ese usuario ya existe.' }, 409)
        const pass = await makePassword(String(password))
        usersFile.data.users = usersFile.data.users || {}
        usersFile.data.users[username] = { displayName: String(raw).trim(), ...pass, createdAt: new Date().toISOString() }
        await writeFile(env, 'users.json', usersFile.data, usersFile.sha, `Crear usuario ${username}`)
        await writeFile(env, `data/${username}.json`, defaultData(), null, `Crear agenda de ${username}`)
        const token = await signToken(env, username)
        return json(env, request, { token, username: String(raw).trim() })
      }

      if (path === '/api/login' && request.method === 'POST') {
        const { username: raw, password } = await request.json()
        const username = normalizeUsername(raw)
        const usersFile = await readFile(env, 'users.json', { users: {} })
        const record = usersFile.data.users?.[username]
        if (!record || !(await verifyPassword(String(password || ''), record))) {
          return json(env, request, { error: 'Usuario o contraseña incorrectos.' }, 401)
        }
        return json(env, request, { token: await signToken(env, username), username: record.displayName || username })
      }

      const username = await authUser(env, request)
      if (!username) return json(env, request, { error: 'Sesión no válida.' }, 401)

      if (path === '/api/me' && request.method === 'GET') {
        const usersFile = await readFile(env, 'users.json', { users: {} })
        const display = usersFile.data.users?.[username]?.displayName || username
        return json(env, request, { username: display })
      }

      if (path === '/api/data' && request.method === 'GET') {
        const { data } = await userData(env, username)
        return json(env, request, data)
      }

      if (path === '/api/items' && request.method === 'POST') {
        const item = await request.json()
        const file = await userData(env, username)
        const created = { ...item, id: itemId() }
        file.data.items = [created, ...(file.data.items || [])]
        await saveUserData(env, username, file.data, file.sha)
        return json(env, request, { item: created }, 201)
      }

      const itemMatch = path.match(/^\/api\/items\/([^/]+)$/)
      if (itemMatch && request.method === 'PATCH') {
        const id = decodeURIComponent(itemMatch[1])
        const patch = await request.json()
        const file = await userData(env, username)
        const index = (file.data.items || []).findIndex(x => x.id === id)
        if (index < 0) return json(env, request, { error: 'Elemento no encontrado.' }, 404)
        file.data.items[index] = { ...file.data.items[index], ...patch, id }
        const updated = file.data.items[index]
        await saveUserData(env, username, file.data, file.sha)
        return json(env, request, { item: updated })
      }

      if (itemMatch && request.method === 'DELETE') {
        const id = decodeURIComponent(itemMatch[1])
        const file = await userData(env, username)
        file.data.items = (file.data.items || []).filter(x => x.id !== id)
        await saveUserData(env, username, file.data, file.sha)
        return new Response(null, { status: 204, headers: cors(env, request) })
      }

      const stickerMatch = path.match(/^\/api\/stickers\/([^/]+)$/)
      if (stickerMatch && request.method === 'PUT') {
        const date = decodeURIComponent(stickerMatch[1])
        const { sticker } = await request.json()
        const file = await userData(env, username)
        const existing = (file.data.stickers || []).find(x => x.date === date)
        let saved
        if (existing) {
          existing.sticker = String(sticker || '')
          saved = existing
        } else {
          saved = { id: itemId(), date, sticker: String(sticker || '') }
          file.data.stickers = [...(file.data.stickers || []), saved]
        }
        await saveUserData(env, username, file.data, file.sha)
        return json(env, request, { sticker: saved })
      }

      return json(env, request, { error: 'Ruta no encontrada.' }, 404)
    } catch (error) {
      return json(env, request, { error: 'Error del servidor.', detail: String(error?.message || error) }, 500)
    }
  },
}
