/**
 * dsh-scenario 宿主端：场景配置管理。
 * - 注册 `scenario` 设置命名空间（active + 各场景的人设/模型/权限/插件）。
 * - 注入场景人设到 systemPrompt（每次组装时读当前场景，切换即时生效）。
 * - 场景切换时把当前场景的模型/权限写入 dsh 默认值（新会话继承）。
 * - 场景切换时按 `plugins` 清单一键启用/停止对应插件（Loader 条目热开关）。
 * - 提供 `/api/scenario/plugins` 路由，向配置页下发自动发现的插件目录（基础/额外）。
 */
import z from 'schemastery'
import { createRequire } from 'node:module'
import { installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings'

/** 插件名（loader 条目用）。 */
const name = 'dsh-scenario'

/** 取一个模块 specifier 的包根名（去掉子路径），用于解析 package.json。 */
function packageRootName(specifier) {
  if (specifier.startsWith('@')) {
    const parts = specifier.split('/')
    return parts.length >= 2 ? parts.slice(0, 2).join('/') : specifier
  }
  return specifier.split('/')[0]
}
/** 依赖服务：settings（写模型/权限默认值）；loader（热开关插件条目）；systemPrompt 走 ctx.inject。 */
const inject = ['settings', 'loader']

/** 场景设置命名空间。 */
const SCENARIO_NAMESPACE = settingsNamespace('scenario')

/** 场景 schema：active + 每个场景的人设/模型/权限/插件清单。 */
const schema = z.object({
  active: z.string().required(),
  scenarios: z.dict(z.object({
    description: z.string(),
    persona: z.string().required(),
    provider: z.string().required(),
    model: z.string().required(),
    reasoningEffort: z.string(),
    permission: z.string().required(),
    /** 该场景启用的插件条目 id 列表（cordis.yml / 补丁层里的本地 id）。 */
    plugins: z.array(z.string()).default([]),
  })),
})

/** 组合层默认值：内置三个场景。 */
const base = {
  active: 'personal',
  scenarios: {
    personal: {
      description: '个人助理',
      persona: 'You are a helpful personal assistant. Be concise and friendly.',
      provider: 'deepseek-official',
      model: 'deepseek-v4-flash',
      permission: 'workspace-write',
      plugins: [],
    },
    dev: {
      description: '开发场景',
      persona: 'You are a coding agent. Your working directory is {{cwd}}.',
      provider: 'deepseek-official',
      model: 'deepseek-v4-flash',
      permission: 'workspace-write',
      plugins: [],
    },
    wiki: {
      description: 'Wiki 管理',
      persona: 'You are a knowledge management assistant. Organize and maintain the wiki.',
      provider: 'deepseek-official',
      model: 'deepseek-v4-flash',
      permission: 'workspace-write',
      plugins: [],
    },
  },
}

function apply(ctx) {
  let read = () => base

  /** 容错写：命名空间未注册（如 boot 早期）时静默失败，切换场景后即生效。 */
  function safeWrite(ns, patch) {
    try {
      void ctx.settings.update(ns, patch).catch(() => {})
    } catch {}
  }

  /** 把当前场景的模型/权限写入 dsh 默认值（影响新会话）。 */
  function applyActive() {
    const s = read()
    const sc = s.scenarios[s.active]
    if (!sc) return
    safeWrite(settingsNamespace('agent-default-model'), {
      provider: sc.provider,
      model: sc.model,
      ...(sc.reasoningEffort ? { reasoningEffort: sc.reasoningEffort } : {}),
    })
    safeWrite(settingsNamespace('permission'), { defaultPreset: sc.permission })
  }

  /**
   * 按场景插件清单对账 Loader 条目：启用当前场景绑定的插件，停用其余被托管插件。
   * 直接调用 Entry.update（不经过 ctx.loader.update），避免把 disabled 状态写回
   * cordis.yml 破坏补丁层组合；每次启动 / 切换时重算，场景插件是唯一权威。
   */
  async function reconcilePlugins() {
    const loader = ctx.loader
    if (!loader) return
    // 等整个 loader 树 settle，避免与并发启动的条目 init 竞态（否则 disable 后
    // 仍在飞的 _initTask 会把插件重新拉起，造成「disabled 却有活 fiber」）。
    try {
      await loader.await()
    } catch {}

    const s = read()
    const scenarios = s.scenarios ?? {}
    const managed = new Set()
    for (const sc of Object.values(scenarios)) {
      for (const id of sc.plugins ?? []) managed.add(id)
    }
    if (managed.size === 0) return

    const active = new Set((scenarios[s.active]?.plugins) ?? [])
    for (const entry of loader.entries()) {
      if (entry.options.group) continue
      // 永不托管自己：用户误把 scenario 写进清单时直接跳过，避免自毁。
      if (entry.fiber === ctx.fiber) continue
      const localId = entry.options.id
      const fullId = entry.id
      if (!managed.has(localId) && !managed.has(fullId)) continue
      const desiredDisabled = !(active.has(localId) || active.has(fullId))
      if (entry.disabled === desiredDisabled) continue
      try {
        await entry.update({ disabled: desiredDisabled }, false, true)
      } catch {
        // 单个条目开关失败（如插件模块损坏）不阻断其余插件对账，下次切换会重试。
      }
    }
  }

  let reconcileTimer = null
  function schedulePlugins() {
    clearTimeout(reconcileTimer)
    reconcileTimer = setTimeout(() => { void reconcilePlugins() }, 0)
  }

  // ── 插件目录：自动发现已安装插件，经 /api/scenario/plugins 下发给配置页 ──
  const requirePkg = createRequire(ctx.baseUrl ?? import.meta.url)
  function resolveDescription(moduleName) {
    try {
      const pkg = requirePkg(packageRootName(moduleName) + '/package.json')
      return typeof pkg?.description === 'string' ? pkg.description : ''
    } catch {
      // 解析不到 package.json（内置 cordis: 项 / 子路径 / 未导出）时给空注释，不阻塞目录。
      return ''
    }
  }

  /** 逐次读取 Loader 条目，实时按 @deepseek-ai 作用域分基础 / 额外两类。 */
  function pluginsCatalog() {
    const baseList = []
    const extraList = []
    for (const entry of ctx.loader.entries()) {
      if (entry.options.group) continue
      if (entry.fiber === ctx.fiber) continue
      const moduleName = entry.options.name
      if (moduleName.startsWith('cordis:')) continue
      const item = {
        id: entry.options.id,
        moduleName,
        description: resolveDescription(moduleName),
      }
      if (moduleName.startsWith('@deepseek-ai/')) baseList.push(item)
      else extraList.push(item)
    }
    return { base: baseList, extra: extraList }
  }

  // 可选依赖 webServer：走 ctx.inject 惰性注册，web 表面就绪时挂载路由，headless 等
  // 无 webServer 的 profile 则永不触发（不阻塞启动，也不要求注入）。
  ctx.inject(['webServer'], (wctx) => {
    wctx.effect(() => wctx.webServer.register({
      kind: 'exact',
      path: '/api/scenario/plugins',
      handler: (req, res) => {
        if (req.method !== 'GET') {
          res.writeHead(405)
          res.end()
          return
        }
        try {
          const body = JSON.stringify(pluginsCatalog())
          res.writeHead(200, { 'content-type': 'application/json', 'content-length': String(Buffer.byteLength(body)) })
          res.end(body)
        } catch (error) {
          const body = JSON.stringify({ error: error instanceof Error ? error.message : String(error) })
          res.writeHead(500, { 'content-type': 'application/json', 'content-length': String(Buffer.byteLength(body)) })
          res.end(body)
        }
      },
    }), 'dsh-scenario: plugin catalog route')
  })

  installSettingsSection(ctx, SCENARIO_NAMESPACE, schema, base, {
    setSource: (get) => { read = get },
    onChange: () => {
      applyActive()
      schedulePlugins()
    },
  })

  // 场景人设：每次组装 prompt 时读当前场景的人设，切换即时生效。
  ctx.inject(['systemPrompt'], (promptCtx) => {
    promptCtx.systemPrompt.section({
      name: 'scenario:persona',
      order: 1,
      text: () => {
        const s = read()
        return s.scenarios[s.active]?.persona ?? ''
      },
    })
  })
}

export { name, inject, apply }
