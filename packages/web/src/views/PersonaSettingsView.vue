<template>
  <div class="persona-page">
    <header class="page-header">
      <div>
        <h1>Persona 设置</h1>
        <p>把会话人设入口从插件底层里提出来，用户直接在业务页理解和切换。</p>
      </div>
      <button class="ghost-button" :disabled="loading" @click="refreshAll">
        {{ loading ? '刷新中...' : '刷新' }}
      </button>
    </header>

    <section class="hero-grid">
      <article class="hero-card">
        <span class="hero-kicker">Current Conversation</span>
        <h2>{{ currentConversationTitle ?? '当前未选中对话' }}</h2>
        <p v-if="currentPersona">
          当前生效 Persona：
          <strong>{{ currentPersona.name }}</strong>
          <span class="persona-source">来源：{{ sourceLabelMap[currentPersona.source] }}</span>
        </p>
        <p v-else>
          当前没有会话级 Persona 信息，页面会回退展示默认 Persona。
        </p>
        <p class="hero-hint">
          {{ hasCurrentConversation
            ? '在左侧对话列表切换会话后，这里的 Persona 状态会跟着刷新。'
            : '先在左侧选中一个对话，再把 Persona 应用到该会话。' }}
        </p>
      </article>

      <article class="hero-card">
        <span class="hero-kicker">Plugin Config</span>
        <h2>Persona 路由插件</h2>
        <p>
          <code>builtin.persona-router</code>
          负责按关键字切换当前会话 Persona。这里保留直接入口，但把它放到 Persona 业务页里解释清楚。
        </p>
        <RouterLink
          class="primary-link"
          :to="{
            name: 'plugins',
            query: {
              plugin: 'builtin.persona-router',
            },
          }"
        >
          打开插件配置
        </RouterLink>
      </article>
    </section>

    <p v-if="error" class="page-error">{{ error }}</p>

    <div class="persona-grid">
      <section class="persona-list-card">
        <div class="section-header">
          <div>
            <span class="section-kicker">Persona Index</span>
            <h2>可用 Persona</h2>
          </div>
          <span class="section-meta">{{ personas.length }} 个</span>
        </div>

        <div v-if="loading" class="section-state">加载中...</div>
        <div v-else-if="personas.length === 0" class="section-state">
          当前还没有可用 Persona。
        </div>
        <div v-else class="persona-list">
          <button
            v-for="persona in personas"
            :key="persona.id"
            class="persona-list-item"
            :class="{ active: persona.id === selectedPersonaId }"
            @click="selectPersona(persona.id)"
          >
            <div class="persona-list-row">
              <strong>{{ persona.name }}</strong>
              <span v-if="persona.isDefault" class="persona-badge">默认</span>
            </div>
            <p>{{ persona.description ?? '当前 Persona 没有额外描述。' }}</p>
            <code>{{ persona.id }}</code>
          </button>
        </div>
      </section>

      <section class="persona-detail-card">
        <div class="section-header">
          <div>
            <span class="section-kicker">Persona Detail</span>
            <h2>{{ selectedPersona?.name ?? '选择一个 Persona' }}</h2>
          </div>
          <button
            class="primary-button"
            :disabled="!canApplySelectedPersona || applyingPersona"
            @click="applySelectedPersona"
          >
            {{ applyingPersona ? '应用中...' : '应用到当前对话' }}
          </button>
        </div>

        <div v-if="!selectedPersona" class="section-state">
          先从左侧选中一个 Persona。
        </div>
        <template v-else>
          <div class="detail-summary">
            <div class="summary-item">
              <span class="summary-label">Persona ID</span>
              <code>{{ selectedPersona.id }}</code>
            </div>
            <div class="summary-item">
              <span class="summary-label">当前会话状态</span>
              <span v-if="loadingCurrentPersona">读取中...</span>
              <span v-else-if="currentPersona">
                {{ currentPersona.personaId === selectedPersona.id ? '当前对话已使用此 Persona' : `当前使用：${currentPersona.name}` }}
              </span>
              <span v-else>未读取到当前会话 Persona</span>
            </div>
          </div>

          <div class="detail-block">
            <span class="summary-label">描述</span>
            <p>{{ selectedPersona.description ?? '当前 Persona 没有额外描述。' }}</p>
          </div>

          <div class="detail-block">
            <span class="summary-label">系统提示词</span>
            <pre class="prompt-box">{{ selectedPersona.prompt }}</pre>
          </div>

          <p class="detail-note">
            Persona 的“路由规则”仍由插件统一承载；业务页负责提供可理解入口，不再要求用户先理解内建插件结构。
          </p>
        </template>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { RouterLink } from 'vue-router'
import { usePersonaSettings } from '../composables/use-persona-settings'

const {
  loading,
  loadingCurrentPersona,
  applyingPersona,
  error,
  personas,
  selectedPersonaId,
  selectedPersona,
  currentPersona,
  currentConversationTitle,
  hasCurrentConversation,
  refreshAll,
  selectPersona,
  applySelectedPersona,
  canApplySelectedPersona,
} = usePersonaSettings()

const sourceLabelMap = {
  context: '上下文覆盖',
  conversation: '会话设置',
  default: '默认回退',
} satisfies Record<'context' | 'conversation' | 'default', string>
</script>

<style scoped>
.persona-page {
  display: grid;
  gap: 18px;
  padding: 1.5rem 2rem;
  height: 100%;
  min-width: 0;
  overflow-y: auto;
}

.page-header,
.hero-grid,
.persona-grid,
.section-header,
.persona-list-row,
.detail-summary {
  display: grid;
  gap: 16px;
}

.page-header {
  grid-template-columns: 1fr auto;
  align-items: start;
}

.page-header h1,
.page-header p,
.hero-card h2,
.hero-card p,
.section-header h2,
.detail-block p,
.detail-note {
  margin: 0;
}

.page-header p,
.hero-hint,
.section-meta,
.persona-list-item p,
.detail-note {
  color: var(--text-muted);
}

.ghost-button,
.primary-button,
.primary-link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 38px;
  padding: 0 14px;
  border-radius: 999px;
  font-weight: 600;
}

.primary-button,
.primary-link {
  background: #0b63b5;
  color: #ffffff;
  text-decoration: none;
}

.ghost-button {
  background: transparent;
  border: 1px solid rgba(15, 23, 42, 0.12);
  color: var(--text);
}

.hero-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.hero-card,
.persona-list-card,
.persona-detail-card {
  display: grid;
  gap: 14px;
  padding: 18px;
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.92);
  border: 1px solid rgba(15, 23, 42, 0.08);
  min-width: 0;
}

.hero-card {
  background:
    linear-gradient(135deg, rgba(11, 99, 181, 0.08), rgba(39, 174, 96, 0.05)),
    rgba(255, 255, 255, 0.95);
}

.hero-kicker,
.section-kicker,
.summary-label {
  font-size: 0.78rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.hero-kicker,
.section-kicker {
  color: #0b63b5;
}

.persona-source,
.persona-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 24px;
  padding: 0 10px;
  border-radius: 999px;
  background: rgba(11, 99, 181, 0.12);
  color: #0b63b5;
  font-size: 0.8rem;
}

.hero-hint {
  font-size: 0.9rem;
}

.page-error {
  margin: 0;
  color: var(--danger);
}

.persona-grid {
  grid-template-columns: 320px minmax(0, 1fr);
}

.section-header {
  grid-template-columns: 1fr auto;
  align-items: start;
}

.section-state {
  color: var(--text-muted);
}

.persona-list {
  display: grid;
  gap: 10px;
}

.persona-list-item {
  display: grid;
  gap: 10px;
  padding: 14px;
  border-radius: 16px;
  border: 1px solid rgba(15, 23, 42, 0.08);
  background: rgba(248, 250, 252, 0.96);
  text-align: left;
}

.persona-list-item.active {
  border-color: rgba(11, 99, 181, 0.42);
  box-shadow: 0 0 0 1px rgba(11, 99, 181, 0.16);
}

.persona-list-row {
  grid-template-columns: 1fr auto;
  align-items: center;
}

.detail-summary {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.summary-item,
.detail-block {
  display: grid;
  gap: 8px;
}

.prompt-box {
  margin: 0;
  padding: 14px;
  border-radius: 16px;
  background: #0f172a;
  color: #e2e8f0;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: 'Cascadia Code', 'Consolas', monospace;
  line-height: 1.55;
}

.detail-note {
  padding-top: 4px;
  border-top: 1px solid rgba(15, 23, 42, 0.08);
}

@media (max-width: 1080px) {
  .hero-grid,
  .persona-grid,
  .detail-summary {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 720px) {
  .persona-page {
    padding: 1rem;
  }

  .page-header,
  .section-header {
    grid-template-columns: 1fr;
  }
}
</style>
