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

    <div v-if="routes.length > 0" class="tester-card">
      <div class="tester-header">
        <div>
          <h4>Route Tester</h4>
          <p>直接调用当前插件声明的 JSON Route，验证实际返回结果。</p>
        </div>
        <button
          type="button"
          class="tester-button"
          data-test="route-run-button"
          :disabled="running"
          @click="runSelectedRoute"
        >
          {{ running ? '调用中...' : '调用 Route' }}
        </button>
      </div>

      <div class="tester-grid">
        <label class="tester-field">
          <span>Route</span>
          <select v-model="selectedPath" data-test="route-path-select">
            <option v-for="route in routes" :key="route.path" :value="route.path">
              {{ route.path }}
            </option>
          </select>
        </label>
        <label class="tester-field">
          <span>Method</span>
          <select v-model="selectedMethod">
            <option v-for="method in selectedRouteMethods" :key="method" :value="method">
              {{ method }}
            </option>
          </select>
        </label>
        <label class="tester-field tester-span">
          <span>Query</span>
          <input
            v-model="queryText"
            type="text"
            placeholder="conversationId=...&foo=bar"
          >
        </label>
        <label
          v-if="selectedMethod !== 'GET' && selectedMethod !== 'DELETE'"
          class="tester-field tester-span"
        >
          <span>JSON Body</span>
          <textarea
            v-model="bodyText"
            rows="6"
            placeholder='{"message":"hello"}'
          />
        </label>
      </div>

      <p v-if="responseError" class="tester-error">{{ responseError }}</p>
      <div v-if="responseStatus !== null" class="tester-meta">
        <strong>HTTP {{ responseStatus }}</strong>
      </div>
      <pre v-if="responseHeadersText" class="tester-headers">{{ responseHeadersText }}</pre>
      <pre v-if="responseText" class="tester-response">{{ responseText }}</pre>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { JsonValue, PluginRouteDescriptor, PluginRouteMethod } from '@garlic-claw/shared'
import { invokePluginRoute } from '../../api/plugins'

const props = defineProps<{
  pluginName: string
  routes: PluginRouteDescriptor[]
}>()

const selectedPath = ref('')
const selectedMethod = ref<PluginRouteMethod>('GET')
const queryText = ref('')
const bodyText = ref('')
const responseText = ref('')
const responseStatus = ref<number | null>(null)
const responseHeadersText = ref('')
const responseError = ref<string | null>(null)
const running = ref(false)

const selectedRoute = computed(() =>
  props.routes.find((route) => route.path === selectedPath.value) ?? props.routes[0] ?? null,
)
const selectedRouteMethods = computed<PluginRouteMethod[]>(() =>
  selectedRoute.value?.methods ?? ['GET'],
)

watch(
  () => props.routes,
  (routes) => {
    const fallback = routes.find((route) => route.path === selectedPath.value) ?? routes[0] ?? null
    selectedPath.value = fallback?.path ?? ''
    selectedMethod.value = fallback?.methods[0] ?? 'GET'
  },
  { immediate: true },
)

watch(selectedRouteMethods, (methods) => {
  if (!methods.includes(selectedMethod.value)) {
    selectedMethod.value = methods[0] ?? 'GET'
  }
})

watch([selectedPath, selectedMethod], () => {
  clearResponseState()
})

/**
 * 调用当前选中的插件 Route，并把结果格式化到面板里。
 */
async function runSelectedRoute() {
  if (!selectedPath.value) {
    responseError.value = '当前没有可调用的 route'
    responseText.value = ''
    responseStatus.value = null
    responseHeadersText.value = ''
    return
  }

  running.value = true
  clearResponseState()
  try {
    const result = await invokePluginRoute(
      props.pluginName,
      selectedPath.value,
      selectedMethod.value,
      {
        query: queryText.value,
        ...(selectedMethod.value !== 'GET' && selectedMethod.value !== 'DELETE'
          ? {
              body: parseJsonRequestBody(bodyText.value),
            }
          : {}),
      },
    )
    responseStatus.value = result.status
    responseHeadersText.value = formatHeaders(result.headers)
    responseText.value = formatResponse(result.body)
  } catch (error) {
    responseError.value = error instanceof Error ? error.message : '调用 Route 失败'
  } finally {
    running.value = false
  }
}

/**
 * 清空 tester 当前展示的响应状态。
 */
function clearResponseState() {
  responseError.value = null
  responseText.value = ''
  responseStatus.value = null
  responseHeadersText.value = ''
}

/**
 * 将 Route 返回值统一格式化成可读文本。
 * @param value Route 返回值
 * @returns 文本化结果
 */
function formatResponse(value: JsonValue): string {
  return typeof value === 'string'
    ? value
    : JSON.stringify(value, null, 2)
}

/**
 * 将响应头统一格式化成可读文本。
 * @param headers 响应头
 * @returns 文本化结果
 */
function formatHeaders(headers: Record<string, string>): string {
  return Object.keys(headers).length === 0
    ? ''
    : JSON.stringify(headers, null, 2)
}

/**
 * 解析 tester 输入的 JSON body。
 * @param raw 原始输入文本
 * @returns 解析后的 JSON 值
 */
function parseJsonRequestBody(raw: string): JsonValue | null {
  const trimmed = raw.trim()
  if (!trimmed) {
    return null
  }

  try {
    return JSON.parse(trimmed) as JsonValue
  } catch {
    throw new Error('JSON Body 必须是有效 JSON')
  }
}
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

.tester-card {
  display: grid;
  gap: 12px;
  padding: 1rem;
  border-radius: 10px;
  background: var(--bg-input);
}

.tester-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.tester-header p {
  color: var(--text-muted);
  font-size: 0.82rem;
}

.tester-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.tester-field {
  display: grid;
  gap: 6px;
}

.tester-field span {
  font-size: 0.82rem;
  color: var(--text-muted);
}

.tester-span {
  grid-column: 1 / -1;
}

.tester-button {
  background: transparent;
  border: 1px solid var(--border);
}

.tester-error {
  color: var(--danger);
  font-size: 0.84rem;
}

.tester-meta {
  color: var(--text-muted);
  font-size: 0.82rem;
}

.tester-headers,
.tester-response {
  padding: 0.85rem;
  border-radius: 8px;
  background: var(--bg-card);
  color: var(--text-muted);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

@media (max-width: 720px) {
  .route-item {
    grid-template-columns: 1fr;
  }

  .tester-header,
  .tester-grid {
    grid-template-columns: 1fr;
  }
}
</style>
