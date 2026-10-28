// Client-half behavioral test for dsh-sound (run with: node tools/test-client.mjs)
// Models the DSH 0.2.1 client event surface:
//   - ctx.sessions.list (running / retainedBy / projectionValues / subagent rows)
//   - ctx.uiSession.sessionStatus (pendingInteraction: approval | question | plan-review)
//   - ctx.sessions.binding(id).eventSource (live turn/end reason)
//   - ctx.remote.$on('api-session/error')
// Audio is observed through a fake AudioContext (oscillator frequency capture);
// the settings UI is rendered through a minimal fake React.
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')

let failures = 0
const ok = (cond, label) => {
  if (cond) console.log('PASS', label)
  else { failures++; console.log('FAIL', label) }
}

// builtin first-fundamental frequencies (ding/chime/bell/complete/success)
const FREQ = { ding: 698.46, chime: 880, bell: 493.88, complete: 523.25, success: 783.99 }

/** One SessionBinding.eventSource double: snapshot + change delta, like MutableSessionEventSource. */
function createEventSource() {
  let snapshot = { entries: [], hasMore: false, revision: 0, change: { kind: 'replace', entries: [] } }
  const listeners = new Set()
  const notify = () => { for (const listener of [...listeners]) listener() }
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener) => { listeners.add(listener); return () => listeners.delete(listener) },
    append(event) {
      const entry = { type: 'event', event }
      snapshot = {
        entries: [...snapshot.entries, entry],
        hasMore: snapshot.hasMore,
        revision: snapshot.revision + 1,
        change: { kind: 'append', entries: [entry] },
      }
      notify()
    },
    load(events, kind) {
      const entries = events.map((event) => ({ type: 'event', event }))
      snapshot = { entries, hasMore: false, revision: snapshot.revision + 1, change: { kind: kind || 'replace', entries } }
      notify()
    },
  }
}

const turnEnd = (seq, reason) => ({ type: 'turn/end', seq, time: seq, data: { turn: 1, reason } })
const completed = { kind: 'completed' }
const failed = { kind: 'error', error: { message: 'boom', code: 'UNKNOWN' } }
const stoppedByUser = { kind: 'aborted', reason: { kind: 'user' } }

function makeEnv(seededConfig, options) {
  options = options || {}
  const registered = {}
  let oscCount = 0
  let decodedCount = 0
  const freqs = []
  const gains = []
  const audioPlays = []
  const bufferPlays = []
  const xhrUrls = []
  const timers = []
  const storage = new Map()
  storage.set('dsh-sound:config', JSON.stringify(seededConfig || {}))
  let timerSeq = 0
  const bcInstances = new Map()
  const fakeWindow = {
    __ModuleLoader__: { load: (entry) => { registered[entry.id] = entry } },
    localStorage: {
      getItem: (k) => (storage.has(k) ? storage.get(k) : null),
      setItem: (k, v) => { storage.set(k, v) },
    },
    setTimeout: (fn, ms) => {
      const t = { id: ++timerSeq, fn, ms: typeof ms === 'number' ? ms : 0, cleared: false, fired: false }
      timers.push(t)
      return t.id
    },
    clearTimeout: (id) => { const t = timers.find((x) => x.id === id); if (t) t.cleared = true },
    BroadcastChannel: options.withBroadcast ? class {
      constructor(name) {
        this.name = name
        if (!bcInstances.has(name)) bcInstances.set(name, [])
        bcInstances.get(name).push(this)
      }
      postMessage(data) {
        const list = bcInstances.get(this.name) || []
        for (const other of list) {
          if (other !== this && typeof other.onmessage === 'function') other.onmessage({ data })
        }
      }
    } : undefined,
    AudioContext: options.noAudioContext ? undefined : class {
      constructor() { this.state = 'running'; this.currentTime = 0; this.destination = {} }
      resume() { return Promise.resolve() }
      decodeAudioData(buf, okFn, errFn) { decodedCount++; okFn({ duration: 1 }) }
      createBufferSource() {
        return { buffer: null, connect() {}, start() { bufferPlays.push(this.buffer) } }
      }
      createOscillator() {
        oscCount++
        return {
          type: 'sine',
          frequency: {
            setValueAtTime: (f) => { freqs.push(f) },
            exponentialRampToValueAtTime() {},
          },
          connect() {}, start() {}, stop() {},
        }
      }
      createGain() {
        return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime: (v) => { gains.push(v) } }, connect() {} }
      }
    },
    XMLHttpRequest: class {
      open(method, url) { this.url = url }
      send() {
        xhrUrls.push(this.url)
        this.status = 200
        this.response = new ArrayBuffer(8)
        if (this.onload) this.onload()
      }
    },
    Audio: class {
      constructor(url) { this.url = url }
      play() { audioPlays.push(this.url); return Promise.resolve() }
    },
    FileReader: class {},
  }

  const created = []
  const hookState = []
  let hookCursor = 0
  const react = {
    createElement: (type, props, ...children) => {
      const node = { type, props: props || {}, children }
      created.push(node)
      if (typeof type === 'function') return type(Object.assign({}, props, { children }))
      return node
    },
    useState: (v) => {
      const i = hookCursor++
      if (hookState[i] === undefined) hookState[i] = typeof v === 'function' ? v() : v
      return [hookState[i], (nv) => { hookState[i] = typeof nv === 'function' ? nv(hookState[i]) : nv }]
    },
    useEffect: () => {},
    useRef: () => ({ current: null }),
  }

  const factoryFn = new Function('window', source + '\n')
  factoryFn(fakeWindow)
  const entry = registered['@ai-galaxy/dsh-sound']
  if (!entry) throw new Error('client bundle must register under the package name (@ai-galaxy/dsh-sound)')
  const exportsObj = entry.factory((spec) => (spec === 'react' ? react : undefined))

  // ---- sessions.list double ----
  const row = (extra) => Object.assign(
    { running: false, retainedBy: { mainView: 1 }, blank: false, updatedAt: 0 },
    extra,
  )
  let listSnap = {
    ids: ['s1'],
    byId: { s1: row({ id: 's1' }) },
    phase: 'ready',
    projectionsBySession: {},
  }
  const listSubs = new Set()
  const notifyList = () => { for (const fn of [...listSubs]) fn() }

  // ---- uiSession.sessionStatus double (Map, like 0.2.x) ----
  const statusMap = new Map([
    ['s1', { running: false, pendingInteraction: undefined, completionUnread: false }],
  ])
  const statusSubs = new Set()
  const notifyStatus = () => { for (const fn of [...statusSubs]) fn() }

  // ---- retained bindings + live event windows ----
  const bindings = new Map()

  // ---- forwarded Remote events ----
  const remoteListeners = new Map()
  const uiSession = {
    sessionStatus: {
      getSnapshot: () => statusMap,
      subscribe: (fn) => { statusSubs.add(fn); return () => statusSubs.delete(fn) },
    },
  }
  const remote = {
    $on: (event, fn) => {
      if (!remoteListeners.has(event)) remoteListeners.set(event, [])
      remoteListeners.get(event).push(fn)
      return () => {
        const list = remoteListeners.get(event) || []
        const index = list.indexOf(fn)
        if (index >= 0) list.splice(index, 1)
      }
    },
  }

  let activeLocale = 'zh'
  const languages = new Map([['zh', { id: 'zh' }], ['en', { id: 'en' }]].concat((seededConfig && seededConfig._localeLanguages) || []))
  const dictionaries = new Map()
  const locale = {
    addLanguage(language) {
      if (languages.has(language.id)) throw new Error('duplicate language: ' + language.id)
      languages.set(language.id, language)
      return () => languages.delete(language.id)
    },
    register(namespace, language, dictionary) {
      dictionaries.set(namespace + '/' + language, dictionary)
      return () => dictionaries.delete(namespace + '/' + language)
    },
    bind(namespace) {
      return (key) => {
        const current = dictionaries.get(namespace + '/' + activeLocale)
        const fallback = dictionaries.get(namespace + '/en')
        return (current && current[key]) || (fallback && fallback[key]) || key
      }
    },
    getLocale: () => ({ locales: Array.from(languages.values()) }),
    getSnapshot: () => ({ active: activeLocale, revision: 0 }),
    subscribe: () => () => {},
  }

  const effectDisposers = []
  const ctx = {
    locale,
    sessions: {
      list: {
        getSnapshot: () => listSnap,
        subscribe: (fn) => { listSubs.add(fn); return () => listSubs.delete(fn) },
      },
      binding: (id) => bindings.get(id),
    },
    inject: (deps, cb) => {
      const sctx = Object.assign({}, ctx)
      for (const dep of deps) {
        if (dep === 'uiSession' && !options.withoutUiSession) sctx.uiSession = uiSession
        else if (dep === 'remote' && !options.withoutRemote) sctx.remote = remote
        else return
      }
      cb(sctx)
    },
    effect: (fn) => { effectDisposers.push(fn()) },
    slots: {
      inject: (name, cb) => { slotReg = { name, registration: cb() } },
      register: (opts, comp) => ({ opts, comp }),
    },
  }
  let slotReg = null

  const renderSection = (preserveHooks) => {
    created.length = 0
    hookCursor = 0
    if (!preserveHooks) hookState.length = 0
    const Section = slotReg && slotReg.registration && slotReg.registration.comp
    if (Section) Section({})
  }

  return {
    exportsObj,
    ctx,
    row,
    // list helpers
    setList(rows) {
      const ids = Array.isArray(rows) ? rows.map((r) => r.id) : Object.keys(rows)
      const byId = Array.isArray(rows) ? Object.fromEntries(rows.map((r) => [r.id, r])) : rows
      listSnap = { ids, byId, phase: 'ready', projectionsBySession: {} }
      notifyList()
    },
    setRunning(id, running) {
      const byId = Object.assign({}, listSnap.byId)
      byId[id] = Object.assign({}, byId[id] || row({ id }), { running })
      listSnap = Object.assign({}, listSnap, { byId })
      notifyList()
    },
    setRetained(id, mainView) {
      const byId = Object.assign({}, listSnap.byId)
      byId[id] = Object.assign({}, byId[id] || row({ id }), { retainedBy: { mainView } })
      listSnap = Object.assign({}, listSnap, { byId })
      notifyList()
    },
    // binding helpers
    bind(id, history, kind) {
      const eventSource = createEventSource()
      if (history) eventSource.load(history, kind)
      bindings.set(id, { sessionId: id, eventSource })
      // Retention updates the list row (retainedBy), exactly like the real controller.
      notifyList()
      return eventSource
    },
    unbind(id) {
      bindings.delete(id)
      notifyList()
    },
    appendTurnEnd(id, seq, reason) {
      bindings.get(id).eventSource.append(turnEnd(seq, reason))
    },
    loadHistory(id, events, kind) {
      bindings.get(id).eventSource.load(events, kind)
    },
    // interaction helpers
    pending(id, kind, key, extra) {
      statusMap.set(id, { running: false, completionUnread: false, pendingInteraction: Object.assign({ key, kind, sessionId: id }, extra) })
      notifyStatus()
    },
    resolved(id) {
      statusMap.set(id, { running: false, completionUnread: false, pendingInteraction: undefined })
      notifyStatus()
    },
    emitRemote(event, ...args) {
      for (const fn of [...(remoteListeners.get(event) || [])]) fn(...args)
    },
    remoteEvents: () => [...remoteListeners.keys()],
    // observation
    getOscCount: () => oscCount,
    getDecodedCount: () => decodedCount,
    freqs,
    gains,
    audioPlays,
    bufferPlays,
    xhrUrls,
    getEffectDisposers: () => effectDisposers,
    dispose: () => { for (const d of effectDisposers) if (typeof d === 'function') d() },
    getSlotReg: () => slotReg,
    setLocale: (id) => { activeLocale = id },
    languages,
    dictionaries,
    storage,
    created,
    renderUI: () => renderSection(false),
    rerenderUI: () => renderSection(true),
    timers,
    fireTimers: () => timers.forEach((t) => { if (!t.cleared && !t.fired) { t.fired = true; t.fn() } }),
    fireTimersMs: (ms) => timers.forEach((t) => {
      if (!t.cleared && !t.fired && t.ms === ms) { t.fired = true; t.fn() }
    }),
    pendingTimersMs: (ms) => timers.filter((t) => !t.cleared && !t.fired && t.ms === ms),
    getBroadcastClass: () => fakeWindow.BroadcastChannel,
    countOf: (pred) => created.filter(pred).length,
    statusMap,
  }
}

// =====================================================================================
// 1. bundle contract: exports, inject list, settings slot, disposer
// =====================================================================================
{
  const env = makeEnv(undefined)
  ok(typeof env.exportsObj.apply === 'function', 'client exports apply')
  ok(Array.isArray(env.exportsObj.inject) && env.exportsObj.inject.includes('sessions'), 'client inject includes sessions')
  ok(!env.exportsObj.inject.includes('connection'), 'client no longer waits on the removed connection event API')
  ok(env.exportsObj.inject.includes('locale') && env.exportsObj.inject.includes('slots'), 'client inject includes locale and slots')
  env.exportsObj.apply(env.ctx)
  const slotReg = env.getSlotReg()
  ok(slotReg && slotReg.name === 'settings.section', 'registered into settings.section slot')
  ok(slotReg.registration.opts.id === 'dsh-sound', 'section id dsh-sound')
  ok(typeof slotReg.registration.opts.label === 'function' && typeof slotReg.registration.opts.label() === 'string', 'section label thunk')
  ok(env.getEffectDisposers().some((d) => typeof d === 'function'), 'detection disposer registered')
  ok(env.remoteEvents().indexOf('user-questions/request') < 0 && env.remoteEvents().indexOf('approval/request') < 0,
    'does not subscribe to the answerer waterflows (registration order would starve a late listener)')
  ok(env.remoteEvents().includes('api-session/error'), 'subscribes to api-session/error for turn-less agent failures')
}

// =====================================================================================
// 2. issue 1 — ask_user_question now rings
// =====================================================================================
{
  const env = makeEnv(undefined)
  env.exportsObj.apply(env.ctx)
  ok(env.getOscCount() === 0, 'startup publishes no sound')

  env.pending('s1', 'question', 'question:s1:call-1')
  ok(env.freqs.includes(FREQ.ding), 'new question pendingInteraction plays questionSound (ding)')

  let before = env.freqs.length
  env.pending('s1', 'question', 'question:s1:call-1') // same request re-published (reconnect replay)
  ok(env.freqs.length === before, 'same pending request key does not ring twice (reconnect / re-render replay)')

  env.resolved('s1')
  before = env.freqs.length
  env.pending('s1', 'question', 'question:s1:call-2')
  ok(env.freqs.length > before, 'next question (new call id) rings again')
}
{
  const env = makeEnv({ questionSound: 'success', planReviewSound: 'complete', approvalSound: 'bell' })
  env.exportsObj.apply(env.ctx)
  env.pending('s1', 'question', 'q1')
  ok(env.freqs.includes(FREQ.success), 'questionSound override honoured')
  env.resolved('s1')
  env.pending('s1', 'plan-review', 'q2')
  ok(env.freqs.includes(FREQ.complete), 'plan-review pending plays planReviewSound')
  env.resolved('s1')
  env.pending('s1', 'approval', 'a1')
  ok(env.freqs.includes(FREQ.bell), 'approval pending plays approvalSound')
}
{
  const env = makeEnv(undefined)
  env.exportsObj.apply(env.ctx)
  env.pending('s1', 'custom-kind', 'x1')
  ok(env.freqs.includes(FREQ.ding), 'unknown pending kind falls back to the question sound')
}
{
  // reload while a question is already open: baseline, no replay sound
  const env = makeEnv(undefined)
  env.statusMap.set('s1', { running: false, pendingInteraction: { key: 'q1', kind: 'question', sessionId: 's1' } })
  env.exportsObj.apply(env.ctx)
  ok(env.getOscCount() === 0, 'question already pending at page load does not replay a sound')
  env.pending('s1', 'question', 'q2')
  ok(env.freqs.includes(FREQ.ding), 'a later question still rings after the baseline')
}
{
  // attention events ignore quietCurrent (completion-only switch)
  const env = makeEnv({ quietCurrent: true })
  env.exportsObj.apply(env.ctx)
  env.pending('s1', 'question', 'q1')
  ok(env.freqs.includes(FREQ.ding), 'question rings even while its session is the current view')
}
{
  // opening the read-only review of a settled question is not a new request
  const env = makeEnv(undefined)
  env.exportsObj.apply(env.ctx)
  env.pending('s1', 'question', 'question:s1:call-9', { review: { answers: [] } })
  ok(env.getOscCount() === 0, 'read-only review card of a settled question stays silent')
  env.resolved('s1')
  env.pending('s1', 'question', 'question:s1:call-10')
  ok(env.freqs.includes(FREQ.ding), 'a live question after closing the review still rings')
}
{
  // subagent channel
  const env = makeEnv({ subagentQuestionSound: 'success' })
  env.exportsObj.apply(env.ctx)
  env.setList([env.row({ id: 's1', origin: 'subagent' })])
  env.pending('s1', 'question', 'q1')
  ok(env.freqs.includes(FREQ.success), 'subagent question uses the subagent channel')
}
{
  // enabled=false silences attention events too
  const env = makeEnv({ enabled: false })
  env.exportsObj.apply(env.ctx)
  env.pending('s1', 'question', 'q1')
  ok(env.getOscCount() === 0, 'enabled=false silences question sounds')
}

// =====================================================================================
// 3. issue 2 — user stop is silent, real failures and unexpected stops still ring
// =====================================================================================
{
  // stop of the retained (watched) session: no failure sound
  const env = makeEnv(undefined)
  env.exportsObj.apply(env.ctx)
  env.bind('s1')
  env.setRunning('s1', true)
  env.appendTurnEnd('s1', 1, stoppedByUser)
  ok(env.getOscCount() === 0, 'user-stopped turn is silent by default (no failure sound)')

  env.setRunning('s1', false)
  ok(env.getOscCount() === 0, 'the following running=false update does not add a completion sound')
  ok(env.pendingTimersMs(500).length === 0, 'no settle timer is left behind after a classified stop')
}
{
  // stop can be given its own sound
  const env = makeEnv({ stoppedSound: 'success', stoppedVolume: 0.5 })
  env.exportsObj.apply(env.ctx)
  env.bind('s1')
  env.setRunning('s1', true)
  env.appendTurnEnd('s1', 1, stoppedByUser)
  ok(env.freqs.includes(FREQ.success), 'stoppedSound is separately configurable')
}
{
  // real failure keeps the failure sound
  const env = makeEnv(undefined)
  env.exportsObj.apply(env.ctx)
  env.bind('s1')
  env.setRunning('s1', true)
  env.appendTurnEnd('s1', 1, failed)
  ok(env.freqs.includes(FREQ.bell), 'turn/end error plays the failure sound (bell)')
  const after = env.getOscCount()
  env.setRunning('s1', false)
  ok(env.getOscCount() === after, 'running=false does not replay the failure sound')
}
{
  // unexpected interruptions stay failures: hook cancellation and crash closer
  const env = makeEnv(undefined)
  env.exportsObj.apply(env.ctx)
  env.bind('s1')
  env.setRunning('s1', true)
  env.appendTurnEnd('s1', 1, { kind: 'aborted', reason: { kind: 'hook', reason: 'deepseek-account/signed-out' } })
  ok(env.freqs.includes(FREQ.bell), 'aborted(hook) — e.g. signed-out — plays the failure sound')
  env.appendTurnEnd('s1', 2, { kind: 'interrupted' })
  ok(env.freqs.filter((f) => f === FREQ.bell).length >= 2, 'interrupted (process exited mid-turn) plays the failure sound')
}
{
  // expected cancellations other than a user stop stay silent
  const env = makeEnv({ stoppedSound: 'none' })
  env.exportsObj.apply(env.ctx)
  env.bind('s1')
  env.setRunning('s1', true)
  env.appendTurnEnd('s1', 1, { kind: 'aborted', reason: { kind: 'parent' } })
  env.appendTurnEnd('s1', 2, { kind: 'aborted', reason: { kind: 'disposed' } })
  env.appendTurnEnd('s1', 3, { kind: 'blocked' })
  env.appendTurnEnd('s1', 4, { kind: 'max-tokens' })
  env.appendTurnEnd('s1', 5, { kind: 'forked' })
  ok(env.getOscCount() === 0, 'parent/disposed cancellation, blocked, max-tokens and forked endings are silent')
}
{
  // completion still rings, and quietCurrent still suppresses only completion
  const env = makeEnv({ quietCurrent: true })
  env.exportsObj.apply(env.ctx)
  env.bind('s1')
  env.setRunning('s1', true)
  env.appendTurnEnd('s1', 1, completed)
  ok(env.getOscCount() === 0, 'quietCurrent suppresses completion for the current view')

  env.setRetained('s1', 0)
  env.bind('s2')
  env.setList([env.row({ id: 's1', running: false, retainedBy: { mainView: 0 } }), env.row({ id: 's2', running: true, retainedBy: { mainView: 0 } })])
  env.appendTurnEnd('s2', 1, completed)
  ok(env.freqs.includes(FREQ.chime), 'completion for a non-current session plays the chime')
}
{
  // failure is never suppressed by quietCurrent
  const env = makeEnv({ quietCurrent: true })
  env.exportsObj.apply(env.ctx)
  env.bind('s1')
  env.setRunning('s1', true)
  env.appendTurnEnd('s1', 1, failed)
  ok(env.freqs.includes(FREQ.bell), 'failure still rings for the current view (quietCurrent is completion-only)')
}

// =====================================================================================
// 4. turn-end source semantics: history, ordering, settle window
// =====================================================================================
{
  // opening a session with history must not replay old turn ends
  const env = makeEnv(undefined)
  env.bind('s1', [turnEnd(5, completed)])
  env.exportsObj.apply(env.ctx)
  ok(env.getOscCount() === 0, 'historical turn/end in the initial binding does not ring')
  env.appendTurnEnd('s1', 6, completed)
  ok(env.freqs.includes(FREQ.chime), 'a new turn/end after the baseline rings once')
}
{
  // history reload (replace) and older pages (prepend) are not live turn ends
  const env = makeEnv(undefined)
  env.exportsObj.apply(env.ctx)
  env.bind('s1')
  env.loadHistory('s1', [turnEnd(9, completed)], 'replace')
  env.loadHistory('s1', [turnEnd(10, completed)], 'prepend')
  ok(env.getOscCount() === 0, 'replace/prepend window updates do not ring')

  env.loadHistory('s1', [turnEnd(11, completed)], 'append')
  ok(env.freqs.includes(FREQ.chime), 'append deltas do ring')
}
{
  // bound session whose turn/end is slower than running=false: settle window keeps a stop silent
  const env = makeEnv(undefined)
  env.exportsObj.apply(env.ctx)
  env.bind('s1')
  env.setRunning('s1', true)
  env.setRunning('s1', false)
  ok(env.getOscCount() === 0, 'running=false does not play while the retained session may still report a reason')
  ok(env.pendingTimersMs(500).length === 1, 'a settle timer waits for turn/end')
  env.appendTurnEnd('s1', 7, stoppedByUser)
  env.fireTimersMs(500)
  ok(env.getOscCount() === 0, 'late user-stop reason cancels the completion fallback')
}
{
  // unbound session (background work): no reason is available, completion is the fallback
  const env = makeEnv(undefined)
  env.exportsObj.apply(env.ctx)
  env.setRunning('s1', true)
  env.setRunning('s1', false)
  ok(env.freqs.includes(FREQ.chime), 'unbound session completion plays the chime immediately')
  ok(env.pendingTimersMs(500).length === 0, 'no settle timer without a binding')
}
{
  // leaving the session inside the settle window must not swallow the completion
  const env = makeEnv(undefined)
  env.exportsObj.apply(env.ctx)
  env.bind('s1')
  env.setRunning('s1', true)
  env.setRunning('s1', false)
  env.unbind('s1')
  env.fireTimersMs(500)
  ok(env.freqs.includes(FREQ.chime), 'binding released inside the settle window still plays the fallback completion')
}
{
  // bound session that never reports turn/end still completes (settle fallback)
  const env = makeEnv(undefined)
  env.exportsObj.apply(env.ctx)
  env.bind('s1')
  env.setRunning('s1', true)
  env.setRunning('s1', false)
  env.fireTimersMs(500)
  ok(env.freqs.includes(FREQ.chime), 'settle fallback plays completion when no turn/end arrives')
}
{
  // subagent completion uses the subagent channel
  const env = makeEnv({ subagentCompletionSound: 'success' })
  env.exportsObj.apply(env.ctx)
  env.setList([env.row({ id: 's1', origin: 'subagent' })])
  env.setRunning('s1', true)
  env.setRunning('s1', false)
  ok(env.freqs.includes(FREQ.success), 'subagent session completion uses the subagent channel')
}

// =====================================================================================
// 5. turn-less agent failures (api-session/error)
// =====================================================================================
{
  const env = makeEnv(undefined)
  env.exportsObj.apply(env.ctx)
  env.emitRemote('api-session/error', 's1', 'boom')
  ok(env.freqs.includes(FREQ.bell), 'api-session/error plays the failure sound')
  const after = env.getOscCount()
  env.emitRemote('api-session/error', 's1', 'boom')
  ok(env.getOscCount() === after, 'repeated agent error within the dedupe window is suppressed')
}
{
  const env = makeEnv({ subagentFailureSound: 'complete' })
  env.exportsObj.apply(env.ctx)
  env.setList([env.row({ id: 's1', origin: 'subagent' })])
  env.emitRemote('api-session/error', 's1', 'boom')
  ok(env.freqs.includes(FREQ.complete), 'subagent agent error uses the subagent channel')
}

// =====================================================================================
// 6. goal blocked projection
// =====================================================================================
{
  const env = makeEnv(undefined)
  env.exportsObj.apply(env.ctx)
  env.setList([env.row({ id: 's1', projectionValues: { goal: { phase: 'active' } } })])
  ok(env.getOscCount() === 0, 'goal active produces no sound')
  env.setList([env.row({ id: 's1', projectionValues: { goal: { phase: 'blocked' } } })])
  ok(env.freqs.includes(FREQ.ding), 'goal blocked transition plays goalBlockedSound')
  const after = env.getOscCount()
  env.setList([env.row({ id: 's1', projectionValues: { goal: { phase: 'blocked' } } })])
  ok(env.getOscCount() === after, 'goal staying blocked does not repeat')
}
{
  // already blocked at page load: baseline, no sound
  const env = makeEnv(undefined)
  env.setList([env.row({ id: 's1', projectionValues: { goal: { phase: 'blocked' } } })])
  env.exportsObj.apply(env.ctx)
  ok(env.getOscCount() === 0, 'goal already blocked at page load does not ring')
}

// =====================================================================================
// 7. audio paths, volume, config sanitization / migration
// =====================================================================================
{
  // per-event volume isolation
  const env = makeEnv({ completionVolume: 0.4, questionVolume: 1 })
  env.exportsObj.apply(env.ctx)
  env.setRunning('s1', true)
  env.setRunning('s1', false)
  ok(env.gains.length > 0 && env.gains[0] === 0.22 * 0.4, 'completionVolume 0.4 scales the chime gain')
  env.pending('s1', 'question', 'q1')
  ok(env.gains.indexOf(0.3) >= 0, 'questionVolume 1 keeps the ding gain at 0.3')
}
{
  // data URL completion via Web Audio decode
  const env = makeEnv({ completionSound: 'data:audio/mp3;base64,AAAA' })
  env.exportsObj.apply(env.ctx)
  env.setRunning('s1', true)
  env.setRunning('s1', false)
  ok(env.audioPlays.length === 0, 'data URL does not use the HTMLAudio path')
  ok(env.xhrUrls[0] === 'data:audio/mp3;base64,AAAA' && env.bufferPlays.length === 1, 'data URL decoded and played via Web Audio')
}
{
  // data URL fallback when Web Audio is unavailable
  const env = makeEnv({ completionSound: 'data:audio/mp3;base64,BB' }, { noAudioContext: true })
  env.exportsObj.apply(env.ctx)
  env.setRunning('s1', true)
  env.setRunning('s1', false)
  ok(env.audioPlays.length === 1 && env.audioPlays[0] === 'data:audio/mp3;base64,BB', 'no Web Audio: falls back to the Audio element')
}
{
  // silent event values
  const env = makeEnv({ completionSound: 'none', questionSound: 'none', stoppedSound: 'none' })
  env.exportsObj.apply(env.ctx)
  env.setRunning('s1', true)
  env.setRunning('s1', false)
  env.pending('s1', 'question', 'q1')
  ok(env.getOscCount() === 0, 'sound value none mutes every event kind')
}
{
  // garbage config is sanitized
  const env = makeEnv({ enabled: 'yes', completionSound: 42, approvalVolume: 'loud' })
  let threw = false
  try {
    env.exportsObj.apply(env.ctx)
    env.setRunning('s1', true)
    env.setRunning('s1', false)
  } catch (e) { threw = true; console.log(e) }
  ok(!threw, 'garbage config does not crash')
  ok(env.freqs.includes(FREQ.chime), 'sanitized defaults still play (enabled=true, completionSound=chime)')
}
{
  // legacy 0.2.0 config migration
  const env = makeEnv({
    defaultSound: 'bell',
    attentionSound: 'ding',
    volume: 0.5,
    debounceMs: 400,
    workspaces: [{ workspaceId: 'w1', sound: 'ding' }],
    voiceName: '晓晓',
    voiceRate: 1.15,
    attentionPhrase: '需要你的确认',
  })
  env.exportsObj.apply(env.ctx)
  env.setRunning('s1', true)
  env.setRunning('s1', false)
  ok(env.freqs[0] === FREQ.bell, 'legacy defaultSound migrates to completionSound (bell)')
  ok(env.gains[0] === 0.26, 'legacy global volume stays ignored')
}
{
  // legacy voice values degrade to the kind default
  const env = makeEnv({ defaultSound: 'voice:我做完啦！', failureSound: 'voice' })
  env.exportsObj.apply(env.ctx)
  env.setRunning('s1', true)
  env.setRunning('s1', false)
  ok(env.freqs[0] === FREQ.chime, 'legacy voice completion degrades to chime')
}
{
  // 0.4.x config without stopped fields: defaults apply and the next write persists them
  const env = makeEnv({ completionSound: 'chime', failureSound: 'bell' })
  env.exportsObj.apply(env.ctx)
  env.bind('s1')
  env.setRunning('s1', true)
  env.appendTurnEnd('s1', 1, stoppedByUser)
  ok(env.getOscCount() === 0, 'existing 0.4.x config gets the new silent stopped default')
  env.renderUI()
  const enabledSwitch = env.created.find((n) => n.type === 'button' && n.props.role === 'switch')
  enabledSwitch.props.onClick()
  const stored = JSON.parse(env.storage.get('dsh-sound:config'))
  ok(stored.stoppedSound === 'none' && stored.stoppedVolume === 1, 'a config write persists stoppedSound=none / stoppedVolume=1')
  ok(stored.subagentStoppedSound === 'none' && stored.subagentStoppedVolume === 1, 'a config write persists the subagent stopped defaults')
}

// =====================================================================================
// 8. disposal and state pruning
// =====================================================================================
{
  const env = makeEnv(undefined)
  env.exportsObj.apply(env.ctx)
  env.bind('s1')
  env.setRunning('s1', true)
  env.dispose()
  env.appendTurnEnd('s1', 1, failed)
  env.pending('s1', 'question', 'q1')
  env.emitRemote('api-session/error', 's1', 'boom')
  env.setRunning('s1', false)
  ok(env.getOscCount() === 0, 'disposed detection stops reacting to every source')
}
{
  // a removed session re-added later must not look like a turn end
  const env = makeEnv(undefined)
  env.exportsObj.apply(env.ctx)
  env.setRunning('s1', true)
  env.setList([])
  env.setList([env.row({ id: 's1', running: false })])
  ok(env.getOscCount() === 0, 're-created session starts fresh — no phantom completion')
}

// =====================================================================================
// 9. multi-tab dedupe
// =====================================================================================
{
  const env = makeEnv({ completionSound: 'ding' }, { withBroadcast: true })
  const BC = env.getBroadcastClass()
  const other = new BC('dsh-sound')
  let seen = null
  other.onmessage = (ev) => {
    seen = ev.data
    if (seen && seen.t === 'hello') other.postMessage({ t: 'hello-ack' })
    if (seen && seen.t === 'intent') other.postMessage({ t: 'intent', key: seen.key, nonce: 0 })
  }
  env.exportsObj.apply(env.ctx)
  env.setRunning('s1', true)
  env.setRunning('s1', false)
  ok(seen && seen.t === 'intent' && seen.key === 'status:s1', 'play intent broadcast to other tabs')
  ok(env.timers.some((t) => t.ms === 40), 'play deferred 40ms for the cross-tab tie-break')
  ok(env.timers.filter((t) => t.ms === 40).every((t) => t.cleared), 'the other tab\'s intent cancels the deferred play')
  env.fireTimers()
  ok(env.getOscCount() === 0, 'other tab wins the tie-break; this tab stays silent')
}
{
  const env = makeEnv({ completionSound: 'ding' }, { withBroadcast: true })
  env.exportsObj.apply(env.ctx)
  env.setRunning('s1', true)
  env.setRunning('s1', false)
  ok(env.pendingTimersMs(40).length === 0, 'single tab does not defer for a handshake')
  ok(env.freqs[0] === FREQ.ding, 'single tab plays immediately')
}

// =====================================================================================
// 10. settings UI
// =====================================================================================
{
  const env = makeEnv(undefined)
  env.exportsObj.apply(env.ctx)
  let threw = false
  try { env.renderUI() } catch (e) { threw = true; console.log(e) }
  ok(!threw, 'Section renders without throwing')

  const tabs = env.created.filter((n) => n.type === 'button' && n.props.role === 'tab')
  ok(tabs.length === 2 && tabs[0].props['aria-selected'] === 'true' && tabs[1].props['aria-selected'] === 'false', 'renders 主 Agent / 子代理 tabs with the main tab active')

  const groups = env.created.filter((n) => n.props && n.props.role === 'radiogroup')
  ok(groups.length === 7, 'main tab renders seven event rows (completion, stopped, approval, question, plan-review, goal-blocked, failure)')
  ok(groups[0].props['data-kind'] === 'completion' && groups[1].props['data-kind'] === 'stopped' && groups[2].props['data-kind'] === 'approval',
    'radio groups are named per event kind, with the new stopped row second')

  const radios = env.created.filter((n) => n.type === 'input' && n.props.type === 'radio')
  ok(radios.length === 49, 'renders 49 Radio.Button inputs (7 events x 7 options)')
  ok(radios.slice(0, 7).map((r) => r.props.value).join(',') === 'ding,chime,bell,complete,success,none,local', 'completion group lists all sound options incl. local')
  ok(radios[1].props.checked === true, 'completion default chime is checked')
  ok(radios[7].props.name === 'dsh-sound-stopped' && radios[14].props.name === 'dsh-sound-approval', 'Radio.Button names are scoped per event')
  ok(radios[8].props.checked === false && radios[12].props.checked === true, 'stopped defaults to the 静音 option')
  ok(radios[7].props.value === 'ding' && radios[12].props.value === 'none', 'stopped row lists the same options')

  const ranges = env.created.filter((n) => n.type === 'input' && n.props.type === 'range')
  ok(ranges.length === 7, 'renders seven independent volume sliders')
  ok(ranges.every((r) => r.props.min === 0 && r.props.max === 100), 'volume sliders range 0-100')
  ok(ranges.every((r) => r.props.step === 1), 'volume sliders use 1% steps')

  const switches = env.created.filter((n) => n.type === 'button' && n.props.role === 'switch')
  ok(switches.length === 1 && switches[0].props['aria-checked'] === 'true', 'renders the enabled switch')

  const audioInputs = env.created.filter((n) => n.type === 'input' && n.props.type === 'file' && n.props.accept === 'audio/*')
  ok(audioInputs.length === 0, 'no local file pickers when builtin sounds are selected')

  const ioButtons = env.created.filter((n) => n.type === 'button' && (n.children[0] === '导出' || n.children[0] === '导入'))
  ok(ioButtons.length === 2, 'export/import remain as two buttons')

  const before = env.getOscCount()
  const bellRadio = radios.find((r) => r.props.name === 'dsh-sound-completion' && r.props.value === 'bell')
  bellRadio.props.onClick()
  ok(env.getOscCount() === before + 4 && env.freqs.includes(FREQ.bell), 'clicking a Radio.Button selects and plays it (bell)')
  bellRadio.props.onClick()
  ok(env.getOscCount() === before + 8, 'clicking the selected Radio.Button replays it')
  const beforeNone = env.getOscCount()
  radios.find((r) => r.props.name === 'dsh-sound-completion' && r.props.value === 'none').props.onClick()
  ok(env.getOscCount() === beforeNone, 'clicking 静音 plays nothing')
}

// =====================================================================================
// 11. settings UI — local files, locales, subagent tab
// =====================================================================================
{
  const env = makeEnv({ completionSound: 'audio:a1', failureSound: 'data:audio/mp3;base64,AA' })
  env.exportsObj.apply(env.ctx)
  env.renderUI()
  const radios = env.created.filter((n) => n.type === 'input' && n.props.type === 'radio')
  ok(radios.length === 49, 'Radio.Button groups still render with local values')
  ok(radios[6].props.checked === true, 'completion 本地文件 Radio.Button is checked for an audio: value')
  const audioInputs = env.created.filter((n) => n.type === 'input' && n.props.type === 'file' && n.props.accept === 'audio/*')
  ok(audioInputs.length === 2, 'file pickers appear below events with a local file selected')
  const fileButtons = env.created.filter((n) => n.type === 'button' && n.props.className === 'dns-notify-btn dns-notify-btn-sm')
  ok(fileButtons.length === 2, 'file rows render 选择/更换 buttons')
  const names = env.created.filter((n) => n.type === 'span' && n.props.className === 'dns-notify-file-name')
  ok(names.length === 2, 'file rows show clickable file names')
  names[0].props.onClick()
  names[1].props.onClick()
  ok(env.audioPlays.length === 0, 'file-name clicks do not use the HTMLAudio fallback')
  ok(env.xhrUrls[0] === 'data:audio/mp3;base64,AA' && env.bufferPlays.length === 1, 'clicking the chosen file name decodes and plays it via Web Audio')
}
{
  const env = makeEnv({ completionSound: 'audio:a1' })
  env.exportsObj.apply(env.ctx)
  env.renderUI()
  const chime = env.created
    .filter((n) => n.type === 'input' && n.props.type === 'radio')
    .find((r) => r.props.name === 'dsh-sound-completion' && r.props.value === 'chime')
  chime.props.onChange()
  const afterBuiltin = JSON.parse(env.storage.get('dsh-sound:config'))
  ok(afterBuiltin.completionSound === 'chime', 'switching to a builtin stores the builtin key')
  ok(afterBuiltin.localFiles && afterBuiltin.localFiles.completion === 'audio:a1', 'the chosen local file is stashed, not removed')
  env.renderUI()
  const radios2 = env.created.filter((n) => n.type === 'input' && n.props.type === 'radio')
  ok(radios2[1].props.checked === true, 'chime is selected after leaving local')
  ok(env.created.filter((n) => n.type === 'input' && n.props.type === 'file' && n.props.accept === 'audio/*').length === 0, 'file row hides while a builtin is selected')
  radios2.find((r) => r.props.name === 'dsh-sound-completion' && r.props.value === 'local').props.onChange()
  ok(JSON.parse(env.storage.get('dsh-sound:config')).completionSound === 'audio:a1', 'switching back to 本地文件 restores the same file')
}
{
  // every product-facing key exists in all four dictionaries
  const env = makeEnv(undefined)
  env.exportsObj.apply(env.ctx)
  const productKeys = [
    'sound.ding', 'sound.chime', 'sound.bell', 'sound.complete', 'sound.success', 'sound.none', 'sound.local',
    'event.stopped', 'event.approval', 'event.question', 'event.planReview', 'event.goalBlocked', 'event.failure',
    'file.embeddedAudio', 'file.noneSelected', 'file.replace', 'file.choose', 'file.clickToPlay',
    'status.configUnavailable', 'section.title', 'tab.mainAgent', 'tab.subagents', 'subagent.ignoreEvents',
    'transfer.title', 'transfer.export', 'transfer.import', 'control.volume', 'control.play',
  ]
  ok(env.languages.get('pt-BR').label === 'Português (Brasil)', 'pt-BR language is registered')
  ok(env.languages.get('es').label === 'Español', 'Spanish language is registered')
  for (const language of ['zh', 'en', 'pt-BR', 'es']) {
    const dictionary = env.dictionaries.get('dsh-sound/' + language)
    ok(!!dictionary && Object.keys(dictionary).length === productKeys.length && productKeys.every((key) => typeof dictionary[key] === 'string' && dictionary[key].length > 0),
      language + ' has every product-facing translation key')
  }
  env.setLocale('en')
  env.renderUI()
  ok(env.created.some((n) => n.type === 'span' && n.children[0] === 'Stopped'), 'en shows the new Stopped event label')
  env.setLocale('zh')
  env.renderUI()
  ok(env.created.some((n) => n.type === 'span' && n.children[0] === '用户停止'), 'zh 用户停止 event label rendered')
}
{
  // borrowed locale IDs survive disposal
  const borrowedPt = { id: 'PTbr', label: 'Borrowed Portuguese' }
  const borrowedEs = { id: 'ES', label: 'Borrowed Spanish' }
  const env = makeEnv({ _localeLanguages: [['PTbr', borrowedPt], ['ES', borrowedEs]] })
  env.exportsObj.apply(env.ctx)
  ok(env.languages.get('PTbr') === borrowedPt && env.languages.get('ES') === borrowedEs, 'case-insensitive locale guards preserve borrowed registrations')
  ok(env.dictionaries.has('dsh-sound/pt-BR') && env.dictionaries.has('dsh-sound/es'), 'plugin registers dictionaries for borrowed locale IDs')
  env.dispose()
  ok(env.languages.get('PTbr') === borrowedPt && env.languages.get('ES') === borrowedEs, 'disposing the plugin does not remove borrowed locale registrations')
}
{
  // subagent tab shows its own row set including stopped
  const env = makeEnv(undefined)
  env.exportsObj.apply(env.ctx)
  env.renderUI()
  const subagentTab = env.created.find((n) => n.type === 'button' && n.props.role === 'tab' && n.children[0] === '子代理')
  subagentTab.props.onClick()
  env.rerenderUI()
  const groups = env.created.filter((n) => n.props && n.props.role === 'radiogroup')
  ok(groups.length === 7 && groups[0].props['data-kind'] === 'subagent-completion' && groups[1].props['data-kind'] === 'subagent-stopped',
    'subagent tab renders seven rows including subagent-stopped')
}

// =====================================================================================
// 12. missing optional services degrade gracefully
// =====================================================================================
{
  // no uiSession: completion still works, question sounds are simply absent
  const env = makeEnv(undefined, { withoutUiSession: true })
  env.exportsObj.apply(env.ctx)
  env.setRunning('s1', true)
  env.setRunning('s1', false)
  ok(env.freqs.includes(FREQ.chime), 'completion detection works without uiSession')
  env.pending('s1', 'question', 'q1')
  ok(!env.freqs.includes(FREQ.ding), 'no question sound without the status service (no crash)')
}
{
  // no remote: turn/end classification still works, api-session/error is skipped
  const env = makeEnv(undefined, { withoutRemote: true })
  env.exportsObj.apply(env.ctx)
  env.bind('s1')
  env.setRunning('s1', true)
  env.appendTurnEnd('s1', 1, failed)
  ok(env.freqs.includes(FREQ.bell), 'turn/end failure works without the remote service')
}

console.log(failures === 0 ? 'ALL CLIENT TESTS PASSED' : failures + ' FAILURES')
process.exit(failures === 0 ? 0 : 1)
