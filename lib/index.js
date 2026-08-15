/**
 * dsh-scenario 宿主端：场景配置管理。
 * - 注册 `scenario` 设置命名空间（active + 各场景的人设/模型/权限）。
 * - 注入场景人设到 systemPrompt（每次组装时读当前场景，切换即时生效）。
 * - 场景切换时把当前场景的模型/权限写入 dsh 默认值（新会话继承）。
 */
import z from 'schemastery'
import { installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings'

/** 插件名（loader 条目用）。 */
const name = 'dsh-scenario'
/** 依赖服务：settings（写模型/权限默认值）；systemPrompt 走 ctx.inject 作用域注入。 */
const inject = ['settings']

/** 场景设置命名空间。 */
const SCENARIO_NAMESPACE = settingsNamespace('scenario')

/** 场景 schema：active + 每个场景的人设/模型/权限。 */
const schema = z.object({
  active: z.string().required(),
  scenarios: z.dict(z.object({
    description: z.string(),
    persona: z.string().required(),
    provider: z.string().required(),
    model: z.string().required(),
    reasoningEffort: z.string(),
    permission: z.string().required(),
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
    },
    dev: {
      description: '开发场景',
      persona: 'You are a coding agent. Your working directory is {{cwd}}.',
      provider: 'deepseek-official',
      model: 'deepseek-v4-flash',
      permission: 'workspace-write',
    },
    wiki: {
      description: 'Wiki 管理',
      persona: 'You are a knowledge management assistant. Organize and maintain the wiki.',
      provider: 'deepseek-official',
      model: 'deepseek-v4-flash',
      permission: 'workspace-write',
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

  installSettingsSection(ctx, SCENARIO_NAMESPACE, schema, base, {
    setSource: (get) => { read = get },
    onChange: () => { applyActive() },
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
