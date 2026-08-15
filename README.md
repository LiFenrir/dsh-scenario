# dsh-scenario

DeepSeek Harness（DSH）场景管理插件：把「人设 + 模型 + 权限 + 插件」打包成命名场景（如 `dev` / `wiki` / `personal`），在设置页一键热切换。

场景即一组可复用配置，切换后：

- **人设** 通过 `systemPrompt` 注入，**当前会话与新会话立即生效**；
- **模型**（provider / model / reasoning effort）写入 `agent-default-model`，新会话继承；
- **权限**（`workspace-write` / `danger-full-access`）写入 `permission` 预设，新会话继承；
- **插件** 按场景的 `plugins` 清单一键启用，其它被托管插件一并停止（Loader 条目热开关）。

## 功能

- 内置 `personal` / `dev` / `wiki` 三个示例场景，可自行增删。
- 设置页新增「配置」栏（合并了场景与插件管理）：罗列全部场景，行尾「切换」一键设当前场景。
- 点击场景卡片进入**动态配置页**：首行展示模型/人设信息，下方**自动发现已安装插件**并分两组单列表 ——
  - **基础插件**（`@deepseek-ai/*` 运行所需，只读恒启用，默认折叠）；
  - **额外插件**（第三方功能插件，行尾开关一键启用/停止）。
- 切换即时生效，无需重启 `dsh web`。

## 安装

```sh
git clone https://github.com/LiFenrir/dsh-scenario.git
dsh plugin --profile web add link:$(pwd)/dsh-scenario
# 或从 npm：
# dsh plugin --profile web add @lifenrir/dsh-scenario
```

装完重启 `dsh web`，设置页即可看到「配置」栏。

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
      plugins: [pet, ui-skin-center]
    dev:
      description: 开发场景
      persona: You are a coding agent. Your working directory is {{cwd}}.
      provider: deepseek-official
      model: deepseek-v4-flash
      permission: workspace-write
      plugins: [ui-layout, vscode-host-files]
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
| `scenarios.<name>.plugins` | 否 | 该场景启用的插件条目 id 列表（默认 `[]`） |

## 插件绑定

配置页**自动发现已安装插件**：宿主端逐次读取 Loader 条目，按包作用域分两类 —— `@deepseek-ai/*` 归**基础插件**
（只读，恒启用），其余第三方（`@linxin666/*`、`@anoslide/*`、`@lifenrir/*` 等）归**额外插件**（可切换）。插件名取
Loader 条目 id，功能注释取各包 `package.json` 的 `description`。目录经宿主端 `/api/scenario/plugins` 路由实时下发，
无需维护静态清单。

每个场景的 `plugins` 填**额外插件**在 cordis 补丁层里的**本地条目 id**（即 `cordis.patch.yml` / bundle 补丁里
`- id: xxx` 的 `xxx`），例如：

- `pet`、`ui-skin-center`（`dsh-web-ui` 的宠物 / 皮肤中心）；
- `ui-layout`、`vscode-host-files`（`dsh-vscode-layout` 的布局 / 宿主接口）；
- 其它 bundle 补丁插入的条目 id。

切换场景时，插件对账规则：

1. 托管范围 = **所有「额外插件」**（自动发现的第三方条目；`@deepseek-ai/*` 基础插件恒启用，不托管）；
2. 属于当前场景 `plugins` 的条目 → 启用；其余额外插件 → 停用；
3. 场景是额外插件开关的唯一权威 —— 未加入任何场景 `plugins` 的额外插件在场景激活时一律停用（含启动时）。

实现走 Loader 的 `Entry.update`（而非 `ctx.loader.update`），因此**不会把 `disabled` 状态写回 cordis.yml**，补丁层组合保持原样；重启后按当前场景重新对账。

> 注意：热开关停用的是插件的**宿主端**（其 fiber 被 dispose）。浏览器端模块在下次刷新页面时随
> `window.__DSH_BOOT__` 重新合成而卸载；不刷新则已加载的客户端 UI 仍会保留。另请勿把
> `apiproxy`、`ui-settings` 这类基础服务条目写进 `plugins`，否则会停掉设置页本身 —— 基础插件
> 已按 `PLUGIN_CATALOG.base` 归类为只读，配置页不给它们开关。

## 结构

```
dsh-scenario/
├── package.json       # 声明 dsh.bundle + dsh.client
├── cordis.patch.yml   # bundle 补丁层（插入 scenario 行）
└── lib/
    ├── index.js       # 宿主端：场景命名空间 + 人设注入 + 模型/权限传播 + 插件对账 + 插件目录路由
    └── client.js      # 浏览器端：设置「配置」栏（场景列表 → 场景详情：模型/人设 + 自动发现的基础/额外插件开关）
```

- **宿主端**（`lib/index.js`）注册 `scenario` 设置命名空间，注入场景人设到 `systemPrompt`，
  场景切换时把模型/权限写入 dsh 默认值，按 `plugins` 清单对账 Loader 条目启用/停用插件，并经
  `/api/scenario/plugins` 路由实时下发自动发现的插件目录（基础/额外）。
- **客户端**（`lib/client.js`）注册 `settings.section`（id `scenario`，标签「配置」）：场景列表带「切换」按钮，
  点击卡片进入详情页，展示模型/人设信息与自动发现的基础/额外插件两组列表，额外插件行尾开关写入 `plugins`。

## 许可

MIT
