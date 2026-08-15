# dsh-scenario

DeepSeek Harness（DSH）场景管理插件：把「人设 + 模型 + 权限」打包成命名场景（如 `dev` / `wiki` / `personal`），在设置页一键热切换。

场景即一组可复用配置，切换后：

- **人设** 通过 `systemPrompt` 注入，**当前会话与新会话立即生效**；
- **模型**（provider / model / reasoning effort）写入 `agent-default-model`，新会话继承；
- **权限**（`workspace-write` / `danger-full-access`）写入 `permission` 预设，新会话继承。

## 功能

- 内置 `personal` / `dev` / `wiki` 三个示例场景，可自行增删。
- 设置页新增「场景」栏，罗列全部场景、标记当前场景、一键切换。
- 切换即时生效，无需重启 `dsh web`。

## 安装

```sh
git clone https://github.com/LiFenrir/dsh-scenario.git
dsh plugin --profile web add link:$(pwd)/dsh-scenario
# 或从 npm：
# dsh plugin --profile web add @lifenrir/dsh-scenario
```

装完重启 `dsh web`，设置页即可看到「场景」栏。

> 宿主端把场景的模型/权限写入 `agent-default-model` / `permission` 两个设置命名空间，需要它们在
> `dsh-host-apiproxy` 的 `WEB_SETTINGS_NAMESPACES` 白名单内（`scenario` 命名空间同样需要）。从源码跑
> 时，确认 `packages/host/apiproxy/src/api-proxy.ts` 的白名单包含 `scenario`（以及 `pet`/`skin-background`
> 等其它插件命名空间）。

## 场景配置

场景配置存在 `~/.dsh/settings.yaml` 的 `scenario` 段：

```yaml
scenario:
  active: dev
  scenarios:
    personal:
      description: 个人助理
      persona: You are a helpful personal assistant. Be concise and friendly.
      provider: deepseek-official
      model: deepseek-v4-flash
      permission: workspace-write
    dev:
      description: 开发场景
      persona: You are a coding agent. Your working directory is {{cwd}}.
      provider: deepseek-official
      model: deepseek-v4-flash
      permission: workspace-write
    wiki:
      description: Wiki 管理
      persona: You are a knowledge management assistant. Organize and maintain the wiki.
      provider: deepseek-official
      model: deepseek-v4-flash
      permission: workspace-write
```

字段：

| 字段 | 必填 | 含义 |
| --- | --- | --- |
| `active` | 是 | 当前场景名 |
| `scenarios.<name>.description` | 否 | 场景说明 |
| `scenarios.<name>.persona` | 是 | 人设（system prompt 文本，支持 `{{cwd}}` 等变量） |
| `scenarios.<name>.provider` | 是 | 模型 provider 路由 |
| `scenarios.<name>.model` | 是 | 模型 id |
| `scenarios.<name>.reasoningEffort` | 否 | 思考强度 |
| `scenarios.<name>.permission` | 是 | `workspace-write` 或 `danger-full-access` |

## 结构

```
dsh-scenario/
├── package.json       # 声明 dsh.bundle + dsh.client
├── cordis.patch.yml   # bundle 补丁层（插入 scenario 行）
└── lib/
    ├── index.js       # 宿主端：场景命名空间 + 人设注入 + 模型/权限传播
    └── client.js      # 浏览器端：设置「场景」栏 UI
```

- **宿主端**（`lib/index.js`）注册 `scenario` 设置命名空间，注入场景人设到 `systemPrompt`，
  场景切换时把模型/权限写入 dsh 默认值。
- **客户端**（`lib/client.js`）注册 `settings.section`（id `scenario`），罗列场景并热切换。

## 许可

MIT
