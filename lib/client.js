window.__ModuleLoader__.load({
	id: "@lifenrir/dsh-scenario",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		const h = react.createElement;

		const inject = ["slots", "settingsScope"];

		/** 场景设置栏：罗列所有场景 + 当前标记 + 一键热切换。 */
		function ScenarioSection({ scope }) {
			const subscribe = react.useCallback((listener) => scope.subscribe(listener), [scope]);
			const getSnapshot = react.useCallback(() => scope.getSnapshot(), [scope]);
			const snapshot = react.useSyncExternalStore(subscribe, getSnapshot);
			const value = snapshot && snapshot.value;

			if (!snapshot || snapshot.status !== "ready" || !value || !value.scenarios) {
				return h("div", { style: { padding: "16px 20px", color: "var(--dsw-alias-label-secondary)" } },
					snapshot && snapshot.status === "unavailable"
						? "场景配置不可用（命名空间未暴露给设置页）"
						: "加载中…");
			}

			const names = Object.keys(value.scenarios);
			const row = (name) => {
				const sc = value.scenarios[name];
				const active = value.active === name;
				return h("div", {
					key: name,
					style: {
						border: "1px solid var(--dsw-alias-border-l1)",
						borderRadius: 8,
						padding: "10px 12px",
						background: active ? "var(--dsw-alias-interactive-bg-hover)" : "var(--dsw-specific-input-fill, transparent)",
					},
				},
					h("div", { style: { display: "flex", alignItems: "center", gap: 8 } },
						h("strong", { style: { flex: 1, fontSize: 13 } }, name),
						active
							? h("span", { style: { fontSize: 12, fontWeight: 600, color: "var(--dsw-alias-state-business-primary)" } }, "● 当前")
							: h("button", {
								type: "button",
								onClick: () => { void scope.set("active", name); },
								style: {
									cursor: "pointer",
									border: "1px solid var(--dsw-alias-border-l2)",
									background: "var(--dsw-alias-bg-base)",
									color: "var(--dsw-alias-label-primary)",
									borderRadius: 6,
									padding: "3px 12px",
									fontSize: 12,
								},
							}, "切换")
					),
					sc.description
						? h("div", { style: { fontSize: 12, color: "var(--dsw-alias-label-secondary)", marginTop: 4 } }, sc.description)
						: null,
					h("div", { style: { fontSize: 12, color: "var(--dsw-alias-label-tertiary)", marginTop: 4 } },
						sc.provider + " / " + sc.model + " · " + sc.permission)
				);
			};

			return h("div", { style: { padding: "12px 16px", display: "flex", flexDirection: "column", gap: 10 } },
				names.map(row),
				h("div", { style: { fontSize: 12, color: "var(--dsw-alias-label-tertiary)", marginTop: 4 } },
					"人设 / 模型 / 权限随场景热切换；编辑场景配置请改 ~/.dsh/settings.yaml 的 scenario 段")
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
			}, ScenarioSection));
		}

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
