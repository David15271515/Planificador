import http from 'node:http'
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '..')
const distDir = path.join(rootDir, 'dist')
const dataDir = path.resolve(process.env.DATA_DIR || path.join(__dirname, 'data'))
const usersDir = path.join(dataDir, 'users')
const usersFile = path.join(dataDir, 'users.json')
const port = Number(process.env.PORT || 8787)
const sessionSecret = process.env.SESSION_SECRET || 'mi-plan-dev-secret-cambialo-en-produccion'
const tokenLifetimeSeconds = 60 * 60 * 24 * 180

if (!process.env.SESSION_SECRET) {
  console.warn('[Mi Plan] SESSION_SECRET no configurado. Para publicar, añade uno largo y aleatorio.')
}

const defaultSubjects = [
  { id: 'anat', name: 'Anatomía', icon: '🧠' },
  { id: 'bioq', name: 'Bioquímica', icon: '🧪' },
  { id: 'fisio', name: 'Fisiología', icon: '💗' },
  { id: 'psico', name: 'Psicosocial', icon: '👥' },
  { id: 'promo', name: 'Promoción', icon: '🌿' },
]

const userQueues = new Map()

async function ensureStorage() {
  await fs.mkdir(usersDir, { recursive: true })
  try { await fs.access(usersFile) }
  catch { await atomicWrite(usersFile, { version: 1, users: {} }) }
}

async function readJson(file, fallback) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')) }
  catch (error) {
    if (error?.code === 'ENOENT') return fallback
    throw error
  }
}

async function atomicWrite(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`
  await fs.writeFile(tmp, JSON.stringify(value, null, 2), 'utf8')
  await fs.rename(tmp, file)
}

function normalizeUsername(input) {
  return String(input || '').trim().normalize('NFKC').toLocaleLowerCase('es-ES')
}

function validUsername(username) {
  return username.length >= 2 && username.length <= 32 && /^[\p{L}\p{N}._-]+$/u.test(username)
}

function userDataFile(normalizedUsername) {
  const key = crypto.createHash('sha256').update(normalizedUsername).digest('hex').slice(0, 32)
  return path.join(usersDir, `${key}.json`)
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  return { salt, hash: crypto.scryptSync(password, salt, 64).toString('hex') }
}

function passwordMatches(password, salt, expectedHex) {
  const actual = crypto.scryptSync(password, salt, 64)
  const expected = Buffer.from(expectedHex, 'hex')
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual)
}

function signToken(username) {
  const payload = Buffer.from(JSON.stringify({ u: username, exp: Math.floor(Date.now() / 1000) + tokenLifetimeSeconds })).toString('base64url')
  const signature = crypto.createHmac('sha256', sessionSecret).update(payload).digest('base64url')
  return `${payload}.${signature}`
}

function verifyToken(token) {
  if (!token || !token.includes('.')) return null
  const [payload, signature] = token.split('.')
  const expected = crypto.createHmac('sha256', sessionSecret).update(payload).digest('base64url')
  const a = Buffer.from(signature)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null
  try {
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    if (!decoded?.u || !decoded?.exp || decoded.exp < Math.floor(Date.now() / 1000)) return null
    return decoded.u
  } catch { return null }
}

async function initialUserData() {
  return { version: 1, updatedAt: new Date().toISOString(), subjects: defaultSubjects, items: [], stickers: [] }
}

async function readUserData(username) {
  return readJson(userDataFile(username), await initialUserData())
}

function withUserWrite(username, work) {
  const previous = userQueues.get(username) || Promise.resolve()
  const next = previous.catch(() => {}).then(work)
  userQueues.set(username, next)
  next.finally(() => { if (userQueues.get(username) === next) userQueues.delete(username) })
  return next
}

async function mutateUserData(username, mutator) {
  return withUserWrite(username, async () => {
    const current = await readUserData(username)
    const next = await mutator(current)
    next.updatedAt = new Date().toISOString()
    await atomicWrite(userDataFile(username), next)
    return next
  })
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Cache-Control': 'no-store',
  }
}

function sendJson(res, status, body) {
  res.writeHead(status, { ...corsHeaders(), 'Content-Type': 'application/json; charset=utf-8' })
  res.end(body === undefined ? '' : JSON.stringify(body))
}

async function readBody(req) {
  let size = 0
  const chunks = []
  for await (const chunk of req) {
    size += chunk.length
    if (size > 256 * 1024) throw Object.assign(new Error('BODY_TOO_LARGE'), { status: 413 })
    chunks.push(chunk)
  }
  if (!chunks.length) return {}
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) }
  catch { throw Object.assign(new Error('JSON_INVALID'), { status: 400 }) }
}

async function authenticatedUser(req) {
  const header = String(req.headers.authorization || '')
  const token = header.startsWith('Bearer ') ? header.slice(7) : ''
  const username = verifyToken(token)
  if (!username) return null
  const users = await readJson(usersFile, { users: {} })
  const record = users.users?.[username]
  if (!record) return null
  return { username, displayUsername: record.displayUsername || username }
}

async function requireUser(req, res) {
  const user = await authenticatedUser(req)
  if (!user) sendJson(res, 401, { error: 'Sesión no válida o caducada.' })
  return user
}

const contentTypes = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json; charset=utf-8', '.woff2': 'font/woff2',
}

async function serveStatic(urlPath, res) {
  const decoded = decodeURIComponent(urlPath)
  const relative = decoded === '/' ? 'index.html' : decoded.replace(/^\/+/, '')
  const candidate = path.resolve(distDir, relative)
  if (!candidate.startsWith(`${distDir}${path.sep}`) && candidate !== path.join(distDir, 'index.html')) return false
  try {
    const stat = await fs.stat(candidate)
    if (stat.isFile()) {
      const data = await fs.readFile(candidate)
      res.writeHead(200, { 'Content-Type': contentTypes[path.extname(candidate)] || 'application/octet-stream' })
      res.end(data)
      return true
    }
  } catch {}

  try {
    const index = await fs.readFile(path.join(distDir, 'index.html'))
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(index)
    return true
  } catch { return false }
}

const server = http.createServer(async (req, res) => {
  try {
    const method = req.method || 'GET'
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)
    const pathname = url.pathname

    if (method === 'OPTIONS') {
      res.writeHead(204, corsHeaders())
      return res.end()
    }

    if (method === 'GET' && pathname === '/api/health') return sendJson(res, 200, { ok: true, storage: 'json' })

    if (method === 'POST' && pathname === '/api/register') {
      const body = await readBody(req)
      const displayUsername = String(body.username || '').trim().normalize('NFKC')
      const username = normalizeUsername(displayUsername)
      const password = String(body.password || '')
      if (!validUsername(username)) return sendJson(res, 400, { error: 'Usa entre 2 y 32 letras, números, punto, guion o guion bajo.' })
      if (password.length < 4) return sendJson(res, 400, { error: 'La contraseña debe tener al menos 4 caracteres.' })

      let createdRecord
      try {
        await withUserWrite('__users__', async () => {
          const users = await readJson(usersFile, { version: 1, users: {} })
          if (users.users[username]) throw Object.assign(new Error('USERNAME_EXISTS'), { code: 'USERNAME_EXISTS' })
          const { salt, hash } = hashPassword(password)
          createdRecord = { displayUsername, salt, passwordHash: hash, createdAt: new Date().toISOString() }
          users.users[username] = createdRecord
          await atomicWrite(usersFile, users)
          await atomicWrite(userDataFile(username), await initialUserData())
        })
      } catch (error) {
        if (error?.code === 'USERNAME_EXISTS') return sendJson(res, 409, { error: 'Ese nombre de usuario ya existe.' })
        throw error
      }
      return sendJson(res, 201, { token: signToken(username), username: createdRecord.displayUsername })
    }

    if (method === 'POST' && pathname === '/api/login') {
      const body = await readBody(req)
      const username = normalizeUsername(body.username)
      const password = String(body.password || '')
      const users = await readJson(usersFile, { users: {} })
      const record = users.users?.[username]
      if (!record || !passwordMatches(password, record.salt, record.passwordHash)) {
        return sendJson(res, 401, { error: 'Usuario o contraseña incorrectos.' })
      }
      return sendJson(res, 200, { token: signToken(username), username: record.displayUsername || username })
    }

    if (pathname.startsWith('/api/')) {
      const user = await requireUser(req, res)
      if (!user) return

      if (method === 'GET' && pathname === '/api/me') return sendJson(res, 200, { username: user.displayUsername })
      if (method === 'GET' && pathname === '/api/data') return sendJson(res, 200, await readUserData(user.username))

      if (method === 'POST' && pathname === '/api/items') {
        const item = await readBody(req)
        if (!item.title || !item.date || !['study', 'personal'].includes(item.item_type)) return sendJson(res, 400, { error: 'Datos de tarea incompletos.' })
        const created = { ...item, id: crypto.randomUUID(), title: String(item.title).slice(0, 160), notes: item.notes ? String(item.notes).slice(0, 1000) : null, completed: Boolean(item.completed) }
        await mutateUserData(user.username, (data) => ({ ...data, items: [created, ...(data.items || [])] }))
        return sendJson(res, 201, { item: created })
      }

      const itemMatch = pathname.match(/^\/api\/items\/([^/]+)$/)
      if (itemMatch && method === 'PATCH') {
        const id = decodeURIComponent(itemMatch[1])
        const body = await readBody(req)
        const allowed = new Set(['title', 'date', 'item_type', 'subject_id', 'subject_name', 'action', 'topic_from', 'topic_to', 'all_day', 'start_time', 'completed', 'notes'])
        const patch = Object.fromEntries(Object.entries(body).filter(([key]) => allowed.has(key)))
        let changed = null
        await mutateUserData(user.username, (data) => ({
          ...data,
          items: (data.items || []).map((item) => {
            if (item.id !== id) return item
            changed = { ...item, ...patch }
            return changed
          }),
        }))
        if (!changed) return sendJson(res, 404, { error: 'Elemento no encontrado.' })
        return sendJson(res, 200, { item: changed })
      }

      if (itemMatch && method === 'DELETE') {
        const id = decodeURIComponent(itemMatch[1])
        await mutateUserData(user.username, (data) => ({ ...data, items: (data.items || []).filter((item) => item.id !== id) }))
        res.writeHead(204, corsHeaders())
        return res.end()
      }

      const stickerMatch = pathname.match(/^\/api\/stickers\/([^/]+)$/)
      if (stickerMatch && method === 'PUT') {
        const date = decodeURIComponent(stickerMatch[1])
        const body = await readBody(req)
        const sticker = String(body.sticker || '').slice(0, 16)
        let saved
        await mutateUserData(user.username, (data) => {
          const stickers = [...(data.stickers || [])]
          const index = stickers.findIndex((entry) => entry.date === date)
          if (index >= 0) {
            saved = { ...stickers[index], sticker }
            stickers[index] = saved
          } else {
            saved = { id: crypto.randomUUID(), date, sticker }
            stickers.push(saved)
          }
          return { ...data, stickers }
        })
        return sendJson(res, 200, { sticker: saved })
      }

      if (method === 'GET' && pathname === '/api/export') {
        res.writeHead(200, { ...corsHeaders(), 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': `attachment; filename="mi-plan-${user.username}.json"` })
        return res.end(JSON.stringify(await readUserData(user.username), null, 2))
      }

      return sendJson(res, 404, { error: 'Ruta API no encontrada.' })
    }

    if (method === 'GET' || method === 'HEAD') {
      if (await serveStatic(pathname, res)) return
    }

    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end('No encontrado')
  } catch (error) {
    console.error(error)
    sendJson(res, error?.status || 500, { error: error?.status === 400 ? 'JSON no válido.' : 'Error interno del servidor.' })
  }
})

await ensureStorage()
server.listen(port, '0.0.0.0', () => {
  console.log(`[Mi Plan] http://localhost:${port}`)
  console.log(`[Mi Plan] Datos JSON: ${dataDir}`)
})
