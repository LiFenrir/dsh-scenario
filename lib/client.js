window.__ModuleLoader__.load({
	id: "@lifenrir/dsh-scenario",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		const h = react.createElement;
		const { useState, useCallback, useSyncExternalStore } = react;

		const inject = ["slots", "settingsScope"];

		/**
		 * 插件目录。分两块：
		 * - base：DeepSeek Harness 运行所需的最小核心插件（只读，恒启用，不给开关）；
		 * - extra：功能插件（可随场景开关）。
		 * id 对应 cordis 补丁层里的本地条目 id（cordis.patch.yml 的 `- id: xxx`）。
		 */
		const PLUGIN_CATALOG = {
			base: [
				{ id: "settings", name: "设置服务", description: "设置命名空间与持久化，配置页的基础" },
				{ id: "session", name: "会话", description: "会话生命周期与持久化存储" },
				{ id: "agent-loop", name: "Agent 循环", description: "模型驱动的任务循环引擎" },
				{ id: "system-prompt", name: "系统提示", description: "组装发给模型的 system prompt" },
				{ id: "tools", name: "工具目录", description: "工具注册与模型可见工具目录" },
				{ id: "api-gateway", name: "API 网关", description: "浏览器到宿主的 RPC 网关" },
				{ id: "webserver", name: "Web 服务器", description: "HTTP 服务与前端静态资源" },
				{ id: "connection", name: "连接", description: "浏览器端的 SSE/API 传输通道" },
				{ id: "client-runtime", name: "客户端运行时", description: "浏览器端 cordis 运行时" },
				{ id: "ui-settings", name: "设置页", description: "设置页外壳与导航" },
			],
			extra: [
				{ id: "pet", name: "宠物", description: "鲸鱼娘宠物，随模型活动反应，可抚摸/喂食" },
				{ id: "ui-skin-center", name: "皮肤中心", description: "皮肤/背景主题的选择与切换" },
				{ id: "ui-layout", name: "VS Code 布局", description: "VS Code 风格布局（文件树/查看器/编辑器）" },
				{ id: "vscode-host-files", name: "VS Code 宿主接口", description: "文件树/查看器/全局人设/MCP 管理的宿主接口" },
			],
		};

		const card = {
			border: "1px solid var(--dsw-alias-border-l1)",
			borderRadius: 8,
			padding: "10px 12px",
			background: "var(--dsw-specific-input-fill, transparent)",
		};
		const secondary = { fontSize: 12, color: "var(--dsw-alias-label-secondary)" };
		const tertiary = { fontSize: 12, color: "var(--dsw-alias-label-tertiary)" };

		/** 开关：受控 pill，禁用态用于只读的 base 插件。 */
		function Switch({ on, disabled, onToggle, label }) {
			return h("button", {
				type: "button",
				role: "switch",
				"aria-checked": on,
				disabled,
				onClick: disabled ? undefined : onToggle,
				style: {
					cursor: disabled ? "not-allowed" : "pointer",
					border: "1px solid var(--dsw-alias-border-l2)",
					borderRadius: 999,
					padding: "2px 12px",
					fontSize: 12,
					fontWeight: 600,
					whiteSpace: "nowrap",
					background: on ? "var(--dsw-alias-state-business-primary)" : "var(--dsw-alias-bg-base)",
					color: on ? "#fff" : "var(--dsw-alias-label-primary)",
					opacity: disabled ? 0.55 : 1,
				},
			}, label ?? (on ? "已开启" : "已关闭"));
		}

		/** 一行插件：名称 + 功能注释，末尾开关。 */
		function PluginRow({ plugin, on, disabled, onToggle }) {
			return h("div", {
				style: {
					display: "flex",
					alignItems: "center",
					gap: 10,
					borderBottom: "1px solid var(--dsw-alias-border-l1)",
					padding: "8px 0",
				},
			},
				h("div", { style: { flex: 1, minWidth: 0 } },
					h("div", { style: { fontSize: 13, fontWeight: 600 } }, plugin.name),
					h("div", { style: { ...secondary, marginTop: 2 } },
						(plugin.id ? plugin.id + " · " : "") + plugin.description)
				),
				h(Switch, {
					on,
					disabled,
					onToggle,
					label: disabled ? "已启用" : undefined,
				})
			);
		}

		/** 场景详情页：首行模型/人设信息，下方 base/extra 插件两组列表。 */
		function ScenarioDetail({ name, sc, value, scope, onBack }) {
			const active = value.active === name;

			const plugins = sc.plugins || [];
			const setPlugins = (ids) => {
				const next = { ...value.scenarios, [name]: { ...sc, plugins: ids } };
				void scope.set("scenarios", next);
			};
			const toggle = (id) => {
				setPlugins(plugins.includes(id) ? plugins.filter((p) => p !== id) : [...plugins, id]);
			};

			// 额外组：目录里的 extra，加上插件清单里目录未收录的 id（手动写入也不丢失）。
			const known = new Set([...PLUGIN_CATALOG.base, ...PLUGIN_CATALOG.extra].map((p) => p.id));
			const extraRows = [
				...PLUGIN_CATALOG.extra,
				...plugins.filter((id) => !known.has(id)).map((id) => ({ id, name: id, description: "" })),
			];

			return h("div", { style: { padding: "12px 16px", display: "flex", flexDirection: "column", gap: 12 } },
				h("button", {
					type: "button",
					onClick: onBack,
					style: {
						alignSelf: "flex-start",
						cursor: "pointer",
						border: "1px solid var(--dsw-alias-border-l2)",
						background: "var(--dsw-alias-bg-base)",
						color: "var(--dsw-alias-label-primary)",
						borderRadius: 6,
						padding: "3px 10px",
						fontSize: 12,
					},
				}, "← 返回"),
				// 首行：模型 / 人设信息
				h("div", { style: card },
					h("div", { style: { display: "flex", alignItems: "center", gap: 8 } },
						h("strong", { style: { fontSize: 14, flex: 1 } }, name),
						active ? h("span", { style: { fontSize: 12, fontWeight: 600, color: "var(--dsw-alias-state-business-primary)" } }, "● 当前") : null
					),
					sc.description ? h("div", { style: { ...secondary, marginTop: 4 } }, sc.description) : null,
					h("div", { style: { ...tertiary, marginTop: 6 } },
						sc.provider + " / " + sc.model + " · " + sc.permission +
						(sc.reasoningEffort ? " · " + sc.reasoningEffort : "")),
					h("div", { style: { ...secondary, marginTop: 6 } }, "人设： " + (sc.persona || ""))
				),
				// 基础插件（只读）
				h("div", null,
					h("div", { style: { fontSize: 12, fontWeight: 600, color: "var(--dsw-alias-label-tertiary)", marginBottom: 4 } },
						"基础插件（运行所需，恒启用）"),
					PLUGIN_CATALOG.base.map((p) => h(PluginRow, { key: p.id, plugin: p, on: true, disabled: true }))
				),
				// 额外插件（可切换）
				h("div", null,
					h("div", { style: { fontSize: 12, fontWeight: 600, color: "var(--dsw-alias-label-tertiary)", marginBottom: 4 } },
						"额外插件（功能插件）"),
					extraRows.length
						? extraRows.map((p) => h(PluginRow, {
							key: p.id,
							plugin: p,
							on: plugins.includes(p.id),
							disabled: false,
							onToggle: () => toggle(p.id),
						}))
						: h("div", { style: secondary }, "暂无额外插件")
				)
			);
		}

		/** 配置栏：罗列场景，点击进入场景详情。 */
		function ConfigSection({ scope }) {
			const subscribe = useCallback((listener) => scope.subscribe(listener), [scope]);
			const getSnapshot = useCallback(() => scope.getSnapshot(), [scope]);
			const snapshot = useSyncExternalStore(subscribe, getSnapshot);
			const [selected, setSelected] = useState(null);
			const value = snapshot && snapshot.value;

			if (!snapshot || snapshot.status !== "ready" || !value || !value.scenarios) {
				return h("div", { style: { padding: "16px 20px", color: "var(--dsw-alias-label-secondary)" } },
					snapshot && snapshot.status === "unavailable"
						? "场景配置不可用（命名空间未暴露给设置页）"
						: "加载中…");
			}

			const names = Object.keys(value.scenarios);
			const current = selected && value.scenarios[selected] ? selected : null;

			if (current !== null) {
				return h(ScenarioDetail, {
					name: current,
					sc: value.scenarios[current],
					value,
					scope,
					onBack: () => setSelected(null),
				});
			}

			const row = (name) => {
				const sc = value.scenarios[name];
				const active = value.active === name;
				const count = (sc.plugins || []).length;
				return h("button", {
					key: name,
					type: "button",
					onClick: () => { setSelected(name); },
					style: {
						width: "100%",
						textAlign: "left",
						cursor: "pointer",
						...card,
						background: active ? "var(--dsw-alias-interactive-bg-hover)" : "var(--dsw-specific-input-fill, transparent)",
					},
				},
					h("div", { style: { display: "flex", alignItems: "center", gap: 8 } },
						h("strong", { style: { flex: 1, fontSize: 13 } }, name),
						active ? h("span", { style: { fontSize: 12, fontWeight: 600, color: "var(--dsw-alias-state-business-primary)" } }, "● 当前") : null,
						h("span", { style: { fontSize: 12, color: "var(--dsw-alias-label-tertiary)" } }, count + " 个插件 >")
					),
					sc.description ? h("div", { style: { ...secondary, marginTop: 4 } }, sc.description) : null,
					h("div", { style: { ...tertiary, marginTop: 4 } },
						sc.provider + " / " + sc.model + " · " + sc.permission)
				);
			};

			return h("div", { style: { padding: "12px 16px", display: "flex", flexDirection: "column", gap: 10 } },
				names.map(row),
				h("div", { style: { ...tertiary, marginTop: 4 } },
					"点击场景进入配置：切换插件即时启用/停止；新增/编辑场景请改 ~/.dsh/settings.yaml 的 scenario 段")
			);
		}

		function apply(ctx) {
			const scope = ctx.settingsScope.bind({ namespace: "scenario" });
			ctx.slots.inject("settings.section", () => ctx.slots.register({
				name: "settings.section",
				id: "scenario",
				order: 30,
				label: () => "配置",
				inject: () => ({ scope }),
			}, ConfigSection));
		}

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
