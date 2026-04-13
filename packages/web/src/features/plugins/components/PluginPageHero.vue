<template>
  <section class="hero-shell">
    <header class="page-header">
      <div class="hero-copy">
        <span class="hero-kicker">Plugin Control Surface</span>
        <h1>插件管理</h1>
        <p>统一管理内建插件与远程插件的配置、作用域、健康和治理动作。</p>
      </div>
      <div class="hero-side">
        <button type="button" class="hero-action" title="刷新全部" @click="$emit('refresh')">
          <Icon :icon="refreshBold" class="refresh-icon" aria-hidden="true" />
        </button>
        <div class="hero-note">
          <span class="hero-note-label">统一协议运行面</span>
          <strong>{{ headline }}</strong>
          <p>内建插件跟随后端启动，远程插件继续通过同一套宿主协议接入与治理。</p>
        </div>
      </div>
    </header>

    <div class="overview-grid">
      <article
        v-for="card in cards"
        :key="card.label"
        class="overview-card"
        :class="card.tone"
      >
        <span class="overview-label">{{ card.label }}</span>
        <strong>{{ card.value }}</strong>
        <p>{{ card.note }}</p>
      </article>
    </div>
  </section>
</template>

<script setup lang="ts">
import { Icon } from '@iconify/vue'
import refreshBold from '@iconify-icons/solar/refresh-bold'

defineProps<{
  headline: string
  cards: Array<{
    label: string
    value: string
    note: string
    tone: string
  }>
}>()

defineEmits<{
  (event: 'refresh'): void
}>()
</script>

<style scoped>
.hero-shell {
  display: grid;
  gap: 14px;
}

.page-header {
  display: grid;
  grid-template-columns: minmax(0, 1.6fr) minmax(260px, 0.9fr);
  gap: 18px;
  position: relative;
  padding: 1.35rem 1.45rem;
  border: 1px solid var(--border);
  border-radius: 24px;
  background:
    linear-gradient(140deg, rgba(20, 34, 54, 0.98), rgba(10, 18, 31, 0.94)),
    linear-gradient(180deg, rgba(255, 255, 255, 0.03), transparent);
  box-shadow: 0 24px 56px rgba(1, 6, 15, 0.32);
  backdrop-filter: blur(18px);
  overflow: hidden;
}

.page-header::after {
  content: '';
  position: absolute;
  inset: 1px;
  border-radius: 23px;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.05), transparent 58%);
  pointer-events: none;
}

.hero-copy,
.hero-side {
  position: relative;
  z-index: 1;
}

.hero-copy {
  display: grid;
  gap: 12px;
}

.hero-kicker,
.overview-label,
.hero-note-label {
  font-size: 0.76rem;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

.hero-kicker {
  color: #93dfe0;
}

.page-header h1 {
  font-size: clamp(1.85rem, 3vw, 2.7rem);
  line-height: 1.08;
  font-family: 'Aptos Display', 'Segoe UI Variable Display', 'Trebuchet MS', 'Segoe UI', sans-serif;
}

.page-header p,
.hero-note p {
  color: var(--text-muted);
}

.page-header p {
  max-width: 60ch;
}

.hero-side {
  display: grid;
  gap: 12px;
  align-content: space-between;
}

.hero-action {
  justify-self: end;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  padding: 0;
  border-radius: 12px;
  background: linear-gradient(135deg, #63c7cd, #4f9ee8);
  box-shadow: 0 12px 28px rgba(52, 116, 168, 0.28);
}

.refresh-icon {
  width: 20px;
  height: 20px;
}

.hero-action:hover:not(:disabled) {
  background: linear-gradient(135deg, #7ad8dc, #6cb5f1);
}

.hero-note {
  display: grid;
  gap: 8px;
  padding: 1rem 1.05rem;
  border-radius: 18px;
  border: 1px solid rgba(133, 163, 199, 0.16);
  background: rgba(9, 17, 29, 0.46);
}

.hero-note-label {
  color: #f0c676;
}

.hero-note strong {
  font-size: 1.25rem;
  line-height: 1.2;
}

.overview-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
}

.overview-card {
  display: grid;
  gap: 10px;
  min-width: 0;
  padding: 1.05rem 1.1rem;
  border: 1px solid var(--border);
  border-radius: 18px;
  background:
    linear-gradient(180deg, rgba(15, 25, 40, 0.96), rgba(10, 17, 29, 0.96)),
    linear-gradient(180deg, rgba(255, 255, 255, 0.02), transparent);
  box-shadow: 0 24px 56px rgba(1, 6, 15, 0.28);
  backdrop-filter: blur(18px);
}

.overview-card strong {
  font-size: clamp(1.35rem, 2vw, 1.85rem);
  line-height: 1.08;
  overflow-wrap: anywhere;
}

.overview-label {
  color: var(--text-muted);
}

.overview-card p {
  color: var(--text-muted);
  font-size: 0.85rem;
}

.overview-card.accent {
  border-color: rgba(103, 199, 207, 0.24);
}

.overview-card.warning {
  border-color: rgba(240, 198, 118, 0.28);
}

.overview-card.warning strong {
  color: #f5d38c;
}

.overview-card.spotlight strong {
  font-size: 1.25rem;
}

@media (max-width: 1280px) {
  .overview-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 720px) {
  .page-header,
  .overview-grid {
    grid-template-columns: 1fr;
  }

  .page-header {
    border-radius: 20px;
  }

  .hero-action {
    width: 100%;
    justify-self: stretch;
  }
}
</style>
