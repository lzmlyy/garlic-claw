<template>
  <section class="route-card">
    <header class="route-header">
      <div>
        <h3>Web Routes</h3>
        <p>插件通过统一协议声明的宿主 HTTP 扩展点。</p>
      </div>
      <span class="route-count">{{ routes.length }} 个</span>
    </header>

    <div v-if="routes.length === 0" class="route-empty">
      当前插件没有声明 Web Route。
    </div>

    <ul v-else class="route-list">
      <li v-for="route in routes" :key="route.path" class="route-item">
        <div class="route-methods">
          <span v-for="method in route.methods" :key="`${route.path}-${method}`" class="method-pill">
            {{ method }}
          </span>
        </div>
        <div class="route-body">
          <strong>/plugin-routes/{{ pluginName }}/{{ route.path }}</strong>
          <p>{{ route.description ?? '未提供额外说明。' }}</p>
        </div>
      </li>
    </ul>
  </section>
</template>

<script setup lang="ts">
import type { PluginRouteDescriptor } from '@garlic-claw/shared'

defineProps<{
  pluginName: string
  routes: PluginRouteDescriptor[]
}>()
</script>

<style scoped>
.route-card {
  display: grid;
  gap: 14px;
  padding: 1rem;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 12px;
}

.route-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.route-header p {
  color: var(--text-muted);
  font-size: 0.88rem;
}

.route-count {
  color: var(--text-muted);
  font-size: 0.82rem;
}

.route-empty {
  color: var(--text-muted);
  font-size: 0.9rem;
}

.route-list {
  display: grid;
  gap: 12px;
  list-style: none;
  padding: 0;
  margin: 0;
}

.route-item {
  display: grid;
  grid-template-columns: 120px minmax(0, 1fr);
  gap: 12px;
  padding: 0.85rem 0.9rem;
  border-radius: 10px;
  background: var(--bg-input);
}

.route-methods {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-content: start;
}

.method-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 48px;
  padding: 0.2rem 0.45rem;
  border-radius: 999px;
  background: rgba(124, 106, 246, 0.16);
  color: var(--accent-hover);
  font-size: 0.75rem;
  font-weight: 600;
}

.route-body {
  display: grid;
  gap: 6px;
  min-width: 0;
}

.route-body strong {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.82rem;
  word-break: break-all;
}

.route-body p {
  color: var(--text-muted);
  font-size: 0.85rem;
}

@media (max-width: 720px) {
  .route-item {
    grid-template-columns: 1fr;
  }
}
</style>
