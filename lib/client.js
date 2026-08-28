window.__ModuleLoader__.load({
	id: "@lifenrir/dsh-scenario",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		const h = react.createElement;
		const { useState, useCallback, useEffect, useSyncExternalStore } = react;

		const inject = ["slots", "settingsScope"];

		const card = {
			border: "1px solid var(--dsw-alias-border-l1)",
			borderRadius: 8,
			padding: "10px 12px",
			background: "var(--dsw-specific-input-fill, transparent)",
		};
		const secondary = { fontSize: 12, color: "var(--dsw-alias-label-secondary)" };
		const tertiary = { fontSize: 12, color: "var(--dsw-alias-label-tertiary)" };
		const button = {
			cursor: "pointer",
			border: "1px solid var(--dsw-alias-border-l2)",
			background: "var(--dsw-alias-bg-base)",
			color: "var(--dsw-alias-label-primary)",
			borderRadius: 6,
			padding: "3px 10px",
			fontSize: 12,
		};

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
					h("div", { style: { fontSize: 13, fontWeight: 600 } }, plugin.id),
					h("div", { style: { ...secondary, marginTop: 2 } },
						(plugin.description || plugin.moduleName || ""))
				),
				h(Switch, {
					on,
					disabled,
					onToggle,
					label: disabled ? "已启用" : undefined,
				})
			);
		}

		/** 场景详情页：首行场景名/描述，下方基础/额外插件两组列表。 */
		function ScenarioDetail({ name, sc, value, scope, catalog, onBack }) {
			const [showBase, setShowBase] = useState(false);
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
			const known = new Set([...catalog.base, ...catalog.extra].map((p) => p.id));
			const extraRows = [
				...catalog.extra,
				...plugins.filter((id) => !known.has(id)).map((id) => ({ id, moduleName: id, description: "" })),
			];

			let extraBlock;
			if (catalog.status === "loading") {
				extraBlock = h("div", { style: secondary }, "加载插件目录…");
			} else if (catalog.status === "error") {
				extraBlock = plugins.length
					? plugins.map((id) => h(PluginRow, {
						key: id,
						plugin: { id, moduleName: id, description: "" },
						on: true,
						disabled: false,
						onToggle: () => toggle(id),
					}))
					: h("div", { style: secondary }, "插件目录加载失败，刷新重试");
			} else {
				extraBlock = extraRows.length
					? extraRows.map((p) => h(PluginRow, {
						key: p.id,
						plugin: p,
						on: plugins.includes(p.id),
						disabled: false,
						onToggle: () => toggle(p.id),
					}))
					: h("div", { style: secondary }, "暂无额外插件");
			}

			return h("div", { style: { padding: "12px 16px", display: "flex", flexDirection: "column", gap: 12 } },
				h("button", { type: "button", onClick: onBack, style: { alignSelf: "flex-start", ...button } }, "← 返回"),
				// 首行：场景名 / 描述
				h("div", { style: card },
					h("div", { style: { display: "flex", alignItems: "center", gap: 8 } },
						h("strong", { style: { fontSize: 14, flex: 1 } }, name),
						active
							? h("span", { style: { fontSize: 12, fontWeight: 600, color: "var(--dsw-alias-state-business-primary)" } }, "● 当前")
							: h("button", {
								type: "button",
								onClick: () => { void scope.set("active", name); },
								style: button,
							}, "设为当前")
					),
					sc.description ? h("div", { style: { ...secondary, marginTop: 4 } }, sc.description) : null
				),
				// 基础插件（只读，默认折叠）
				h("div", null,
					h("button", {
						type: "button",
						onClick: () => { setShowBase((s) => !s); },
						style: { ...button, width: "100%", textAlign: "left", display: "flex", alignItems: "center", gap: 6 },
					},
						h("span", { style: { flex: 1, fontWeight: 600 } },
							"基础插件（运行所需，恒启用" +
							(catalog.status === "ready" ? " · " + catalog.base.length + " 个" : "") + ")"),
						h("span", null, showBase ? "▾" : "▸")
					),
					showBase && catalog.status === "ready"
						? catalog.base.map((p) => h(PluginRow, { key: p.id, plugin: p, on: true, disabled: true }))
						: null
				),
				// 额外插件（可切换）
				h("div", null,
					h("div", { style: { fontSize: 12, fontWeight: 600, color: "var(--dsw-alias-label-tertiary)", marginBottom: 4 } },
						"额外插件（功能插件）"),
					extraBlock
				)
			);
		}

		/** 配置栏：罗列场景，一键切换当前场景或点击进入详情。 */
		function ConfigSection({ scope }) {
			const subscribe = useCallback((listener) => scope.subscribe(listener), [scope]);
			const getSnapshot = useCallback(() => scope.getSnapshot(), [scope]);
			const snapshot = useSyncExternalStore(subscribe, getSnapshot);
			const [selected, setSelected] = useState(null);
			const [catalog, setCatalog] = useState({ status: "loading", base: [], extra: [] });

			useEffect(() => {
				let alive = true;
				fetch("/api/scenario/plugins")
					.then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
					.then((data) => {
						if (!alive) return;
						setCatalog({
							status: "ready",
							base: Array.isArray(data.base) ? data.base : [],
							extra: Array.isArray(data.extra) ? data.extra : [],
						});
					})
					.catch(() => { if (alive) setCatalog({ status: "error", base: [], extra: [] }); });
				return () => { alive = false; };
			}, []);

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
					catalog,
					onBack: () => setSelected(null),
				});
			}

			const row = (name) => {
				const sc = value.scenarios[name];
				const active = value.active === name;
				const count = (sc.plugins || []).length;
				return h("div", {
					key: name,
					onClick: () => { setSelected(name); },
					style: {
						...card,
						cursor: "pointer",
						background: active ? "var(--dsw-alias-interactive-bg-hover)" : "var(--dsw-specific-input-fill, transparent)",
					},
				},
					h("div", { style: { display: "flex", alignItems: "center", gap: 8 } },
						h("strong", { style: { flex: 1, fontSize: 13 } }, name),
						active
							? h("span", { style: { fontSize: 12, fontWeight: 600, color: "var(--dsw-alias-state-business-primary)" } }, "● 当前")
							: h("button", {
								type: "button",
								onClick: (e) => { e.stopPropagation(); void scope.set("active", name); },
								style: button,
							}, "切换"),
						h("span", { style: { fontSize: 12, color: "var(--dsw-alias-label-tertiary)" } }, count + " 插件 ▸")
					),
					sc.description ? h("div", { style: { ...secondary, marginTop: 4 } }, sc.description) : null
				);
			};

			return h("div", { style: { padding: "12px 16px", display: "flex", flexDirection: "column", gap: 10 } },
				names.map(row),
				h("div", { style: { ...tertiary, marginTop: 4 } },
					"「切换」设当前场景，「点击卡片」进入插件配置；新增/编辑场景请改 ~/.dsh/settings.yaml 的 scenario 段")
			);
		}

		function apply(ctx) {
			const scope = ctx.settingsScope.bind({ namespace: "scenario" });
			ctx.slots.inject("settings.section", () => ctx.slots.register({
				name: "settings.section",
				id: "scenario",
				order: 30,
				label: () => "场景",
				inject: () => ({ scope }),
			}, ConfigSection));
		}

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
