<template>
  <section class="quick-panel">
    <div class="quick-panel-header">
      <div>
        <h2>高级扩展</h2>
        <p>模型与 Persona 路由底层统一走插件系统，这里提供直接入口。</p>
      </div>
    </div>

    <div class="quick-grid">
      <article class="quick-card">
        <span class="quick-kicker">Plugin Config</span>
        <h3>模型路由</h3>
        <p>配置 `provider-router`，按关键字切换 provider/model 或直接短路回复。</p>
        <RouterLink
          class="quick-link"
          :to="{
            name: 'plugins',
            query: {
              plugin: 'builtin.provider-router',
            },
          }"
        >
          打开插件配置
        </RouterLink>
      </article>

      <article class="quick-card">
        <span class="quick-kicker">Persona Settings</span>
        <h3>人设配置</h3>
        <p>Persona 相关入口已提升到独立业务页，里面会解释 `persona-router` 的作用并提供插件配置入口。</p>
        <RouterLink
          class="quick-link"
          :to="{
            name: 'persona-settings',
          }"
        >
          打开 Persona 页面
        </RouterLink>
      </article>
    </div>
  </section>
</template>

<style scoped>
.quick-panel {
  display: grid;
  gap: 14px;
  padding: 18px;
  border-radius: 20px;
  background:
    linear-gradient(135deg, rgba(11, 99, 181, 0.1), rgba(39, 174, 96, 0.08)),
    var(--panel-bg, #ffffff);
  border: 1px solid rgba(15, 23, 42, 0.08);
}

.quick-panel-header h2,
.quick-panel-header p,
.quick-card h3,
.quick-card p {
  margin: 0;
}

.quick-panel-header p {
  margin-top: 6px;
  color: var(--text-muted);
}

.quick-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.quick-card {
  display: grid;
  gap: 10px;
  padding: 16px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.86);
  border: 1px solid rgba(15, 23, 42, 0.08);
}

.quick-kicker {
  font-size: 0.78rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #0b63b5;
}

.quick-card p {
  color: var(--text-muted);
}

.quick-link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: fit-content;
  min-height: 38px;
  padding: 0 14px;
  border-radius: 999px;
  background: #0b63b5;
  color: #ffffff;
  text-decoration: none;
  font-weight: 600;
}

@media (max-width: 900px) {
  .quick-grid {
    grid-template-columns: 1fr;
  }
}
</style>
