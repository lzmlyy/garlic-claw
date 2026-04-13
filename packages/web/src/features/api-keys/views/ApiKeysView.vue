<template>
  <div class="api-keys-page plugins-page">
    <section class="api-hero">
      <header class="api-hero-header">
        <div>
          <span class="hero-kicker">Scoped API Keys</span>
          <h1>API Key 治理</h1>
          <p>为外部系统创建最小权限凭据，不再复用管理端 JWT。</p>
        </div>
        <div class="api-hero-side">
          <button
            type="button"
            class="hero-action icon-only"
            title="刷新全部"
            @click="refreshAll()"
          >
            <Icon :icon="refreshBold" class="hero-action-icon" aria-hidden="true" />
          </button>
          <div class="hero-note">
            <span class="hero-note-label">当前凭据面</span>
            <strong>{{ activeCount }} 个可用 key</strong>
            <p>先只开放 plugin route 与会话消息写回两类入口，scope 继续收紧。</p>
          </div>
        </div>
      </header>

      <div class="overview-grid">
        <article class="overview-card accent">
          <span class="overview-label">活跃 key</span>
          <strong>{{ activeCount }}</strong>
          <p>仍可被外部系统使用的 scoped key。</p>
        </article>
        <article class="overview-card neutral">
          <span class="overview-label">已撤销</span>
          <strong>{{ revokedCount }}</strong>
          <p>历史 key 不会被删除，只会留下审计痕迹。</p>
        </article>
      </div>
    </section>

    <p v-if="error" class="page-banner error">{{ error }}</p>

    <section v-if="createdToken" class="token-banner">
      <div>
        <span class="panel-kicker">One-time Secret</span>
        <h2>新 token 仅显示一次</h2>
        <p>请立即保存；后续列表只保留 prefix，不会再返回完整 secret。</p>
      </div>
      <textarea readonly :value="createdToken" />
      <button type="button" class="ghost-button" @click="clearCreatedToken()">关闭</button>
    </section>

    <div class="api-layout">
      <section class="api-panel create-panel">
        <div class="panel-header">
          <div>
            <span class="panel-kicker">Create Key</span>
            <h2>创建新 key</h2>
            <p>把 scope 收窄到真正需要的入口，后续再按需扩展。</p>
          </div>
        </div>

        <label class="field">
          <span>名称</span>
          <input
            v-model="formName"
            data-test="api-key-name"
            type="text"
            placeholder="例如：Route Bot / Workflow Bridge"
          >
        </label>

        <label class="field">
          <span>过期时间（可选）</span>
          <input
            v-model="formExpiresAt"
            data-test="api-key-expires-at"
            type="datetime-local"
          >
        </label>

        <div class="field">
          <span>Scopes</span>
          <div class="scope-list">
            <button
              v-for="option in scopeOptions"
              :key="option.value"
              type="button"
              class="scope-card"
              :class="{ active: selectedScopes.includes(option.value) }"
              @click="toggleScope(option.value)"
            >
              <strong>{{ option.label }}</strong>
              <p>{{ option.description }}</p>
            </button>
          </div>
        </div>

        <div class="panel-actions">
          <button
            type="button"
            class="hero-action"
            :disabled="submitting"
            @click="submitCreate()"
          >
            {{ submitting ? '创建中...' : '创建 API key' }}
          </button>
        </div>
      </section>

      <section class="api-panel list-panel">
        <div class="panel-header">
          <div>
            <span class="panel-kicker">Key Ledger</span>
            <h2>当前 key 列表</h2>
            <p>列表只展示 prefix、scope 和最近使用情况，secret 不会二次泄露。</p>
          </div>
        </div>

        <div v-if="loading" class="sidebar-state">加载中...</div>
        <div v-else-if="keys.length === 0" class="sidebar-state">
          当前还没有 API key。
        </div>
        <div v-else class="key-list">
          <article
            v-for="key in keys"
            :key="key.id"
            class="key-card"
            :class="{ revoked: Boolean(key.revokedAt) }"
          >
            <div class="key-card-top">
              <div>
                <div class="key-title-row">
                  <strong>{{ key.name }}</strong>
                  <span class="status-pill" :class="key.revokedAt ? 'error' : 'completed'">
                    {{ key.revokedAt ? '已撤销' : '可用' }}
                  </span>
                </div>
                <p>{{ key.keyPrefix }}</p>
              </div>
              <button
                type="button"
                class="ghost-button"
                :disabled="Boolean(key.revokedAt)"
                @click="revoke(key.id)"
              >
                {{ key.revokedAt ? '已撤销' : '撤销' }}
              </button>
            </div>

            <div class="meta-row">
              <span v-for="scope in key.scopes" :key="scope" class="meta-chip">{{ scope }}</span>
            </div>

            <p class="detail-line muted-text">
              创建于 {{ formatTime(key.createdAt) }}
              <span v-if="key.lastUsedAt"> · 最近使用 {{ formatTime(key.lastUsedAt) }}</span>
            </p>
            <p v-if="key.expiresAt" class="detail-line muted-text">
              过期时间: {{ formatTime(key.expiresAt) }}
            </p>
            <p v-if="key.revokedAt" class="detail-line warning-text">
              已于 {{ formatTime(key.revokedAt) }} 撤销
            </p>
          </article>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Icon } from '@iconify/vue'
import refreshBold from '@iconify-icons/solar/refresh-bold'
import { useApiKeyManagement } from '../composables/use-api-key-management'

const {
  loading,
  submitting,
  error,
  createdToken,
  keys,
  formName,
  formExpiresAt,
  selectedScopes,
  scopeOptions,
  activeCount,
  revokedCount,
  refreshAll,
  submitCreate,
  revoke,
  toggleScope,
  clearCreatedToken,
} = useApiKeyManagement()

function formatTime(iso: string) {
  const date = new Date(iso)
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString().slice(0, 5)}`
}
</script>

<style scoped>
.api-keys-page {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  min-height: 0;
}

.api-hero,
.api-panel,
.token-banner {
  border: 1px solid var(--border);
  border-radius: calc(var(--radius) * 1.2);
  background: var(--bg-card);
  padding: 1rem;
}

.api-hero-header,
.panel-header,
.key-card-top,
.panel-actions,
.meta-row {
  display: flex;
  gap: 0.75rem;
}

.api-hero-header,
.panel-header,
.key-card-top {
  justify-content: space-between;
}

.api-layout,
.api-hero-side,
.scope-list,
.key-list,
.field,
.token-banner {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.api-layout {
  display: grid;
  grid-template-columns: minmax(320px, 360px) minmax(0, 1fr);
  gap: 1rem;
}

.hero-kicker,
.panel-kicker,
.hero-note-label,
.overview-label {
  font-size: 0.75rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.hero-action {
  align-self: flex-start;
}

.hero-action.icon-only {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  padding: 0;
}

.hero-action-icon {
  width: 18px;
  height: 18px;
}

.field span {
  font-weight: 600;
}

.field input,
.token-banner textarea {
  width: 100%;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: rgba(12, 20, 24, 0.04);
  padding: 0.75rem 0.85rem;
  color: var(--text);
  font: inherit;
}

.token-banner textarea {
  min-height: 88px;
  resize: vertical;
}

.scope-list {
  display: grid;
  grid-template-columns: 1fr;
}

.scope-card,
.key-card {
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: rgba(12, 20, 24, 0.03);
  padding: 0.85rem;
}

.scope-card {
  text-align: left;
  transition: border-color 0.15s ease, background 0.15s ease;
}

.scope-card.active {
  border-color: var(--accent);
  background: rgba(103, 199, 207, 0.1);
}

.key-card.revoked {
  opacity: 0.72;
}

.key-title-row {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  flex-wrap: wrap;
}

.detail-line {
  margin: 0;
}

@media (max-width: 960px) {
  .api-layout {
    grid-template-columns: 1fr;
  }
}
</style>
