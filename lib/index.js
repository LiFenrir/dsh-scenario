/**
 * dsh-scenario 宿主端：场景配置管理。
 * - 注册 `scenario` 设置命名空间（active + 各场景的人设/模型/权限/插件）。
 * - 注入场景人设到 systemPrompt（每次组装时读当前场景，切换即时生效）。
 * - 场景切换时把当前场景的模型/权限写入 dsh 默认值（新会话继承）。
 * - 场景切换时按 `plugins` 清单一键启用/停止对应插件（Loader 条目热开关）。
 */
import z from 'schemastery'
import { installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings'

/** 插件名（loader 条目用）。 */
const name = 'dsh-scenario'
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
