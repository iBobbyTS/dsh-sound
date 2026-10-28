/**
 * dsh-sound — Client 半体（0.5.0，DSH 0.2.x 事件面）
 *
 * 以 window.__ModuleLoader__.load 注册的懒加载 CJS 工厂。浏览器侧职责：
 * 1. 检测事件（0.2.x 起不再有 events.mux / approval+question requested 帧）：
 *    - 需要人介入：uiSession.sessionStatus 的 pendingInteraction（审批 / 提问 /
 *      计划评审），按请求 key 去重，刷新恢复与重连回放不重响；
 *    - 完成：已保留会话的 turn/end 且 reason.kind === 'completed'；
 *      其他会话只能看 running true→false（无原因可用，按完成处理）；
 *    - 失败：turn/end 的 error / interrupted / aborted(hook)；api-session/error；
 *    - 用户停止：turn/end 的 aborted(user / parent / disposed / legacy)，
 *      独立事件，默认静音，可单独配置声音与音量；
 *    - 目标受阻：列表行 goal 投影的 phase 进入 blocked；
 *    - 静音：blocked / max-tokens / forked 等其余结束原因。
 * 2. 事件按来源分主 agent / 子代理（subagent）两个通道：子代理会话
 *    （列表行 origin/parentId）独立配置声音与音量，默认全部静音；
 *    ignoreSubagent 忽略全部子代理事件。0.2.x 已无 session/jobs 帧，
 *    后台子代理任务通过其子会话的 running 变化与 turn/end 归入子代理通道。
 * 3. 七类事件完全独立：各自配置声音（内置合成音 / 静音 / 本地文件）与音量（0–100%）；
 * 4. 播放内置合成铃声（Web Audio）或本地音频文件（IndexedDB 存储）；
 * 5. 在设置面板注册「声音通知」区块（含「子代理事件」分区）。
 *
 * 配置持久化：浏览器 localStorage（键 dsh-sound:config）；本地音乐存 IndexedDB（dsh-sound-audio）。
 * 说明：settings API 白名单不暴露第三方命名空间，故客户端不依赖 settingsScope；
 * 宿主端仍注册同名命名空间，待平台提供暴露机制后可直接迁移。
 */
window.__ModuleLoader__.load({
  id: '@ai-galaxy/dsh-sound',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    var React = require('react')

    var LOCAL_KEY = 'dsh-sound:config'

    /* ---------------- 样式（一次注入，HMR 重载时去重） ---------------- */
    var CSS = [
      '.dns-notify-page{display:flex;flex-direction:column;max-width:680px;}',
      '.dns-notify-page>:last-child{border-bottom:none;}',
      '.dns-notify-title{flex:1;min-width:0;font-size:14px;font-weight:400;line-height:22px;',
      'color:var(--dsw-alias-label-primary,#333);}',
      '.dns-notify-hint{font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary,#888);}',
      '.dns-notify-row{display:flex;align-items:center;gap:8px;padding:16px 0;',
      'border-bottom:1px solid var(--dsw-alias-border-l2,#e5e5e5);}',
      '.dns-notify-event{display:flex;flex-direction:column;gap:8px;padding:16px 0;',
      'border-bottom:1px solid var(--dsw-alias-border-l2,#e5e5e5);}',
      '.dns-notify-event>.dns-notify-row{padding:0;border-bottom:none;}',
      '.dns-notify-events.is-disabled{opacity:0.4;pointer-events:none;}',
      '.dns-notify-tabs{display:flex;gap:4px;padding:12px 0 0;',
      'border-bottom:1px solid var(--dsw-alias-border-l2,#e5e5e5);}',
      '.dns-notify-tab{font:inherit;font-size:13px;line-height:20px;cursor:pointer;padding:6px 12px;',
      'border:none;background:none;color:var(--dsw-alias-label-secondary,#666);',
      'border-bottom:2px solid transparent;margin-bottom:-1px;}',
      '.dns-notify-tab:hover{color:var(--dsw-alias-label-primary,#333);}',
      '.dns-notify-tab.is-active{color:var(--dsw-alias-brand-primary,#3b82f6);',
      'border-bottom-color:var(--dsw-alias-brand-primary,#3b82f6);}',
      '.dns-notify-controls{display:flex;align-items:center;gap:12px;flex:none;}',
      '.dns-notify-radio-group{display:inline-flex;flex-wrap:wrap;width:fit-content;',
      'border:1px solid var(--dsw-alias-border-l2,#e5e5e5);border-radius:8px;overflow:hidden;}',
      '.dns-notify-radio-btn{position:relative;display:inline-flex;align-items:center;justify-content:center;',
      'height:28px;padding:0 10px;font-size:12px;line-height:18px;white-space:nowrap;user-select:none;',
      'color:var(--dsw-alias-label-primary,#333);background:var(--dsw-alias-bg-layer-2,#fff);',
      'border-right:1px solid var(--dsw-alias-border-l2,#e5e5e5);cursor:pointer;}',
      '.dns-notify-radio-btn:last-child{border-right:none;}',
      '.dns-notify-radio-btn:hover{background:var(--dsw-alias-interactive-bg-hover,#f0f0f0);}',
      '.dns-notify-radio-btn.is-checked{background:var(--dsw-alias-brand-primary,#3b82f6);',
      'color:var(--dsw-alias-label-primary-foreground,#fff);}',
      '.dns-notify-radio-btn.is-checked:hover{background:var(--dsw-alias-brand-primary,#3b82f6);}',
      '.dns-notify-radio-btn input{position:absolute;width:1px;height:1px;opacity:0;pointer-events:none;}',
      '.dns-notify-btn{font:inherit;font-size:14px;line-height:22px;cursor:pointer;flex:none;',
      'height:36px;padding:0 14px;color:var(--dsw-alias-label-primary,#333);',
      'background:var(--dsw-alias-bg-module-platform,#f5f6f7);',
      'border:1px solid var(--dsw-alias-border-l2,#e5e5e5);border-radius:18px;}',
      '.dns-notify-btn:hover{background:var(--dsw-alias-interactive-bg-hover,#f0f0f0);}',
      '.dns-notify-btn-sm{height:28px;padding:0 12px;border-radius:14px;font-size:12px;line-height:18px;}',
      '.dns-notify-range{width:220px;flex:none;accent-color:var(--dsw-alias-brand-primary,#3b82f6);}',
      '.dns-notify-pct{width:36px;flex:none;font-size:12px;line-height:18px;',
      'color:var(--dsw-alias-label-tertiary,#888);font-variant-numeric:tabular-nums;}',
      '.dns-notify-switch{position:relative;width:36px;height:20px;padding:0;border:none;border-radius:10px;',
      'background:var(--dsw-alias-bg-module-platform,#e5e5e5);cursor:pointer;flex:none;}',
      '.dns-notify-switch.is-on{background:var(--dsw-alias-brand-primary,#3b82f6);}',
      '.dns-notify-switch-thumb{position:absolute;top:2px;left:2px;width:16px;height:16px;',
      'border-radius:50%;background:var(--dsw-alias-bg-layer-1,#fff);}',
      '.dns-notify-switch.is-on .dns-notify-switch-thumb{left:18px;}',
      '.dns-notify-file-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap;}',
      '.dns-notify-file-name{display:inline-flex;align-items:center;gap:6px;font-size:12px;line-height:18px;',
      'color:var(--dsw-alias-label-tertiary,#888);cursor:pointer;user-select:none;}',
      '.dns-notify-file-name:hover{color:var(--dsw-alias-label-primary,#333);text-decoration:underline;}',
      '.dns-notify-file-play{font-size:10px;color:var(--dsw-alias-label-tertiary,#888);}',
      '.dns-notify-radio-btn:focus-within,.dns-notify-switch:focus-visible,.dns-notify-btn:focus-visible{',
      'outline:2px solid var(--dsw-alias-state-business-primary,#3b82f6);outline-offset:2px;}',
    ].join('\n')
    var cssTagId = 'dsh-sound/style'
    if (typeof document !== 'undefined') {
      var existingTag = document.querySelector('style[data-plugin-css="' + cssTagId + '"]')
      if (existingTag) {
        existingTag.textContent = CSS
      } else {
        var styleTag = document.createElement('style')
        styleTag.dataset.plugin = 'dsh-sound'
        styleTag.dataset.pluginCss = cssTagId
        styleTag.textContent = CSS
        document.head.appendChild(styleTag)
      }
    }

    /* ---------------- 配置存储（localStorage 后端，兼容 settingsScope 外形） ---------------- */
    var BUILTIN_KEYS = ['ding', 'chime', 'bell', 'complete', 'success', 'none']

    /**
     * 事件种类 → 配置字段 / 默认声音 / 设置页文案的唯一来源。
     * 其余映射表（主 agent、子代理、localFiles 键）全部由它派生，新增事件只改这里。
     * defaultSound：主 agent 通道默认；subagentDefault：子代理通道默认
     * （完成与用户停止默认静音，其余事件可单独配置）。
     */
    var EVENT_TABLE = [
      { kind: 'completion', labelKey: 'sound.complete', defaultSound: 'chime', subagentDefault: 'none' },
      { kind: 'stopped', labelKey: 'event.stopped', defaultSound: 'none', subagentDefault: 'none' },
      { kind: 'approval', labelKey: 'event.approval', defaultSound: 'ding', subagentDefault: 'ding' },
      { kind: 'question', labelKey: 'event.question', defaultSound: 'ding', subagentDefault: 'ding' },
      { kind: 'plan-review', labelKey: 'event.planReview', defaultSound: 'ding', subagentDefault: 'ding' },
      { kind: 'goal-blocked', labelKey: 'event.goalBlocked', defaultSound: 'ding', subagentDefault: 'bell' },
      { kind: 'failure', labelKey: 'event.failure', defaultSound: 'bell', subagentDefault: 'bell' },
    ]

    /** goal-blocked → goalBlocked（子代理字段沿用 subagentGoalBlockedSound 等既有键名）。 */
    function camelKind(kind) {
      return String(kind).replace(/-([a-z])/g, function (match, letter) { return letter.toUpperCase() })
    }

    function capitalize(text) {
      return text.charAt(0).toUpperCase() + text.slice(1)
    }

    var EVENT_KINDS = EVENT_TABLE.map(function (spec) { return spec.kind })
    var SUBAGENT_EVENT_KINDS = EVENT_KINDS.map(function (kind) { return 'subagent-' + kind })
    var SOUND_FIELD = {}
    var VOL_FIELD = {}
    var SOUND_DEFAULT = {}
    var FIELD_KIND = {}
    var SUBAGENT_SOUND_FIELD = {}
    var SUBAGENT_VOL_FIELD = {}
    var SUBAGENT_FIELD_KIND = {}
    var SOUND_FIELDS = []
    var VOL_FIELDS = []
    var SUBAGENT_SOUND_FIELDS = []
    var SUBAGENT_VOL_FIELDS = []
    var CONFIG_DEFAULTS = { enabled: true, quietCurrent: false, ignoreSubagent: false }

    EVENT_TABLE.forEach(function (spec) {
      var kind = spec.kind
      var camel = camelKind(kind)
      SOUND_FIELD[kind] = camel + 'Sound'
      VOL_FIELD[kind] = camel + 'Volume'
      SOUND_DEFAULT[kind] = spec.defaultSound
      FIELD_KIND[SOUND_FIELD[kind]] = kind
      SUBAGENT_SOUND_FIELD[kind] = 'subagent' + capitalize(camel) + 'Sound'
      SUBAGENT_VOL_FIELD[kind] = 'subagent' + capitalize(camel) + 'Volume'
      SUBAGENT_FIELD_KIND[SUBAGENT_SOUND_FIELD[kind]] = 'subagent-' + kind
      SOUND_FIELDS.push(SOUND_FIELD[kind])
      VOL_FIELDS.push(VOL_FIELD[kind])
      SUBAGENT_SOUND_FIELDS.push(SUBAGENT_SOUND_FIELD[kind])
      SUBAGENT_VOL_FIELDS.push(SUBAGENT_VOL_FIELD[kind])
      CONFIG_DEFAULTS[SOUND_FIELD[kind]] = spec.defaultSound
      CONFIG_DEFAULTS[VOL_FIELD[kind]] = 1
      CONFIG_DEFAULTS[SUBAGENT_SOUND_FIELD[kind]] = spec.subagentDefault
      CONFIG_DEFAULTS[SUBAGENT_VOL_FIELD[kind]] = 1
    })

    function soundFieldFor(kind, isSubagent) {
      return isSubagent ? SUBAGENT_SOUND_FIELD[kind] : SOUND_FIELD[kind]
    }

    function volFieldFor(kind, isSubagent) {
      return isSubagent ? SUBAGENT_VOL_FIELD[kind] : VOL_FIELD[kind]
    }

    /** 子代理事件的 localFiles 键与设置页 data-kind / radio name 后缀。 */
    function subagentKeyFor(kind, isSubagent) {
      return isSubagent ? 'subagent-' + kind : kind
    }

    /** 列表行判定：DSH SessionSummary 的 origin/parentId（兼容 parentSessionId 命名）。 */
    function isSubagentRow(row) {
      return !!(row && (row.origin === 'subagent' || row.parentId !== undefined || row.parentSessionId !== undefined))
    }

    /** 事件帧与任务帧的来源判定：会话行已列出且标记为子代理时视为子代理来源。 */
    function isSubagentSession(ctx, sid) {
      if (!ctx || !ctx.sessions || !ctx.sessions.list || !sid) return false
      try {
        var snap = ctx.sessions.list.getSnapshot()
        var row = snap && snap.byId ? snap.byId[sid] : undefined
        return isSubagentRow(row)
      } catch (err) { return false }
    }

    function isFileSound(v) {
      return typeof v === 'string' && (v.indexOf('audio:') === 0 || v.indexOf('data:') === 0)
    }

    /** 合法声音值：内置键 / 'local'（本地文件待选）/ data URL / IndexedDB 引用。 */
    function validSound(v) {
      if (typeof v !== 'string' || !v) return false
      if (BUILTIN_KEYS.indexOf(v) >= 0) return true
      if (v === 'local') return true
      if (v.indexOf('data:') === 0) return true
      if (v.indexOf('audio:') === 0) return true
      return false
    }

    function sanitize(value) {
      var out = {}
      var f
      out.enabled = CONFIG_DEFAULTS.enabled
      out.quietCurrent = CONFIG_DEFAULTS.quietCurrent
      out.ignoreSubagent = CONFIG_DEFAULTS.ignoreSubagent
      var fields = SOUND_FIELDS
      var vols = VOL_FIELDS
      var subFields = SUBAGENT_SOUND_FIELDS
      var subVols = SUBAGENT_VOL_FIELDS
      for (f = 0; f < fields.length; f++) out[fields[f]] = CONFIG_DEFAULTS[fields[f]]
      for (f = 0; f < vols.length; f++) out[vols[f]] = CONFIG_DEFAULTS[vols[f]]
      for (f = 0; f < subFields.length; f++) out[subFields[f]] = CONFIG_DEFAULTS[subFields[f]]
      for (f = 0; f < subVols.length; f++) out[subVols[f]] = CONFIG_DEFAULTS[subVols[f]]
      out.localFiles = {}
      if (value && typeof value === 'object') {
        if (typeof value.enabled === 'boolean') out.enabled = value.enabled
        if (typeof value.quietCurrent === 'boolean') out.quietCurrent = value.quietCurrent
        if (typeof value.ignoreSubagent === 'boolean') out.ignoreSubagent = value.ignoreSubagent
        // 旧版字段迁移：defaultSound → completionSound；voice/voice:* 值降级为该类默认音
        var completionValue = value.completionSound !== undefined ? value.completionSound : value.defaultSound
        if (validSound(completionValue)) out.completionSound = completionValue
        for (f = 0; f < fields.length; f++) {
          var fk = fields[f]
          if (fk === 'completionSound') continue
          if (validSound(value[fk])) out[fk] = value[fk]
        }
        for (f = 0; f < subFields.length; f++) {
          if (validSound(value[subFields[f]])) out[subFields[f]] = value[subFields[f]]
        }
        for (f = 0; f < vols.length; f++) {
          var vk = vols[f]
          if (typeof value[vk] === 'number' && value[vk] >= 0 && value[vk] <= 1) out[vk] = value[vk]
        }
        for (f = 0; f < subVols.length; f++) {
          var svk = subVols[f]
          if (typeof value[svk] === 'number' && value[svk] >= 0 && value[svk] <= 1) out[svk] = value[svk]
        }
        if (value.localFiles && typeof value.localFiles === 'object' && !Array.isArray(value.localFiles)) {
          var localKeys = EVENT_KINDS.concat(SUBAGENT_EVENT_KINDS)
          for (f = 0; f < localKeys.length; f++) {
            var ek = localKeys[f]
            if (isFileSound(value.localFiles[ek])) out.localFiles[ek] = value.localFiles[ek]
          }
        }
        for (f = 0; f < fields.length; f++) {
          if (isFileSound(out[fields[f]])) out.localFiles[FIELD_KIND[fields[f]]] = out[fields[f]]
        }
        for (f = 0; f < subFields.length; f++) {
          if (isFileSound(out[subFields[f]])) out.localFiles[SUBAGENT_FIELD_KIND[subFields[f]]] = out[subFields[f]]
        }
        // 旧版 workspaces / debounceMs / volume / voice* / attention* 等字段一律忽略
      }
      return out
    }

    function readLocal() {
      try {
        var raw = window.localStorage.getItem(LOCAL_KEY)
        return raw ? JSON.parse(raw) : null
      } catch (err) { return null }
    }

    function createConfigStore() {
      var snapshot = { status: 'ready', value: sanitize(readLocal()) }
      var listeners = []
      function commit(next) {
        snapshot = { status: 'ready', value: next }
        try { window.localStorage.setItem(LOCAL_KEY, JSON.stringify(next)) } catch (err) { /* 隐私模式等：仅内存生效 */ }
        var list = listeners.slice()
        for (var i = 0; i < list.length; i++) list[i]()
      }
      return {
        getSnapshot: function () { return snapshot },
        subscribe: function (fn) {
          listeners.push(fn)
          return function () {
            var i = listeners.indexOf(fn)
            if (i >= 0) listeners.splice(i, 1)
          }
        },
        set: function (field, value) {
          var next = {}
          next[field] = value
          return this.patch(next)
        },
        patch: function (partial) {
          commit(sanitize(Object.assign({}, snapshot.value, partial)))
          return Promise.resolve()
        },
        replace: function (next) { commit(sanitize(next)) },
      }
    }

    /* ---------------- 音频引擎 ---------------- */
    var audioCtx = null
    var lastPlayed = new Map()

    function ensureContext() {
      if (audioCtx === null) {
        var AC = window.AudioContext || window.webkitAudioContext
        audioCtx = AC ? new AC() : undefined
      }
      if (audioCtx && audioCtx.state === 'suspended') {
        var p = audioCtx.resume()
        if (p && p.catch) p.catch(function () {})
      }
      return audioCtx
    }

    function tone(ctx, freq, delay, dur, type, gain, slideTo, vol) {
      var volume = vol === undefined ? 1 : vol
      var t0 = ctx.currentTime + delay
      var osc = ctx.createOscillator()
      var g = ctx.createGain()
      osc.type = type
      osc.frequency.setValueAtTime(freq, t0)
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur)
      g.gain.setValueAtTime(0.0001, t0)
      g.gain.exponentialRampToValueAtTime(gain * volume, t0 + 0.02)
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
      osc.connect(g)
      g.connect(ctx.destination)
      osc.start(t0)
      osc.stop(t0 + dur + 0.05)
    }

    /** 带泛音分量的音：partials = [[倍频, 时长比, 波形, 增益比], ...] */
    function richTone(ctx, freq, delay, dur, type, gain, partials, vol) {
      tone(ctx, freq, delay, dur, type, gain, undefined, vol)
      if (partials) {
        for (var i = 0; i < partials.length; i++) {
          var p = partials[i]
          tone(ctx, freq * p[0], delay, dur * p[1], p[2] || 'sine', gain * p[3], undefined, vol)
        }
      }
    }

    function playBuiltin(key, vol) {
      var ctx = ensureContext()
      if (!ctx) return
      if (key === 'ding') {
        // 叮-咚：门铃式双音
        richTone(ctx, 698.46, 0.02, 0.5, 'sine', 0.3, [[2, 0.8, 'sine', 0.35], [3.01, 0.5, 'sine', 0.12]], vol)
        richTone(ctx, 587.33, 0.28, 0.7, 'sine', 0.26, [[2, 0.8, 'sine', 0.3]], vol)
      } else if (key === 'chime') {
        // 风铃：A5 → E6 悠长
        richTone(ctx, 880, 0.02, 0.5, 'sine', 0.22, [[2.76, 0.6, 'sine', 0.18]], vol)
        richTone(ctx, 1318.5, 0.24, 1.1, 'sine', 0.2, [[2, 0.5, 'sine', 0.1]], vol)
      } else if (key === 'bell') {
        // 钟铃：非谐泛音
        richTone(ctx, 493.88, 0.02, 1.6, 'sine', 0.26, [[2, 0.85, 'sine', 0.3], [2.4, 0.6, 'sine', 0.18], [3.02, 0.45, 'sine', 0.1]], vol)
      } else if (key === 'complete') {
        // 完成：C-E-G-C 上行琶音
        richTone(ctx, 523.25, 0.02, 0.28, 'triangle', 0.22, [[2, 0.7, 'sine', 0.25]], vol)
        richTone(ctx, 659.25, 0.18, 0.28, 'triangle', 0.22, [[2, 0.7, 'sine', 0.25]], vol)
        richTone(ctx, 783.99, 0.34, 0.28, 'triangle', 0.22, [[2, 0.7, 'sine', 0.25]], vol)
        richTone(ctx, 1046.5, 0.5, 0.8, 'triangle', 0.22, [[2, 0.6, 'sine', 0.25]], vol)
      } else if (key === 'success') {
        // 成功：明快 G5 → C6 双音
        richTone(ctx, 783.99, 0.02, 0.2, 'sine', 0.2, [[2, 0.7, 'sine', 0.3]], vol)
        richTone(ctx, 1046.5, 0.16, 0.75, 'sine', 0.2, [[2, 0.6, 'sine', 0.25]], vol)
      } else {
        tone(ctx, 880, 0.02, 0.4, 'sine', 0.2, undefined, vol)
      }
    }

    /* ---------------- 本地文件播放（Web Audio 解码，绕开 HTMLAudioElement 自动播放限制） ---------------- */
    var decodedCache = new Map() // audio id -> AudioBuffer（同一文件不重复解码）

    /** 把已解码的 AudioBuffer 播进当前 AudioContext（音量经 GainNode）。 */
    function playBuffer(ctx, decoded, vol) {
      try {
        var src = ctx.createBufferSource()
        src.buffer = decoded
        var g = ctx.createGain()
        g.gain.value = (typeof vol === 'number' && vol >= 0 && vol <= 1) ? vol : 1
        src.connect(g)
        g.connect(ctx.destination)
        src.start()
      } catch (err) { /* 播放失败静默 */ }
    }

    /** 播放 data URL 音频：优先 XHR + decodeAudioData 走 Web Audio（无需每次手势）；失败回退 Audio 元素。 */
    function playCustom(dataUrl, vol) {
      var ctx = ensureContext()
      if (!ctx || typeof ctx.decodeAudioData !== 'function') { fallbackAudio(dataUrl, vol); return }
      var xhr = null
      try {
        xhr = new window.XMLHttpRequest()
        xhr.open('GET', dataUrl, true)
        xhr.responseType = 'arraybuffer'
        xhr.onload = function () {
          if ((xhr.status === 200 || xhr.status === 0) && xhr.response) {
            ctx.decodeAudioData(xhr.response, function (decoded) {
              playBuffer(ctx, decoded, vol)
            }, function () { fallbackAudio(dataUrl, vol) })
          } else {
            fallbackAudio(dataUrl, vol)
          }
        }
        xhr.onerror = function () { fallbackAudio(dataUrl, vol) }
        xhr.send()
      } catch (err) { fallbackAudio(dataUrl, vol) }
    }

    /** 兜底：HTMLAudioElement 播放（可能被自动播放策略拦截）。 */
    function fallbackAudio(dataUrl, vol) {
      try {
        var audio = new window.Audio(dataUrl)
        if (typeof vol === 'number' && vol >= 0 && vol <= 1) audio.volume = vol
        var p = audio.play()
        if (p && p.catch) p.catch(function () {})
      } catch (err) { /* 自动播放被浏览器拦截时静默 */ }
    }

    /* ---------------- IndexedDB 音频库（本地文件，避开 localStorage 配额） ---------------- */
    var audioCache = new Map() // audio id -> data URL
    var audioDbPromise = null

    function audioStore() {
      if (audioDbPromise === null) audioDbPromise = openAudioDb()
      return audioDbPromise
    }

    function openAudioDb() {
      try {
        if (typeof window.indexedDB === 'undefined') return Promise.resolve(null)
        return new Promise(function (resolve) {
          var req = window.indexedDB.open('dsh-sound-audio', 1)
          req.onupgradeneeded = function () {
            var db = req.result
            if (!db.objectStoreNames.contains('files')) db.createObjectStore('files')
          }
          req.onsuccess = function () { resolve(req.result) }
          req.onerror = function () { resolve(null) }
          req.onblocked = function () { resolve(null) }
        })
      } catch (err) { return Promise.resolve(null) }
    }

    /** 记录兼容：0.3.0 起存 { blob, name }；旧数据为裸 Blob。 */
    function blobOf(record) {
      return record && record.blob !== undefined ? record.blob : record
    }

    /** 保存一个音频文件到 IndexedDB，返回 `audio:<id>` 引用；存储不可用时返回 data URL。 */
    function storeUploaded(file) {
      if (typeof window.indexedDB !== 'undefined') {
        return saveAudio(file).then(function (id) {
          return id ? 'audio:' + id : readAsDataUrl(file)
        })
      }
      return readAsDataUrl(file)
    }

    function saveAudio(file) {
      return audioStore().then(function (db) {
        if (!db) return null
        var id = 'a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
        return new Promise(function (resolve) {
          var tx = db.transaction('files', 'readwrite')
          tx.objectStore('files').put({ blob: file, name: (file && typeof file.name === 'string' && file.name) || '' }, id)
          tx.oncomplete = function () { resolve(id) }
          tx.onerror = function () { resolve(null) }
          tx.onabort = function () { resolve(null) }
        })
      })
    }

    function loadAudio(id) {
      if (audioCache.has(id)) return Promise.resolve(audioCache.get(id))
      return audioStore().then(function (db) {
        if (!db) return null
        return new Promise(function (resolve) {
          var req = db.transaction('files', 'readonly').objectStore('files').get(id)
          req.onsuccess = function () {
            var blob = blobOf(req.result)
            if (!blob) { resolve(null); return }
            var reader = new window.FileReader()
            reader.onload = function () {
              var url = String(reader.result)
              audioCache.set(id, url)
              resolve(url)
            }
            reader.onerror = function () { resolve(null) }
            reader.readAsDataURL(blob)
          }
          req.onerror = function () { resolve(null) }
        })
      })
    }

    /** 读取音频文件的原文件名（设置面板展示用）。 */
    function loadAudioMeta(id) {
      return audioStore().then(function (db) {
        if (!db) return ''
        return new Promise(function (resolve) {
          var req = db.transaction('files', 'readonly').objectStore('files').get(id)
          req.onsuccess = function () {
            var record = req.result
            resolve(record && typeof record.name === 'string' ? record.name : '')
          }
          req.onerror = function () { resolve('') }
        })
      })
    }

    function removeAudio(id) {
      audioCache.delete(id)
      decodedCache.delete(id)
      return audioStore().then(function (db) {
        if (!db) return
        try {
          db.transaction('files', 'readwrite').objectStore('files').delete(id)
        } catch (err) { /* 存储不可用时忽略 */ }
      })
    }

    function readAsDataUrl(file) {
      return new Promise(function (resolve) {
        var reader = new window.FileReader()
        reader.onload = function () { resolve(String(reader.result)) }
        reader.onerror = function () { resolve('') }
        reader.readAsDataURL(file)
      })
    }

    /** 读取 IndexedDB 中的原始音频 Blob。 */
    function loadAudioBlob(id) {
      return audioStore().then(function (db) {
        if (!db) return null
        return new Promise(function (resolve) {
          var req = db.transaction('files', 'readonly').objectStore('files').get(id)
          req.onsuccess = function () { resolve(blobOf(req.result) || null) }
          req.onerror = function () { resolve(null) }
        })
      })
    }

    /**
     * 播放 IndexedDB 音频引用：Web Audio decodeAudioData（与合成音共用已解锁的
     * AudioContext，事件触发也能响，不受 HTMLAudioElement 自动播放策略限制）。
     */
    function playAudioRef(id, vol) {
      var ctx = ensureContext()
      if (!ctx || typeof ctx.decodeAudioData !== 'function' || typeof window.FileReader !== 'function') {
        // 无 Web Audio 解码能力：回退 data URL + Audio 元素
        loadAudio(id).then(function (url) { if (url) fallbackAudio(url, vol) })
        return
      }
      if (decodedCache.has(id)) { playBuffer(ctx, decodedCache.get(id), vol); return }
      loadAudioBlob(id).then(function (blob) {
        if (!blob) return
        var reader = new window.FileReader()
        reader.onload = function () {
          ctx.decodeAudioData(reader.result, function (decoded) {
            decodedCache.set(id, decoded)
            playBuffer(ctx, decoded, vol)
          }, function () { /* 解码失败静默 */ })
        }
        reader.onerror = function () {}
        reader.readAsArrayBuffer(blob)
      })
    }

    /* ---------------- 播放（固定同源去抖，无合并窗口） ---------------- */
    var DEDUPE_MS = 400 // 同一来源（同一次回合/任务/审批）短时间去抖，防重复帧；不再提供合并窗口
    var PRUNE_AFTER = 300000 // 5 分钟：去抖表只保留近期 key，防 key 无限增长
    // 已保留会话的回合结束：等 turn/end 原因到达再判定，避免把「用户停止」误报成完成
    var TURN_END_SETTLE_MS = 500
    var playCount = 0

    /* ---------------- 多标签页去重（BroadcastChannel） ---------------- */
    var crossTab = null
    var peerSeen = false // 只有确认存在另一标签时才做 40ms 握手
    var crossTabPending = new Map() // sourceKey -> { nonce, timer }
    try {
      if (typeof window !== 'undefined' && typeof window.BroadcastChannel === 'function') {
        crossTab = new window.BroadcastChannel('dsh-sound')
        crossTab.onmessage = function (ev) {
          var msg = ev && ev.data
          if (!msg || typeof msg !== 'object') return
          if (msg.t === 'hello') {
            peerSeen = true
            try { crossTab.postMessage({ t: 'hello-ack' }) } catch (err) { /* 频道已关 */ }
            return
          }
          if (msg.t === 'hello-ack') {
            peerSeen = true
            return
          }
          if (msg.t !== 'intent' || typeof msg.key !== 'string') return
          peerSeen = true
          var mine = crossTabPending.get(msg.key)
          // nonce 较大的一方让位：两个标签同时收到对方意图时，恰有一个播放
          if (mine && mine.nonce > msg.nonce) {
            cancelSchedule(mine.timer)
            crossTabPending.delete(msg.key)
          }
        }
        try { crossTab.postMessage({ t: 'hello' }) } catch (err) { /* 频道已关 */ }
      }
    } catch (err) { crossTab = null }

    function pruneLastPlayed() {
      var cutoff = Date.now() - PRUNE_AFTER
      lastPlayed.forEach(function (t, k) { if (t < cutoff) lastPlayed.delete(k) })
    }

    /**
     * 播放一个声音值：
     *   'data:…'        内嵌音频（data URL）
     *   'audio:<id>'    IndexedDB 音频库引用
     *   'local'         本地文件待选（无文件，不播放）
     *   'none'          静音
     *   其余为内置合成音。
     * sourceKey 用于同一来源的去抖；未提供时（试听）不限制。
     */
    function playSound(key, sourceKey, cfg, vol) {
      if (!key || key === 'none' || key === 'local') return
      var volume = typeof vol === 'number' && vol >= 0 && vol <= 1 ? vol : 1
      if (sourceKey) {
        var now = Date.now()
        var last = lastPlayed.get(sourceKey)
        if (last !== undefined && now - last < DEDUPE_MS) return
        lastPlayed.set(sourceKey, now)
      }
      playCount++
      if (playCount % 32 === 0) pruneLastPlayed()
      if (key.indexOf('data:') === 0) playCustom(key, volume)
      else if (key.indexOf('audio:') === 0) playAudioRef(key.slice(6), volume)
      else playBuiltin(key, volume)
    }

    /** 试听 / 上传后立即播放：跳过同源去抖。 */
    function playImmediate(key, cfg, vol) {
      playSound(key, undefined, cfg, vol)
    }

    /** 事件播放入口：按事件类型与来源（主 agent / 子代理）解析声音与音量。 */
    function soundFor(cfg, kind, isSubagent) {
      var field = soundFieldFor(kind, isSubagent)
      var value = field && cfg ? cfg[field] : undefined
      if (!value) return isSubagent ? 'none' : (SOUND_DEFAULT[kind] || 'ding')
      return value
    }

    function volFor(cfg, kind, isSubagent) {
      var field = volFieldFor(kind, isSubagent)
      var v = field && cfg ? cfg[field] : undefined
      return typeof v === 'number' ? v : 1
    }

    function playFor(cfg, kind, sourceKey, isSubagent) {
      if (!cfg || cfg.enabled === false) return
      if (isSubagent && cfg.ignoreSubagent === true) return
      var sound = soundFor(cfg, kind, isSubagent)
      if (!sound || sound === 'none' || sound === 'local') return
      if (crossTab && sourceKey) {
        playWithCrossTabDedupe(sound, sourceKey, cfg, volFor(cfg, kind, isSubagent))
        return
      }
      playSound(sound, sourceKey, cfg, volFor(cfg, kind, isSubagent))
    }

    /**
     * 多标签页去重：已确认有同伴时先广播「播放意图」，40ms 内同 key 的另一标签
     * 抢先则让位（随机 nonce 决出唯一播放者）。单标签页直接播放，不做握手。
     */
    function playWithCrossTabDedupe(key, sourceKey, cfg, vol) {
      if (!peerSeen) {
        try { crossTab.postMessage({ t: 'intent', key: sourceKey, nonce: Math.random() }) } catch (err) { /* 频道已关 */ }
        playSound(key, sourceKey, cfg, vol)
        return
      }
      var nonce = Math.random()
      var timer = schedule(function () {
        crossTabPending.delete(sourceKey)
        playSound(key, sourceKey, cfg, vol)
      }, 40)
      crossTabPending.set(sourceKey, { nonce: nonce, timer: timer })
      try { crossTab.postMessage({ t: 'intent', key: sourceKey, nonce: nonce }) } catch (err) { /* 频道已关 */ }
    }

    function configOf(snapshot) {
      if (!snapshot || snapshot.status !== 'ready' || !snapshot.value) return undefined
      return snapshot.value
    }

    /* ---------------- 事件检测（DSH 0.2.x 客户端事件面） ----------------
     * 0.1.5 的 connection.api.events.mux / events.host 与 approval/requested、
     * question/requested、session/jobs 帧在 0.2.x 已全部移除，浏览器侧改为：
     *   1. 需要人介入：ctx.uiSession.sessionStatus 按会话发布的 pendingInteraction
     *      （kind = approval | question | plan-review，带稳定 key）。以 key 判定
     *      「新请求」，刷新恢复与重连回放不重响。
     *   2. 回合结束：对已保留（binding）的会话读 eventSource 的 turn/end 原因，
     *      区分完成 / 失败 / 用户停止；未保留的会话只剩 running 变化，按完成处理
     *      （0.2.x 客户端不再提供全局会话事件流）。
     *   3. 回合外失败：Remote 事件 api-session/error。
     *   4. 目标受阻：sessions.list 的 goal 投影 phase。
     *
     * 结束原因分类与 dsh-client-ui-chat 的 turn-error 行一致：
     *   completed → 完成；error / interrupted / aborted(hook) → 失败；
     *   aborted(user|parent|disposed|legacy) → 用户停止（默认静音，可单独配置）；
     *   blocked / max-tokens / forked → 不响。
     */

    /** pendingInteraction.kind → 声音类型（未知 kind 按普通提问处理）。 */
    function pendingSoundKind(pending) {
      var kind = pending && typeof pending.kind === 'string' ? pending.kind : ''
      if (kind === 'approval' || kind === 'plan-review') return kind
      return 'question'
    }

    /** turn/end 的 reason → 声音类型；'' 表示这类结束不播。 */
    function turnEndSoundKind(reason) {
      if (!reason || typeof reason !== 'object') return ''
      if (reason.kind === 'completed') return 'completion'
      if (reason.kind === 'error') return 'failure'
      // 进程异常退出后补写的收尾：只会在历史里出现，实时不会触发
      if (reason.kind === 'interrupted') return 'failure'
      if (reason.kind === 'aborted') {
        var cause = reason.reason && reason.reason.kind
        // 外部 hook 取消（如账号登出）算异常中断；其余取消都是预期内的停止
        return cause === 'hook' ? 'failure' : 'stopped'
      }
      return ''
    }

    /** 遍历 sessionStatus（Map 或普通对象）快照。 */
    function eachSessionStatus(snapshot, visit) {
      if (!snapshot || typeof snapshot !== 'object') return
      if (typeof snapshot.forEach === 'function') {
        snapshot.forEach(function (value, id) { visit(id, value) })
        return
      }
      for (var id in snapshot) {
        if (Object.prototype.hasOwnProperty.call(snapshot, id)) visit(id, snapshot[id])
      }
    }

    /**
     * 事件检测装配：所有来源都先建基线、之后只响新增，因此刷新恢复、重连回放、
     * 打开历史会话都不会补响。
     */
    function startDetection(ctx, store) {
      var disposed = false
      var offs = []
      var settleTimers = new Map() // sessionId -> 定时器（等 turn/end 原因）
      var watched = new Map() // sessionId -> { binding, source, off, lastSeq }
      var prevPending = new Map() // sessionId -> 已见过的 pendingInteraction.key
      var prevRunning = new Map() // 列表行 running 基线
      var prevGoalPhase = new Map()
      var classified = new Set() // 本次回合结束已由 turn/end 判定（抑制 running 兜底）
      var statusSeeded = false
      var listSeeded = false
      var statusSource = null // uiSession.sessionStatus，由可选注入填充

      function cfgNow() { return configOf(store.getSnapshot()) }

      function listSnapshot() {
        try {
          return ctx.sessions && ctx.sessions.list ? ctx.sessions.list.getSnapshot() : undefined
        } catch (err) { return undefined }
      }

      function bindingOf(sid) {
        try {
          return ctx.sessions && typeof ctx.sessions.binding === 'function' ? ctx.sessions.binding(sid) : undefined
        } catch (err) { return undefined }
      }

      /**
       * 当前正在查看的会话：0.2.x 的列表快照没有 current 字段，
       * 由列表行的 retainedBy.mainView（主视图持有引用）反推。
       */
      function currentSessionId() {
        var snap = listSnapshot()
        if (!snap) return undefined
        if (typeof snap.current === 'string') return snap.current
        var byId = snap.byId || {}
        var ids = Array.isArray(snap.ids) ? snap.ids : []
        for (var i = 0; i < ids.length; i++) {
          var row = byId[ids[i]]
          if (row && row.retainedBy && row.retainedBy.mainView > 0) return ids[i]
        }
        return undefined
      }

      /** quietCurrent 只作用于完成音：当前正在查看的会话不响。 */
      function skipCurrent(cfg, sid) {
        if (!cfg || cfg.quietCurrent !== true) return false
        return currentSessionId() === sid
      }

      function playCompletion(cfg, sid, sourceKey) {
        if (skipCurrent(cfg, sid)) return
        playFor(cfg, 'completion', sourceKey, isSubagentSession(ctx, sid))
      }

      function clearSettle(sid) {
        var timer = settleTimers.get(sid)
        if (timer === undefined) return
        settleTimers.delete(sid)
        cancelSchedule(timer)
      }

      /** 快照里最后一条 turn/end 的 seq：作为「历史不响」的基线。 */
      function latestTurnEndSeq(snapshot) {
        var entries = snapshot && snapshot.entries
        if (!entries || typeof entries.length !== 'number') return -1
        for (var i = entries.length - 1; i >= 0; i--) {
          var entry = entries[i]
          var event = entry && entry.type === 'event' ? entry.event : undefined
          if (event && event.type === 'turn/end' && typeof event.seq === 'number') return event.seq
        }
        return -1
      }

      function onTurnEnd(cfg, sid, seq, reason) {
        classified.add(sid)
        clearSettle(sid)
        var kind = turnEndSoundKind(reason)
        if (!kind) return
        if (kind === 'completion' && skipCurrent(cfg, sid)) return
        playFor(cfg, kind, 'turn:' + sid + ':' + seq, isSubagentSession(ctx, sid))
      }

      function onRunningEnded(cfg, sid) {
        // 已由 turn/end 判定过：不重复
        if (classified.delete(sid)) return
        if (bindingOf(sid)) {
          // 保留会话能拿到真实原因：稍等一拍，避免把用户停止误判成完成
          clearSettle(sid)
          settleTimers.set(sid, schedule(function () {
            settleTimers.delete(sid)
            if (disposed || classified.has(sid)) return
            var next = cfgNow()
            if (next) playCompletion(next, sid, 'status:' + sid)
          }, TURN_END_SETTLE_MS))
          return
        }
        // 没有 binding：只有 running 事实可用，按完成处理（子代理走独立通道）
        playCompletion(cfg, sid, 'status:' + sid)
      }

      function unwatch(sid) {
        var record = watched.get(sid)
        if (!record) return
        watched.delete(sid)
        // 已排队的 settle 不取消：绑定在窗口内被释放时，running 兜底仍应给出完成音
        try { record.off() } catch (err) { /* 已随 binding 释放 */ }
      }

      function watchBinding(sid, binding) {
        var source = binding && binding.eventSource
        if (!source || typeof source.subscribe !== 'function' || typeof source.getSnapshot !== 'function') return
        var record = {
          binding: binding,
          source: source,
          off: null,
          lastSeq: latestTurnEndSeq(source.getSnapshot()),
        }
        record.off = source.subscribe(function () {
          if (disposed) return
          var cfg = cfgNow()
          if (!cfg) return
          var snapshot = source.getSnapshot()
          var change = snapshot && snapshot.change
          // 只处理实时追加；replace（历史加载/重连基线）与 prepend（翻旧页）不响
          if (!change || change.kind !== 'append' || !change.entries) return
          for (var i = 0; i < change.entries.length; i++) {
            var entry = change.entries[i]
            var event = entry && entry.type === 'event' ? entry.event : undefined
            if (!event || event.type !== 'turn/end' || !event.data) continue
            if (typeof event.seq !== 'number' || event.seq <= record.lastSeq) continue
            record.lastSeq = event.seq
            onTurnEnd(cfg, sid, event.seq, event.data.reason)
          }
        })
        watched.set(sid, record)
      }

      /** 绑定出现 / 换代 / 释放时重建监听（保留集合由 UI 维护，没有对应事件）。 */
      function syncBindings() {
        if (disposed) return
        var ids = {}
        var snap = listSnapshot()
        if (snap && Array.isArray(snap.ids)) for (var i = 0; i < snap.ids.length; i++) ids[snap.ids[i]] = true
        prevRunning.forEach(function (value, sid) { ids[sid] = true })
        watched.forEach(function (record, sid) { ids[sid] = true })
        for (var sid in ids) {
          if (!Object.prototype.hasOwnProperty.call(ids, sid)) continue
          var binding = bindingOf(sid)
          var record = watched.get(sid)
          if (!binding) { if (record) unwatch(sid); continue }
          if (record && record.binding === binding) continue
          if (record) unwatch(sid)
          watchBinding(sid, binding)
        }
      }

      /** 需要人介入：pendingInteraction 出现或换成新请求时响对应事件音。 */
      function onStatusChange() {
        if (disposed) return
        syncBindings()
        var cfg = cfgNow()
        var snapshot
        try {
          snapshot = statusSource ? statusSource.getSnapshot() : undefined
        } catch (err) { snapshot = undefined }
        var present = {}
        eachSessionStatus(snapshot, function (sid, status) {
          present[sid] = true
          var pending = status && status.pendingInteraction
          var key = pending ? (typeof pending.key === 'string' ? pending.key : 'anonymous') : undefined
          // review 卡片是已结束提问的只读回看（点开历史提问），不是新请求
          var fresh = pending && pending.review === undefined
          if (statusSeeded && fresh && key !== prevPending.get(sid)) {
            playFor(cfg, pendingSoundKind(pending), 'pending:' + sid + ':' + key, isSubagentSession(ctx, sid))
          }
          if (pending) prevPending.set(sid, key)
          else prevPending.delete(sid)
        })
        prevPending.forEach(function (key, sid) { if (!present[sid]) prevPending.delete(sid) })
        statusSeeded = true
      }

      /** 列表行：running 变化（回合结束的事实）与 goal 投影（目标受阻）。 */
      function onListChange() {
        if (disposed) return
        syncBindings()
        var cfg = cfgNow()
        var snap = listSnapshot()
        if (!snap) return
        var ids = Array.isArray(snap.ids) ? snap.ids : []
        var byId = snap.byId || {}
        for (var i = 0; i < ids.length; i++) {
          var sid = ids[i]
          var row = byId[sid]
          if (!row) continue
          var wasRunning = prevRunning.get(sid)
          var running = row.running === true
          if (listSeeded && wasRunning === true && !running) onRunningEnded(cfg, sid)
          if (running) classified.delete(sid)
          prevRunning.set(sid, running)
          if (!cfg) continue
          var goal = row.projectionValues && row.projectionValues.goal
          var phase = goal && typeof goal === 'object' ? goal.phase : undefined
          var prevPhase = prevGoalPhase.get(sid)
          if (listSeeded && phase === 'blocked' && prevPhase !== 'blocked') {
            playFor(cfg, 'goal-blocked', 'goal:' + sid, isSubagentRow(row))
          }
          prevGoalPhase.set(sid, phase)
        }
        prevRunning.forEach(function (value, sid) { if (ids.indexOf(sid) < 0) prevRunning.delete(sid) })
        prevGoalPhase.forEach(function (value, sid) { if (ids.indexOf(sid) < 0) prevGoalPhase.delete(sid) })
        listSeeded = true
      }

      /** 回合外失败（没有 turn 位置的 agent 错误）。 */
      function onAgentError(sid) {
        if (disposed || typeof sid !== 'string') return
        var cfg = cfgNow()
        if (!cfg) return
        playFor(cfg, 'failure', 'error:' + sid, isSubagentSession(ctx, sid))
      }

      function subscribe(source, fn) {
        if (!source || typeof source.subscribe !== 'function') return
        offs.push(source.subscribe(fn))
      }

      // 1) 列表行：running / goal / 绑定同步（sessions 是必需注入）
      subscribe(ctx.sessions && ctx.sessions.list, function () { onListChange() })
      onListChange()

      // 2) 需要人介入：uiSession 的会话状态投影（可选服务）
      ctx.inject(['uiSession'], function (sctx) {
        if (disposed) return
        var status = sctx.uiSession && sctx.uiSession.sessionStatus
        if (!status || typeof status.subscribe !== 'function') return
        statusSource = status
        subscribe(status, function () {
          if (disposed) return
          onStatusChange()
        })
        onStatusChange()
      })

      // 3) 回合外失败：Remote 事件（可选服务；非 answer peer 会拒绝订阅）
      ctx.inject(['remote'], function (sctx) {
        if (disposed) return
        try {
          offs.push(sctx.remote.$on('api-session/error', function (sid) { onAgentError(sid) }))
        } catch (err) { /* 当前 peer 不参与事件转发：跳过 */ }
      })

      return function () {
        disposed = true
        statusSource = null
        settleTimers.forEach(function (timer) { cancelSchedule(timer) })
        settleTimers.clear()
        watched.forEach(function (record) { try { record.off() } catch (err) { /* 已释放 */ } })
        watched.clear()
        for (var i = 0; i < offs.length; i++) {
          try { offs[i]() } catch (err) { /* 已释放 */ }
        }
        offs.length = 0
      }
    }

    function schedule(fn, ms) {
      if (typeof window !== 'undefined' && typeof window.setTimeout === 'function') return window.setTimeout(fn, ms)
      return setTimeout(fn, ms)
    }

    function cancelSchedule(t) {
      if (t === null || t === undefined) return
      if (typeof window !== 'undefined' && typeof window.clearTimeout === 'function') window.clearTimeout(t)
      else clearTimeout(t)
    }

    /* ---------------- 设置界面 ---------------- */
    function useSnapshot(source) {
      var pair = React.useState(function () { return source.getSnapshot() })
      var setState = pair[1]
      React.useEffect(function () {
        return source.subscribe(function () {
          setState(source.getSnapshot())
        })
      }, [source])
      return pair[0]
    }

    // The client module loader exposes one CJS factory with no relative-module
    // resolver, so the dictionaries intentionally stay in this shipped bundle.
    var LOCALE_NS = 'dsh-sound'
    var DICTS = {
      zh: {
        'sound.ding': '叮咚', 'sound.chime': '风铃', 'sound.bell': '铃铛',
        'sound.complete': '完成', 'sound.success': '成功', 'sound.none': '静音', 'sound.local': '本地文件',
        'event.stopped': '用户停止', 'event.approval': '审批', 'event.question': '提问', 'event.planReview': '计划评审',
        'event.goalBlocked': '目标受阻', 'event.failure': '失败',
        'file.embeddedAudio': '内嵌音频', 'file.noneSelected': '尚未选择文件', 'file.replace': '更换',
        'file.choose': '选择', 'file.clickToPlay': '点击播放',
        'status.configUnavailable': '声音通知配置暂不可用。', 'section.title': '通知音效',
        'tab.mainAgent': '主 Agent', 'tab.subagents': '子代理', 'subagent.ignoreEvents': '忽略子代理事件',
        'transfer.title': '导入 / 导出', 'transfer.export': '导出', 'transfer.import': '导入',
        'control.volume': '音量', 'control.play': '播放',
      },
      en: {
        'sound.ding': 'Ding-dong', 'sound.chime': 'Chime', 'sound.bell': 'Bell',
        'sound.complete': 'Complete', 'sound.success': 'Success', 'sound.none': 'Mute', 'sound.local': 'Local file',
        'event.stopped': 'Stopped', 'event.approval': 'Approval', 'event.question': 'Question', 'event.planReview': 'Plan review',
        'event.goalBlocked': 'Goal blocked', 'event.failure': 'Failure',
        'file.embeddedAudio': 'Embedded audio', 'file.noneSelected': 'No file selected', 'file.replace': 'Replace',
        'file.choose': 'Choose', 'file.clickToPlay': 'Click to play',
        'status.configUnavailable': 'Sound notification settings are unavailable.', 'section.title': 'Notification Sound',
        'tab.mainAgent': 'Main agent', 'tab.subagents': 'Subagents', 'subagent.ignoreEvents': 'Ignore subagent events',
        'transfer.title': 'Import / export', 'transfer.export': 'Export', 'transfer.import': 'Import',
        'control.volume': 'Volume', 'control.play': 'Play',
      },
      'pt-BR': {
        'sound.ding': 'Ding-dong', 'sound.chime': 'Carrilhão', 'sound.bell': 'Sino',
        'sound.complete': 'Conclusão', 'sound.success': 'Sucesso', 'sound.none': 'Silencioso', 'sound.local': 'Arquivo local',
        'event.stopped': 'Interrompido', 'event.approval': 'Aprovação', 'event.question': 'Pergunta', 'event.planReview': 'Revisão do plano',
        'event.goalBlocked': 'Objetivo bloqueado', 'event.failure': 'Falha',
        'file.embeddedAudio': 'Áudio incorporado', 'file.noneSelected': 'Nenhum arquivo selecionado', 'file.replace': 'Substituir',
        'file.choose': 'Escolher', 'file.clickToPlay': 'Clique para reproduzir',
        'status.configUnavailable': 'As configurações de notificações sonoras não estão disponíveis.', 'section.title': 'Som de notificação',
        'tab.mainAgent': 'Agente principal', 'tab.subagents': 'Subagentes', 'subagent.ignoreEvents': 'Ignorar eventos de subagentes',
        'transfer.title': 'Importar / exportar', 'transfer.export': 'Exportar', 'transfer.import': 'Importar',
        'control.volume': 'Volume', 'control.play': 'Reproduzir',
      },
      es: {
        'sound.ding': 'Timbre', 'sound.chime': 'Campanilla', 'sound.bell': 'Campana',
        'sound.complete': 'Completado', 'sound.success': 'Éxito', 'sound.none': 'Silencio', 'sound.local': 'Archivo local',
        'event.stopped': 'Detenido', 'event.approval': 'Aprobación', 'event.question': 'Pregunta', 'event.planReview': 'Revisión del plan',
        'event.goalBlocked': 'Objetivo bloqueado', 'event.failure': 'Fallo',
        'file.embeddedAudio': 'Audio incorporado', 'file.noneSelected': 'No se ha seleccionado ningún archivo', 'file.replace': 'Reemplazar',
        'file.choose': 'Elegir', 'file.clickToPlay': 'Haz clic para reproducir',
        'status.configUnavailable': 'La configuración de notificaciones sonoras no está disponible.', 'section.title': 'Sonido de notificación',
        'tab.mainAgent': 'Agente principal', 'tab.subagents': 'Subagentes', 'subagent.ignoreEvents': 'Ignorar eventos de subagentes',
        'transfer.title': 'Importar / exportar', 'transfer.export': 'Exportar', 'transfer.import': 'Importar',
        'control.volume': 'Volumen', 'control.play': 'Reproducir',
      },
    }

    var SOUND_OPTIONS = [
      { key: 'ding', labelKey: 'sound.ding' }, { key: 'chime', labelKey: 'sound.chime' },
      { key: 'bell', labelKey: 'sound.bell' }, { key: 'complete', labelKey: 'sound.complete' },
      { key: 'success', labelKey: 'sound.success' }, { key: 'none', labelKey: 'sound.none' },
      { key: 'local', labelKey: 'sound.local' },
    ]

    function isLocalValue(value) {
      return typeof value === 'string' && (value === 'local' || value.indexOf('data:') === 0 || value.indexOf('audio:') === 0)
    }

    function soundKeyOf(sound, kind, isSubagent) {
      if (isLocalValue(sound)) return 'local'
      if (BUILTIN_KEYS.indexOf(sound) >= 0) return sound
      return isSubagent ? 'none' : (SOUND_DEFAULT[kind] || 'ding')
    }

    function EnableSwitch(props) {
      var on = props.checked === true
      return React.createElement('button', {
        type: 'button',
        role: 'switch',
        'aria-checked': on ? 'true' : 'false',
        'aria-label': props.label,
        className: 'dns-notify-switch' + (on ? ' is-on' : ''),
        onClick: function () { props.onChange(!on) },
      }, React.createElement('span', { className: 'dns-notify-switch-thumb' }))
    }

    /** 「本地文件」行：选择/更换按钮（隐藏 input）+ 可点击播放的已选文件名。 */
    function LocalFileRow(props) {
      var pair = React.useState('')
      var name = pair[0]
      var setName = pair[1]
      var inputRef = React.useRef(null)
      React.useEffect(function () {
        var alive = true
        setName('')
        if (props.audioId) {
          loadAudioMeta(props.audioId).then(function (n) { if (alive && n) setName(n) })
        }
        return function () { alive = false }
      }, [props.audioId])
      var hasFile = !!props.audioId || props.isData === true
      var label = props.isData ? props.t('file.embeddedAudio') : (name || (props.audioId ? props.t('sound.local') : props.t('file.noneSelected')))
      return React.createElement('div', { className: 'dns-notify-file-row' },
        React.createElement('button', {
          type: 'button',
          className: 'dns-notify-btn dns-notify-btn-sm',
          onClick: function () { if (inputRef.current) inputRef.current.click() },
        }, hasFile ? props.t('file.replace') : props.t('file.choose')),
        React.createElement('input', {
          type: 'file',
          accept: 'audio/*',
          style: { display: 'none' },
          ref: inputRef,
          'aria-label': hasFile ? props.t('file.replace') : props.t('file.choose'),
          onChange: function (ev) {
            var file = ev.target.files && ev.target.files[0]
            ev.target.value = ''
            if (file && props.onPicked) props.onPicked(file)
          },
        }),
        React.createElement('span', {
          className: 'dns-notify-file-name',
          title: hasFile ? props.t('file.clickToPlay') : undefined,
          'aria-label': hasFile ? props.t('control.play') + ': ' + label : undefined,
          onClick: hasFile ? props.onPlay : undefined,
        }, hasFile
          ? [React.createElement('span', { key: 'play', className: 'dns-notify-file-play' }, '\u25B6'), ' ' + label]
          : label))
    }

    /** Radio.Group + Radio.Button：七个分段按钮始终可见，点选即播。 */
    function SoundRadioGroup(props) {
      var buttons = SOUND_OPTIONS.map(function (opt) {
        var checked = props.soundKey === opt.key
        return React.createElement('label', {
          key: opt.key,
          className: 'dns-notify-radio-btn' + (checked ? ' is-checked' : ''),
        },
          React.createElement('input', {
            type: 'radio',
            name: 'dsh-sound-' + props.kind,
            value: opt.key,
            checked: checked,
            onChange: function () { props.onSound(opt.key) },
            onClick: function () { props.onPlay(opt.key) },
          }),
          props.t(opt.labelKey))
      })
      return React.createElement('div', {
        className: 'dns-notify-radio-group',
        role: 'radiogroup',
        'data-kind': props.kind,
        'aria-label': props.label,
      }, buttons)
    }

    /** 单类事件：名称 + 音量一行，下方 Radio.Button 组；选本地文件时再展开文件行。 */
    function EventRow(props) {
      var kind = props.kind
      var isSubagent = props.source === 'subagent'
      var stashKey = subagentKeyFor(kind, isSubagent)
      var sound = props.sound
      var volume = props.volume
      var soundKey = soundKeyOf(sound, kind, isSubagent)
      var audioId = typeof sound === 'string' && sound.indexOf('audio:') === 0 ? sound.slice(6) : null
      var hasLocalFile = isLocalValue(sound) && sound !== 'local'
      var playNow = function () { playImmediate(sound, props.cfg, volume) }
      var playKey = function (key) {
        if (key === 'none') return
        if (key === 'local') {
          var stashed = props.cfg.localFiles && props.cfg.localFiles[stashKey]
          var src = hasLocalFile ? sound : stashed
          if (isFileSound(src)) playImmediate(src, props.cfg, volume)
          return
        }
        if (key === soundKey) playNow()
        else playImmediate(key, props.cfg, volume)
      }
      var fileRow = soundKey === 'local'
        ? React.createElement(LocalFileRow, {
            audioId: audioId,
            isData: typeof sound === 'string' && sound.indexOf('data:') === 0,
            onPicked: props.onPicked,
            onPlay: playNow,
            t: props.t,
          })
        : null
      return React.createElement('div', { className: 'dns-notify-event' },
        React.createElement('div', { className: 'dns-notify-row' },
          React.createElement('span', { className: 'dns-notify-title' }, props.label),
          React.createElement('div', { className: 'dns-notify-controls' },
            React.createElement('input', {
              className: 'dns-notify-range',
              type: 'range',
              min: 0,
              max: 100,
              step: 1,
              value: Math.round((typeof volume === 'number' ? volume : 1) * 100),
              'aria-label': props.t('control.volume') + ': ' + props.label,
              onChange: function (ev) { props.onVolume(parseFloat(ev.target.value) / 100) },
            }),
            React.createElement('span', { className: 'dns-notify-pct' },
              Math.round((typeof volume === 'number' ? volume : 1) * 100) + '%'))),
        React.createElement(SoundRadioGroup, {
          kind: stashKey,
          soundKey: soundKey,
          label: props.label,
          onSound: props.onSound,
          onPlay: playKey,
          t: props.t,
        }),
        fileRow)
    }

    /* ---------------- 配置导入 / 导出 ---------------- */
    function collectAudioRefs(obj, refs, holder, key) {
      if (obj === null || obj === undefined) return
      if (typeof obj === 'string') {
        if (obj.indexOf('audio:') === 0) refs.push({ id: obj.slice(6), holder: holder, key: key })
        return
      }
      if (Array.isArray(obj)) {
        for (var i = 0; i < obj.length; i++) collectAudioRefs(obj[i], refs, obj, i)
        return
      }
      if (typeof obj === 'object') {
        for (var k in obj) {
          if (Object.prototype.hasOwnProperty.call(obj, k)) collectAudioRefs(obj[k], refs, obj, k)
        }
      }
    }

    function downloadJson(data) {
      try {
        var blob = new window.Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
        var url = window.URL.createObjectURL(blob)
        var a = document.createElement('a')
        a.href = url
        a.download = 'dsh-sound-config-' + new Date().toISOString().slice(0, 10) + '.json'
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        window.URL.revokeObjectURL(url)
      } catch (err) { /* 下载不可用时静默 */ }
    }

    /** 导出：IndexedDB 音频引用解析为 data URL 内嵌，得到可移植的完整配置。 */
    function exportConfig(cfg) {
      var out = JSON.parse(JSON.stringify(cfg))
      var refs = []
      collectAudioRefs(out, refs)
      if (refs.length === 0) { downloadJson(out); return }
      Promise.all(refs.map(function (r) {
        return loadAudio(r.id).then(function (url) { r.url = url || '' })
      })).then(function () {
        for (var i = 0; i < refs.length; i++) {
          refs[i].holder[refs[i].key] = refs[i].url
        }
        downloadJson(out)
      })
    }

    function importConfig(file, store) {
      var reader = new window.FileReader()
      reader.onload = function () {
        try {
          var parsed = JSON.parse(String(reader.result))
          if (parsed && typeof parsed === 'object') store.replace(parsed)
        } catch (err) { /* 无效 JSON：忽略 */ }
      }
      reader.onerror = function () {}
      reader.readAsText(file)
    }

    function makeSection(store, locale, t) {
      function Section() {
        var settingsSnap = useSnapshot(store)
        useSnapshot(locale)
        var cfg = configOf(settingsSnap)
        var importRef = React.useRef(null)
        var tabPair = React.useState('main')

        if (!cfg) {
          return React.createElement('div', { className: 'dns-notify-page' },
            React.createElement('div', { className: 'dns-notify-hint' }, t('status.configUnavailable')))
        }

        var setField = function (field, value) {
          var p = store.set(field, value)
          if (p && p.catch) p.catch(function () {})
        }
        var setSound = function (kind, value, source) {
          var isSubagent = source === 'subagent'
          var field = soundFieldFor(kind, isSubagent)
          var stashKey = subagentKeyFor(kind, isSubagent)
          var cur = cfg[field]
          var files = Object.assign({}, cfg.localFiles || {})
          var patch = {}
          if (value === 'local') {
            var stashed = files[stashKey]
            patch[field] = isFileSound(stashed) ? stashed : (isFileSound(cur) ? cur : 'local')
            store.patch(patch)
            return
          }
          if (isFileSound(cur)) files[stashKey] = cur
          patch[field] = value
          patch.localFiles = files
          store.patch(patch)
        }
        var setVolume = function (kind, value, source) { setField(volFieldFor(kind, source === 'subagent'), value) }
        var onPicked = function (kind, file, source) {
          var isSubagent = source === 'subagent'
          var field = soundFieldFor(kind, isSubagent)
          var stashKey = subagentKeyFor(kind, isSubagent)
          storeUploaded(file).then(function (value) {
            if (!value) return
            var c0 = configOf(store.getSnapshot())
            var prev = c0 && c0[field]
            var stashed = c0 && c0.localFiles && c0.localFiles[stashKey]
            if (prev && prev.indexOf('audio:') === 0 && prev !== value) removeAudio(prev.slice(6))
            else if (stashed && stashed.indexOf('audio:') === 0 && stashed !== value && stashed !== prev) {
              removeAudio(stashed.slice(6))
            }
            var files = Object.assign({}, (c0 && c0.localFiles) || {})
            files[stashKey] = value
            var picked = { localFiles: files }
            picked[field] = value
            store.patch(picked)
            var c = configOf(store.getSnapshot())
            if (c) playImmediate(value, c, volFor(c, kind, isSubagent))
          })
        }

        var buildEventRows = function () {
          return EVENT_TABLE.map(function (e) {
            return React.createElement(EventRow, {
              key: e.kind,
              kind: e.kind,
              source: 'main',
              label: t(e.labelKey),
              t: t,
              cfg: cfg,
              sound: cfg[SOUND_FIELD[e.kind]],
              volume: cfg[VOL_FIELD[e.kind]],
              onSound: function (v) { setSound(e.kind, v, 'main') },
              onVolume: function (v) { setVolume(e.kind, v, 'main') },
              onPicked: function (file) { onPicked(e.kind, file, 'main') },
            })
          })
        }

        var buildSubagentRows = function () {
          return EVENT_TABLE.map(function (e) {
            return React.createElement(EventRow, {
              key: 'subagent-' + e.kind,
              kind: e.kind,
              source: 'subagent',
              label: t(e.labelKey),
              t: t,
              cfg: cfg,
              sound: cfg[SUBAGENT_SOUND_FIELD[e.kind]],
              volume: cfg[SUBAGENT_VOL_FIELD[e.kind]],
              onSound: function (v) { setSound(e.kind, v, 'subagent') },
              onVolume: function (v) { setVolume(e.kind, v, 'subagent') },
              onPicked: function (file) { onPicked(e.kind, file, 'subagent') },
            })
          })
        }

        var enabled = cfg.enabled !== false
        var ignoreSubagent = cfg.ignoreSubagent === true
        var tab = tabPair[0]
        var setTab = tabPair[1]
        var tabClass = function (key) {
          return 'dns-notify-tab' + (tab === key ? ' is-active' : '')
        }
        return React.createElement('div', { className: 'dns-notify-page' },
          React.createElement('div', { className: 'dns-notify-row' },
            React.createElement('span', { className: 'dns-notify-title' }, t('section.title')),
            React.createElement(EnableSwitch, {
              checked: enabled,
              label: t('section.title'),
              onChange: function (next) { setField('enabled', next) },
            })),
          React.createElement('div', { className: 'dns-notify-tabs', role: 'tablist' },
            React.createElement('button', {
              type: 'button',
              role: 'tab',
              'aria-selected': tab === 'main' ? 'true' : 'false',
              className: tabClass('main'),
              onClick: function () { setTab('main') },
            }, t('tab.mainAgent')),
            React.createElement('button', {
              type: 'button',
              role: 'tab',
              'aria-selected': tab === 'subagent' ? 'true' : 'false',
              className: tabClass('subagent'),
              onClick: function () { setTab('subagent') },
            }, t('tab.subagents'))),
          tab === 'main'
            ? React.createElement('div', {
                className: 'dns-notify-events' + (enabled ? '' : ' is-disabled'),
              }, buildEventRows())
            : React.createElement('div', null,
                React.createElement('div', { className: 'dns-notify-row' },
                  React.createElement('span', { className: 'dns-notify-title' }, t('subagent.ignoreEvents')),
                  React.createElement(EnableSwitch, {
                    checked: ignoreSubagent,
                    label: t('subagent.ignoreEvents'),
                    onChange: function (next) { setField('ignoreSubagent', next) },
                  })),
                React.createElement('div', {
                  className: 'dns-notify-events' + (enabled && !ignoreSubagent ? '' : ' is-disabled'),
                }, buildSubagentRows())),
          React.createElement('div', { className: 'dns-notify-row' },
            React.createElement('span', { className: 'dns-notify-title' }, t('transfer.title')),
            React.createElement('div', { className: 'dns-notify-controls' },
              React.createElement('button', {
                type: 'button',
                className: 'dns-notify-btn',
                onClick: function () { exportConfig(cfg) },
              }, t('transfer.export')),
              React.createElement('button', {
                type: 'button',
                className: 'dns-notify-btn',
                onClick: function () { if (importRef.current) importRef.current.click() },
              }, t('transfer.import')),
              React.createElement('input', {
                type: 'file',
                accept: '.json,application/json',
                style: { display: 'none' },
                ref: importRef,
                onChange: function (ev) {
                  var file = ev.target.files && ev.target.files[0]
                  ev.target.value = ''
                  if (file) importConfig(file, store)
                },
              }))))
      }
      return Section
    }

    /* ---------------- 插件主体 ---------------- */
    var inject = ['slots', 'sessions', 'locale']

    function apply(ctx) {
      if (crossTab) {
        try { crossTab.postMessage({ t: 'hello' }) } catch (err) { /* 频道已关 */ }
      }
      ctx.effect(function () {
        var locales = ctx.locale.getLocale().locales
        var hasLocale = function (id) {
          var target = id.toLowerCase()
          return locales.some(function (locale) { return String(locale.id).toLowerCase() === target })
        }
        var disposers = [
          hasLocale('pt-BR') ? function () {} : ctx.locale.addLanguage({ id: 'pt-BR', label: 'Português (Brasil)', fallback: 'en' }),
          hasLocale('es') ? function () {} : ctx.locale.addLanguage({ id: 'es', label: 'Español', fallback: 'en' }),
          ctx.locale.register(LOCALE_NS, 'zh', DICTS.zh),
          ctx.locale.register(LOCALE_NS, 'en', DICTS.en),
          ctx.locale.register(LOCALE_NS, 'pt-BR', DICTS['pt-BR']),
          ctx.locale.register(LOCALE_NS, 'es', DICTS.es),
        ]
        return function () {
          for (var i = disposers.length - 1; i >= 0; i--) disposers[i]()
        }
      }, 'dsh-sound: locale dictionaries')
      var t = ctx.locale.bind(LOCALE_NS)
      var store = createConfigStore()
      var disposeWatcher = startDetection(ctx, store)
      ctx.effect(function () { return disposeWatcher })
      var Section = makeSection(store, ctx.locale, t)
      ctx.slots.inject('settings.section', function () {
        return ctx.slots.register({
          name: 'settings.section',
          id: 'dsh-sound',
          order: 90,
          label: function () { return t('section.title') },
        }, Section)
      })
    }

    exports.apply = apply
    exports.inject = inject
    return module.exports
  },
})
