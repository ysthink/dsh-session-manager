/**
 * Host half of the session manager bundle.
 *
 * Owns the destructive operations: it lists stored sessions through the session
 * query service, resolves each session's log directory through session
 * persistence, and moves that directory into a recycle bin beside the log
 * store (or permanently removes it, on explicit request）. The client half never
 * touches the filesystem.
 */
import { cp, mkdir, readFile, readdir, rename, rm, rmdir, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path'

export const inject = ['webServer', 'sessionQuery']

const ROUTE = '/api/dsh-session-manager'
const MAX_BODY_BYTES = 256 * 1024
const LOG_FILE = /^session(?:\.[A-Za-z0-9]+)?\.jsonl(?:\.zstd)?$/
const ID_SHAPE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/
const ENTRY_SHAPE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/
const STAT_CONCURRENCY = 4
const TRASH_DIR = '.dsh-session-trash'
const DAY_MS = 24 * 60 * 60 * 1000

export function apply(ctx, config) {
  const logger = ctx.logger
  const state = {
    lastClientSeenAt: 0,
    roots: new Set(),
    retentionDays: normalizeRetention(config?.trashRetentionDays),
  }
  const warn = (error) => {
    try {
      logger?.warn?.(error instanceof Error ? error : new Error(String(error)))
    } catch {}
  }

  const handler = (req, res) => {
    handle(ctx, req, res, warn, state).catch((error) => {
      warn(error)
      sendJson(res, 500, { ok: false, error: message(error) })
    })
  }

  ctx.effect(
    () => ctx.webServer.register({ kind: 'exact', path: ROUTE, handler }),
    'session-manager: http route',
  )
}

async function handle(ctx, req, res, warn, state) {
  if (req.method === 'OPTIONS') {
    sendJson(res, 204, undefined)
    return
  }
  if (req.headers['x-dsh-session-manager'] !== '1') {
    sendJson(res, 403, { ok: false, error: 'missing session-manager request header' })
    return
  }
  if (!isLoopback(req.socket?.remoteAddress)) {
    sendJson(res, 403, { ok: false, error: 'session manager accepts loopback requests only' })
    return
  }

  if (req.method === 'GET') {
    const target = new URL(req.url ?? ROUTE, 'http://localhost')
    const action = target.searchParams.get('action') ?? 'overview'
    if (action !== 'overview') {
      sendJson(res, 400, { ok: false, error: `unknown action "${action}"` })
      return
    }
    sendJson(res, 200, { ok: true, data: await overview(ctx, warn, state) })
    return
  }

  if (req.method !== 'POST') {
    sendJson(res, 405, { ok: false, error: 'method not allowed' })
    return
  }

  let body
  try {
    body = await readJson(req)
  } catch (error) {
    sendJson(res, 400, { ok: false, error: message(error) })
    return
  }

  if (body?.action === 'hello') {
    state.lastClientSeenAt = Date.now()
    sendJson(res, 200, { ok: true, data: { acknowledged: true } })
    return
  }

  if (body?.action === 'delete' || body?.action === 'trash') {
    const ids = normalizeIds(body.ids)
    if (ids.length === 0) {
      sendJson(res, 400, { ok: false, error: 'ids must be a non-empty array of session ids' })
      return
    }
    const results = await trashMany(ctx, ids, warn, state, body.permanent === true)
    sendJson(res, 200, { ok: true, data: summarizeTrash(results) })
    return
  }

  if (body?.action === 'delete-workspace' || body?.action === 'trash-workspace') {
    const workspaceId = body.workspaceId
    if (typeof workspaceId !== 'string' || workspaceId.length === 0) {
      sendJson(res, 400, { ok: false, error: 'workspaceId must be a non-empty string' })
      return
    }
    const snapshot = await overview(ctx, warn, state)
    const ids = snapshot.sessions
      .filter((session) => (session.workspaceId ?? 'ungrouped') === workspaceId)
      .map((session) => session.id)
    const results = await trashMany(ctx, ids, warn, state, body.permanent === true)
    sendJson(res, 200, { ok: true, data: summarizeTrash(results) })
    return
  }

  if (body?.action === 'remove-workspace') {
    const workspaceId = body.workspaceId
    if (typeof workspaceId !== 'string' || workspaceId.length === 0) {
      sendJson(res, 400, { ok: false, error: 'workspaceId must be a non-empty string' })
      return
    }
    const snapshot = await overview(ctx, warn, state)
    const group = snapshot.workspaces.find((workspace) => workspace.id === workspaceId)
    if (!group || group.registered !== true) {
      sendJson(res, 404, { ok: false, error: 'workspace not found', code: 'WORKSPACE_NOT_FOUND' })
      return
    }
    const ids = group.sessions.map((session) => session.id)
    const results = await trashMany(ctx, ids, warn, state, body.permanent === true)
    const summary = summarizeTrash(results)
    let workspaceRemoved = false
    try {
      const registry = ctx.get('workspaceRegistry')
      workspaceRemoved = (await registry?.delete?.(workspaceId)) === true
    } catch (error) {
      warn(error)
    }
    sendJson(res, 200, { ok: true, data: { ...summary, workspaceRemoved } })
    return
  }

  if (body?.action === 'set-retention') {
    const days = parseRetention(body.days)
    if (days === undefined) {
      sendJson(res, 400, { ok: false, error: 'days must be an integer between 0 and 3650' })
      return
    }
    const editor = ctx.get('configEditor')
    const entry = ctx.fiber?.entry
    if (!editor || entry === undefined) {
      sendJson(res, 501, { ok: false, error: 'configuration cannot be saved in this profile' })
      return
    }
    // Answer before the write: saving an ordinary config field restarts this
    // plugin, which would otherwise tear down the response mid-flight. The
    // client verifies the new value by re-reading the overview afterwards.
    sendJson(res, 200, { ok: true, data: { days, requested: true } })
    setTimeout(() => {
      Promise.resolve()
        .then(() => editor.edit(entry, (current) => ({ ...current, trashRetentionDays: days })))
        .catch((error) => warn(error))
    }, 10)
    return
  }

  if (body?.action === 'restore') {
    const entries = normalizeEntries(body.entries)
    if (entries.length === 0) {
      sendJson(res, 400, { ok: false, error: 'entries must be a non-empty array' })
      return
    }
    const results = []
    for (const entry of entries) results.push(await restoreOne(ctx, entry, warn))
    sendJson(res, 200, {
      ok: true,
      data: {
        requested: results.length,
        restored: results.filter((result) => result.status === 'restored').length,
        failed: results.filter((result) => result.status !== 'restored').length,
        results,
      },
    })
    return
  }

  if (body?.action === 'purge' || body?.action === 'empty-trash') {
    const all = body.action === 'empty-trash' || body.entries === undefined
    const entries = all
      ? await listAllTrash(ctx, warn, state)
      : normalizeEntries(body.entries)
    if (!all && entries.length === 0) {
      sendJson(res, 400, { ok: false, error: 'entries must be a non-empty array' })
      return
    }
    const results = []
    for (const entry of entries) results.push(await purgeOne(entry, warn))
    sendJson(res, 200, {
      ok: true,
      data: {
        requested: results.length,
        purged: results.filter((result) => result.status === 'purged').length,
        failed: results.filter((result) => result.status !== 'purged').length,
        results,
      },
    })
    return
  }

  sendJson(res, 400, { ok: false, error: 'unknown action' })
}

function summarizeTrash(results) {
  const counts = { trashed: 0, deleted: 0, live: 0, missing: 0, failed: 0, unsafe: 0, unavailable: 0, invalid: 0 }
  for (const result of results) counts[result.status] = (counts[result.status] ?? 0) + 1
  return {
    requested: results.length,
    trashed: counts.trashed,
    deleted: counts.deleted,
    skippedLive: counts.live,
    missing: counts.missing,
    failed: counts.failed + counts.unsafe + counts.unavailable + counts.invalid,
    results,
  }
}

async function overview(ctx, warn, state) {
  const records = await ctx.sessionQuery.listSessions()
  const workspaces = safeWorkspaces(ctx)
  const ids = records.map((record) => record.header?.id).filter(Boolean)

  const titles = await readTitles(ctx, ids, warn)
  const stats = await readStats(ctx, ids, state)

  const registry = ctx.get('workspaceRegistry')
  const archived = new Set(registry?.archivedSessionIds ?? [])

  const byAccount = new Map()
  for (const workspace of workspaces) {
    for (const id of workspace.sessionIds ?? []) byAccount.set(id, workspace.id)
  }
  const byPath = new Map()
  const titleByPath = new Map()
  for (const workspace of workspaces) {
    byPath.set(normalizePath(workspace.path), workspace.id)
    titleByPath.set(normalizePath(workspace.path), workspace.title || basename(workspace.path || ''))
  }

  const sessions = records.map((record) => {
    const header = record.header ?? {}
    const id = String(header.id)
    const stat = stats.get(id)
    const cwd = typeof header.cwd === 'string' ? header.cwd : null
    const workspaceId = byAccount.get(id) ?? (cwd === null ? undefined : byPath.get(normalizePath(cwd)))
    return {
      id,
      title: titles.get(id) ?? '',
      cwd,
      createdAt: typeof header.createdAt === 'number' ? header.createdAt : null,
      parentSessionId: typeof header.parentSession === 'string' ? header.parentSession : null,
      live: record.live === true,
      persisted: record.persisted === true,
      archived: archived.has(id),
      workspaceId: workspaceId ?? null,
      sizeBytes: stat?.sizeBytes ?? 0,
      hasLog: stat?.path !== undefined,
    }
  })

  const groups = new Map()
  for (const workspace of workspaces) {
    groups.set(workspace.id, {
      id: workspace.id,
      title: workspace.title || basename(workspace.path || '') || 'Workspace',
      path: workspace.path ?? '',
      registered: true,
      sessions: [],
    })
  }
  for (const session of sessions) {
    const key = session.workspaceId ?? 'ungrouped'
    if (!groups.has(key)) {
      groups.set(key, {
        id: key,
        title: key === 'ungrouped' ? '未归入工作区' : key,
        path: '',
        registered: false,
        sessions: [],
      })
    }
    groups.get(key).sessions.push(session)
  }
  for (const group of groups.values()) {
    group.sessions.sort((left, right) => (right.createdAt ?? 0) - (left.createdAt ?? 0))
    group.sessionCount = group.sessions.length
    group.totalBytes = group.sessions.reduce((sum, session) => sum + (session.sizeBytes ?? 0), 0)
    group.liveCount = group.sessions.filter((session) => session.live).length
  }

  const ordered = [...groups.values()].sort((left, right) => {
    if (left.id === 'ungrouped') return 1
    if (right.id === 'ungrouped') return -1
    return 0
  })

  let autoPurged = 0
  if ((state?.retentionDays ?? 0) > 0) {
    const cutoff = Date.now() - state.retentionDays * DAY_MS
    for (const entry of await listTrashEntries(state, warn)) {
      if (entry.deletedAt > 0 && entry.deletedAt < cutoff) {
        const result = await purgeOne(entry, warn)
        if (result.status === 'purged') autoPurged += 1
      }
    }
  }

  const trash = await listTrashEntries(state, warn)
  const trashTitles = await readTitles(ctx, trash.map((entry) => entry.sessionId).filter(Boolean), warn)
  for (const entry of trash) {
    if (!entry.title) entry.title = trashTitles.get(entry.sessionId) ?? ''
    entry.workspaceName = entry.cwd
      ? (titleByPath.get(normalizePath(entry.cwd)) ?? basename(entry.cwd))
      : ''
  }

  return {
    generatedAt: Date.now(),
    sessions,
    workspaces: ordered,
    trash,
    retention: {
      days: state?.retentionDays ?? 0,
      autoPurged,
    },
    diagnostics: {
      clientBundle: clientBundle(ctx),
      clientLastSeenAt: state?.lastClientSeenAt ?? null,
    },
    totals: {
      sessions: sessions.length,
      liveSessions: sessions.filter((session) => session.live).length,
      bytes: sessions.reduce((sum, session) => sum + (session.sizeBytes ?? 0), 0),
      workspaces: ordered.filter((group) => group.id !== 'ungrouped').length,
      trash: trash.length,
      trashBytes: trash.reduce((sum, entry) => sum + (entry.sizeBytes ?? 0), 0),
    },
  }
}

function normalizeRetention(value) {
  const days = Number(value)
  if (!Number.isFinite(days) || days <= 0) return 0
  return Math.min(3650, Math.max(1, Math.round(days)))
}

function parseRetention(value) {
  const days = Number(value)
  if (!Number.isFinite(days) || days < 0 || days > 3650) return undefined
  return Math.round(days)
}

function clientBundle(ctx) {
  try {
    const modules = ctx.get('clientModules')
    const path = modules?.clientPath?.('@local/session-manager')
    return typeof path === 'string' ? path : null
  } catch {
    return null
  }
}

function safeWorkspaces(ctx) {
  try {
    const registry = ctx.get('workspaceRegistry')
    const list = registry?.list?.() ?? []
    return list.map((workspace) => ({
      id: workspace.id,
      title: workspace.title,
      path: workspace.path,
      sessionIds: [...(workspace.sessionIds ?? [])],
    }))
  } catch {
    return []
  }
}

async function readTitles(ctx, ids, warn) {
  const titles = new Map()
  if (ids.length === 0) return titles
  try {
    const results = await ctx.sessionQuery.readTitleSnapshots(ids)
    for (const result of results ?? []) {
      if (!result || result.status === 'rejected') continue
      const value = result.value ?? result
      const id = value?.session?.id ?? value?.sessionId ?? result.sessionId
      const title = extractTitle(result) || extractTitle(value)
      if (typeof id === 'string' && title) titles.set(id, title)
    }
  } catch (error) {
    warn(error)
  }
  return titles
}

function extractTitle(value) {
  if (!value || typeof value !== 'object') return ''
  if (typeof value.title === 'string' && value.title.trim() !== '') return value.title
  const nested = value.value
  if (nested && typeof nested === 'object') {
    if (typeof nested.title === 'string' && nested.title.trim() !== '') return nested.title
  }
  return ''
}

async function readStats(ctx, ids, state) {
  const stats = new Map()
  const persistence = ctx.get('sessionPersistence')
  if (!persistence) return stats
  await pool(ids, STAT_CONCURRENCY, async (id) => {
    try {
      const snapshot = await persistence.stat(id)
      if (!snapshot) return
      const path = snapshot.location?.path ?? null
      if (typeof path === 'string') {
        const root = rootOf(path)
        if (root !== undefined) state?.roots?.add(root)
      }
      stats.set(id, {
        sizeBytes: Number(snapshot.sizeBytes ?? 0) || 0,
        path: path ?? undefined,
      })
    } catch {}
  })
  return stats
}

function rootOf(logPath) {
  const sessionDir = dirname(logPath)
  const projectDir = dirname(sessionDir)
  const root = dirname(projectDir)
  if (!isInside(root, sessionDir)) return undefined
  return root
}

function candidateRoots(state) {
  const roots = new Set(state?.roots ?? [])
  const home = process.env.DSH_HOME
  if (typeof home === 'string' && home.length > 0) roots.add(join(home, 'sessions'))
  return [...roots]
}

function trashRoot(root) {
  return join(root, TRASH_DIR)
}

async function listAllTrash(ctx, warn, state) {
  try {
    const records = await ctx.sessionQuery.listSessions()
    const ids = records.map((record) => record.header?.id).filter(Boolean)
    await readStats(ctx, ids, state)
  } catch (error) {
    warn(error)
  }
  return await listTrashEntries(state, warn)
}

async function listTrashEntries(state, warn) {
  const entries = []
  for (const root of candidateRoots(state)) {
    const directory = trashRoot(root)
    let names
    try {
      names = await readdir(directory)
    } catch {
      continue
    }
    for (const name of names) {
      if (!ENTRY_SHAPE.test(name)) continue
      const entryDir = join(directory, name)
      try {
        if (!(await stat(entryDir)).isDirectory()) continue
        const manifest = JSON.parse(await readFile(join(entryDir, 'manifest.json'), 'utf8'))
        if (!manifest || typeof manifest.sessionId !== 'string') continue
        if (!(await stat(join(entryDir, 'log')).then((value) => value.isDirectory(), () => false))) continue
        entries.push({
          entryId: name,
          root,
          sessionId: manifest.sessionId,
          title: typeof manifest.title === 'string' ? manifest.title : '',
          cwd: typeof manifest.cwd === 'string' ? manifest.cwd : null,
          deletedAt: typeof manifest.deletedAt === 'number' ? manifest.deletedAt : 0,
          sizeBytes: Number(manifest.sizeBytes ?? 0) || 0,
        })
      } catch (error) {
        warn?.(error)
      }
    }
  }
  entries.sort((left, right) => (right.deletedAt ?? 0) - (left.deletedAt ?? 0))
  return entries
}

async function trashMany(ctx, ids, warn, state, permanent = false) {
  const titles = await readTitles(ctx, ids, warn)
  const results = []
  for (const id of ids) {
    try {
      results.push(await trashOne(ctx, id, titles.get(id) ?? '', warn, state, permanent))
    } catch (error) {
      warn(error)
      results.push({ id, status: 'failed', error: message(error) })
    }
  }
  return results
}

async function trashOne(ctx, id, title, warn, state, permanent = false) {
  if (typeof id !== 'string' || !ID_SHAPE.test(id)) return { id, status: 'invalid' }

  const agents = ctx.get('agents')
  const session = agents?.get?.(id) ?? ctx.get('sessions')?.get?.(id)
  if (session !== undefined) return { id, status: 'live' }

  const persistence = ctx.get('sessionPersistence')
  if (!persistence) return { id, status: 'unavailable' }

  let snapshot
  try {
    snapshot = await persistence.stat(id)
  } catch (error) {
    warn(error)
    return { id, status: 'failed', error: message(error) }
  }
  if (!snapshot) return { id, status: 'missing' }

  const logPath = snapshot.location?.path
  if (typeof logPath !== 'string') return { id, status: 'missing' }

  const directory = dirname(logPath)
  if (!LOG_FILE.test(basename(logPath))) {
    return { id, status: 'unsafe', error: `unexpected log file name: ${basename(logPath)}` }
  }
  let entries
  try {
    entries = await readdir(directory)
  } catch (error) {
    if (error?.code === 'ENOENT') return { id, status: 'missing' }
    throw error
  }
  if (!entries.some((entry) => LOG_FILE.test(entry))) {
    return { id, status: 'unsafe', error: 'directory holds no session log' }
  }

  const root = rootOf(logPath)
  if (root === undefined || !isInside(root, directory)) {
    return { id, status: 'unsafe', error: 'session directory is outside the log store' }
  }
  state?.roots?.add(root)

  await detach(ctx, id, warn)

  if (permanent) {
    await rm(directory, { recursive: true, force: true })
    await removeEmptyProject(dirname(directory))
    return {
      id,
      status: 'deleted',
      sizeBytes: Number(snapshot.sizeBytes ?? 0) || 0,
    }
  }

  const deletedAt = Date.now()
  const entryDir = await allocateTrashEntry(root, deletedAt, id)
  const manifest = {
    version: 1,
    sessionId: id,
    title,
    cwd: typeof snapshot.header?.cwd === 'string' ? snapshot.header.cwd : null,
    deletedAt,
    sizeBytes: Number(snapshot.sizeBytes ?? 0) || 0,
    sessionDir: directory,
    projectDir: dirname(directory),
    root,
  }

  try {
    await writeFile(join(entryDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8')
    await moveDirectory(directory, join(entryDir, 'log'))
  } catch (error) {
    await rm(entryDir, { recursive: true, force: true }).catch(() => {})
    warn(error)
    return { id, status: 'failed', error: message(error) }
  }

  await removeEmptyProject(dirname(directory))

  return {
    id,
    status: 'trashed',
    entryId: basename(entryDir),
    root,
    sizeBytes: manifest.sizeBytes,
  }
}

async function removeEmptyProject(projectDirectory) {
  try {
    const remaining = await readdir(projectDirectory)
    if (remaining.length === 0) await rmdir(projectDirectory)
  } catch {}
}

async function allocateTrashEntry(root, deletedAt, id) {
  const directory = trashRoot(root)
  await mkdir(directory, { recursive: true })
  const safe = id.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 80)
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const suffix = Math.random().toString(16).slice(2, 6)
    const name = `${deletedAt}-${safe}-${suffix}`
    const entryDir = join(directory, name)
    try {
      await mkdir(entryDir)
      return entryDir
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error
    }
  }
  throw new Error('could not allocate a recycle-bin entry')
}

async function restoreOne(ctx, entry, warn) {
  const located = await locateEntry(entry, warn)
  if (located === undefined) return { entryId: entry?.entryId, status: 'missing' }
  const { entryDir, manifest } = located

  if (typeof manifest.sessionDir !== 'string' || !isAbsolute(manifest.sessionDir)) {
    return { entryId: entry.entryId, status: 'unsafe', error: 'manifest holds no absolute session directory' }
  }
  const root = typeof manifest.root === 'string' ? manifest.root : entry.root
  if (!isInside(root, manifest.sessionDir)) {
    return { entryId: entry.entryId, status: 'unsafe', error: 'session directory is outside its log store' }
  }
  const target = manifest.sessionDir
  const exists = await stat(target).then(() => true, () => false)
  if (exists) return { entryId: entry.entryId, sessionId: manifest.sessionId, status: 'conflict' }

  try {
    await mkdir(dirname(target), { recursive: true })
    await moveDirectory(join(entryDir, 'log'), target)
    await rm(entryDir, { recursive: true, force: true })
  } catch (error) {
    warn(error)
    return { entryId: entry.entryId, sessionId: manifest.sessionId, status: 'failed', error: message(error) }
  }

  await reattach(ctx, manifest.sessionId, warn)
  return { entryId: entry.entryId, sessionId: manifest.sessionId, status: 'restored' }
}

async function purgeOne(entry, warn) {
  const located = await locateEntry(entry, warn)
  if (located === undefined) return { entryId: entry?.entryId, status: 'missing' }
  try {
    await rm(located.entryDir, { recursive: true, force: true })
    return { entryId: entry.entryId, sessionId: located.manifest.sessionId, status: 'purged' }
  } catch (error) {
    warn(error)
    return { entryId: entry.entryId, status: 'failed', error: message(error) }
  }
}

async function locateEntry(entry, warn) {
  if (!entry || typeof entry.entryId !== 'string' || !ENTRY_SHAPE.test(entry.entryId)) return undefined
  if (typeof entry.root !== 'string' || !isAbsolute(entry.root)) return undefined
  const entryDir = join(trashRoot(entry.root), entry.entryId)
  if (dirname(entryDir) !== trashRoot(entry.root)) return undefined
  try {
    if (!(await stat(entryDir)).isDirectory()) return undefined
    const manifest = JSON.parse(await readFile(join(entryDir, 'manifest.json'), 'utf8'))
    return { entryDir, manifest: manifest ?? {} }
  } catch (error) {
    warn?.(error)
    return undefined
  }
}

async function reattach(ctx, id, warn) {
  if (typeof id !== 'string') return
  const registry = ctx.get('workspaceRegistry')
  const persistence = ctx.get('sessionPersistence')
  if (!registry || !persistence) return
  try {
    const snapshot = await persistence.stat(id)
    const cwd = snapshot?.header?.cwd
    if (typeof cwd !== 'string') return
    for (const workspace of registry.list?.() ?? []) {
      if (normalizePath(workspace.path) === normalizePath(cwd)) {
        await workspace.attachSession(id)
        return
      }
    }
  } catch (error) {
    warn?.(error)
  }
}

async function detach(ctx, id, warn) {
  const registry = ctx.get('workspaceRegistry')
  if (!registry) return
  try {
    for (const workspace of registry.list?.() ?? []) {
      if ((workspace.sessionIds ?? []).includes(id)) await workspace.detachSession(id)
    }
  } catch (error) {
    warn(error)
  }
  try {
    await registry.unarchiveSession?.(id)
  } catch (error) {
    warn(error)
  }
}

function normalizeIds(value) {
  if (!Array.isArray(value)) return []
  const seen = new Set()
  const ids = []
  for (const item of value) {
    if (typeof item !== 'string' || item.length === 0 || seen.has(item)) continue
    seen.add(item)
    ids.push(item)
  }
  return ids
}

function normalizeEntries(value) {
  if (!Array.isArray(value)) return []
  const seen = new Set()
  const entries = []
  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    if (typeof item.entryId !== 'string' || typeof item.root !== 'string') continue
    const key = `${item.root}\u0000${item.entryId}`
    if (seen.has(key)) continue
    seen.add(key)
    entries.push({ entryId: item.entryId, root: item.root })
  }
  return entries
}

async function readJson(req) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > MAX_BODY_BYTES) throw new Error('request body too large')
    chunks.push(chunk)
  }
  if (size === 0) return {}
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    throw new Error('request body is not valid JSON')
  }
}

function sendJson(res, status, payload) {
  if (res.headersSent) {
    res.end()
    return
  }
  if (payload === undefined) {
    res.writeHead(status, { 'cache-control': 'no-store' })
    res.end()
    return
  }
  const body = JSON.stringify(payload)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
  })
  res.end(body)
}

function isLoopback(address) {
  if (typeof address !== 'string') return false
  return address === '::1' || address === '::ffff:127.0.0.1' || address.startsWith('127.')
}

function normalizePath(value) {
  if (typeof value !== 'string') return ''
  return value.replace(/[\\/]+$/, '').toLowerCase()
}

function isInside(root, target) {
  if (typeof root !== 'string' || typeof target !== 'string') return false
  const from = resolve(root)
  const to = resolve(target)
  const relativePath = relative(from, to)
  return relativePath !== '' && !relativePath.startsWith('..') && !isAbsolute(relativePath)
}

async function moveDirectory(source, target) {
  try {
    await rename(source, target)
  } catch (error) {
    if (error?.code !== 'EXDEV') throw error
    await cp(source, target, { recursive: true, preserveTimestamps: true })
    await rm(source, { recursive: true, force: true })
  }
}

function message(error) {
  return error instanceof Error ? error.message : String(error)
}

async function pool(items, limit, run) {
  let index = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const at = index
      index += 1
      if (at >= items.length) return
      await run(items[at])
    }
  })
  await Promise.all(workers)
}
