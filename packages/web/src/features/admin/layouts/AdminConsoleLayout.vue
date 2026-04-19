<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { Icon } from '@iconify/vue'
import type { IconifyIcon } from '@iconify/types'
import widgetBold from '@iconify-icons/solar/widget-5-bold'
import userIdBold from '@iconify-icons/solar/user-id-bold'
import widgetAddBold from '@iconify-icons/solar/widget-add-bold'
import codeBold from '@iconify-icons/solar/code-bold'
import keyboardBold from '@iconify-icons/solar/keyboard-bold'
import cpuBold from '@iconify-icons/solar/cpu-bold'
import magicStick3Bold from '@iconify-icons/solar/magic-stick-3-bold'
import cpuBoltBold from '@iconify-icons/solar/cpu-bolt-bold'
import widget6Bold from '@iconify-icons/solar/widget-6-bold'
import altArrowLeftBold from '@iconify-icons/solar/alt-arrow-left-bold'
import altArrowRightBold from '@iconify-icons/solar/alt-arrow-right-bold'
import chatRoundLineBold from '@iconify-icons/solar/chat-round-line-bold'
import logout3Bold from '@iconify-icons/solar/logout-3-bold'
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()

type SiderMode = 'expanded' | 'compact' | 'hidden'

const SIDER_MODE_STORAGE_KEY = 'garlic-claw:admin-sider-mode'
const DEFAULT_VIEWPORT_WIDTH = 1280
const EXPANDED_SIDER_WIDTH = 200
const COMPACT_SIDER_WIDTH = 64
const HIDDEN_SIDER_WIDTH = 0
const COLLAPSE_RATIO = 0.22
const EXPAND_RATIO = 0.2
const HANDLE_MIN_TOP = 80
const DEFAULT_BOTTOM_OFFSET = 12

function readSiderMode(): SiderMode {
  if (typeof window === 'undefined') {
    return 'compact'
  }

  const savedMode = window.localStorage.getItem(SIDER_MODE_STORAGE_KEY)
  if (savedMode === 'expanded' || savedMode === 'compact' || savedMode === 'hidden') {
    return savedMode
  }

  return 'compact'
}

function saveSiderMode(mode: SiderMode) {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(SIDER_MODE_STORAGE_KEY, mode)
}

const viewportWidth = ref(
  typeof window === 'undefined' ? DEFAULT_VIEWPORT_WIDTH : window.innerWidth,
)
const userPreferredSiderMode = ref<SiderMode>(readSiderMode())
const siderMode = ref<SiderMode>(userPreferredSiderMode.value)
const autoCompact = ref(false)
const handleBottom = ref(DEFAULT_BOTTOM_OFFSET)
const isDragging = ref(false)
const hasMoved = ref(false)
const dragState = reactive({
  startY: 0,
  startBottom: 0,
})

const navItems: Array<{
  name:
    | 'chat'
    | 'plugins'
    | 'persona-settings'
    | 'mcp'
    | 'skills'
    | 'commands'
    | 'subagent-tasks'
    | 'automations'
    | 'ai-settings'
  label: string
  icon: IconifyIcon
  section?: 'core' | 'admin'
}> = [
  { name: 'chat', label: '对话', icon: chatRoundLineBold, section: 'core' },
  { name: 'plugins', label: '插件', icon: widgetBold, section: 'core' },
  { name: 'persona-settings', label: '人设', icon: userIdBold, section: 'core' },
  { name: 'mcp', label: 'MCP', icon: widgetAddBold, section: 'core' },
  { name: 'skills', label: '技能', icon: magicStick3Bold, section: 'core' },
  { name: 'commands', label: '命令', icon: keyboardBold, section: 'core' },
  { name: 'subagent-tasks', label: '后台代理', icon: cpuBold, section: 'core' },
  { name: 'automations', label: '自动化', icon: cpuBoltBold, section: 'admin' },
  { name: 'ai-settings', label: 'AI 设置', icon: codeBold, section: 'admin' },
]

const visibleNavItems = computed(() => navItems)

const isCompact = computed(() => siderMode.value === 'compact')
const isHidden = computed(() => siderMode.value === 'hidden')
const currentSiderWidth = computed(() => {
  if (siderMode.value === 'hidden') {
    return HIDDEN_SIDER_WIDTH
  }
  if (siderMode.value === 'compact') {
    return COMPACT_SIDER_WIDTH
  }

  return EXPANDED_SIDER_WIDTH
})

const triggerText = computed(() => {
  if (isHidden.value) {
    return '展开侧栏'
  }
  if (isCompact.value) {
    return '继续收起'
  }

  return '收起侧栏'
})

const triggerIcon = computed(() => (isHidden.value ? altArrowRightBold : altArrowLeftBold))

function toggleSider() {
  if (isHidden.value) {
    const nextMode: SiderMode = viewportWidth.value > 0
      && EXPANDED_SIDER_WIDTH / viewportWidth.value >= COLLAPSE_RATIO
      ? 'compact'
      : 'expanded'
    userPreferredSiderMode.value = nextMode
    siderMode.value = nextMode
    autoCompact.value = false
    saveSiderMode(nextMode)
    return
  }

  if (isCompact.value) {
    userPreferredSiderMode.value = 'hidden'
    siderMode.value = 'hidden'
    autoCompact.value = false
    saveSiderMode('hidden')
    return
  }

  userPreferredSiderMode.value = 'compact'
  siderMode.value = 'compact'
  autoCompact.value = false
  saveSiderMode('compact')
}

function applyAutoCollapse() {
  if (viewportWidth.value <= 0) {
    return
  }

  if (userPreferredSiderMode.value === 'hidden') {
    siderMode.value = 'hidden'
    autoCompact.value = false
    return
  }

  if (userPreferredSiderMode.value === 'compact') {
    siderMode.value = 'compact'
    autoCompact.value = false
    return
  }

  const ratio = EXPANDED_SIDER_WIDTH / viewportWidth.value
  if (ratio >= COLLAPSE_RATIO) {
    siderMode.value = 'compact'
    autoCompact.value = true
    return
  }

  if (autoCompact.value && ratio <= EXPAND_RATIO) {
    siderMode.value = 'expanded'
    autoCompact.value = false
  }
}

function updateViewportWidth() {
  viewportWidth.value = window.innerWidth
}

function getMaxBottom() {
  return Math.max(DEFAULT_BOTTOM_OFFSET, window.innerHeight - HANDLE_MIN_TOP)
}

function getTouchClientY(event: TouchEvent | MouseEvent) {
  if ('touches' in event && event.touches.length > 0) {
    return event.touches[0].clientY
  }

  if ('clientY' in event) {
    return event.clientY
  }

  return dragState.startY
}

function onHandleStart(event: TouchEvent | MouseEvent) {
  isDragging.value = true
  hasMoved.value = false
  dragState.startY = getTouchClientY(event)
  dragState.startBottom = handleBottom.value
}

function onHandleMove(event: TouchEvent | MouseEvent) {
  if (!isDragging.value) {
    return
  }

  if ('touches' in event) {
    event.preventDefault()
  }

  const clientY = getTouchClientY(event)
  if (Math.abs(clientY - dragState.startY) > 3) {
    hasMoved.value = true
  }

  const deltaY = dragState.startY - clientY
  const nextBottom = dragState.startBottom + deltaY
  handleBottom.value = Math.max(
    DEFAULT_BOTTOM_OFFSET,
    Math.min(getMaxBottom(), nextBottom),
  )
}

function onHandleEnd() {
  isDragging.value = false
  window.setTimeout(() => {
    hasMoved.value = false
  }, 50)
}

function onHandleClick() {
  if (hasMoved.value) {
    return
  }

  toggleSider()
}

function handleLogout() {
  auth.logout()
  void router.push({ name: 'login' })
}

onMounted(() => {
  document.body.style.overflow = 'hidden'
  window.addEventListener('resize', updateViewportWidth)
  window.addEventListener('mousemove', onHandleMove)
  window.addEventListener('mouseup', onHandleEnd)
  window.addEventListener('touchmove', onHandleMove, { passive: false })
  window.addEventListener('touchend', onHandleEnd)
})

onBeforeUnmount(() => {
  document.body.style.overflow = ''
  window.removeEventListener('resize', updateViewportWidth)
  window.removeEventListener('mousemove', onHandleMove)
  window.removeEventListener('mouseup', onHandleEnd)
  window.removeEventListener('touchmove', onHandleMove)
  window.removeEventListener('touchend', onHandleEnd)
})

watch(viewportWidth, applyAutoCollapse, { immediate: true })
</script>

<template>
  <div class="admin-shell">
    <aside
      class="admin-nav"
      :class="{
        'is-compact': isCompact,
        'is-hidden': isHidden,
      }"
      :style="{ width: `${currentSiderWidth}px` }"
    >
      <div class="sider-inner">
        <header class="sider-title">
          <Icon class="sider-title-icon" :icon="widget6Bold" />
          <span class="sider-title-text">控制台</span>
        </header>

        <nav class="sider-menu" aria-label="后台导航">
          <RouterLink
            v-for="item in visibleNavItems"
            :key="item.name"
            class="menu-item"
            :class="{
              active: route.name === item.name,
              'menu-item--admin-start': item.section === 'admin',
            }"
            :to="{ name: item.name }"
            :title="isCompact ? item.label : undefined"
          >
            <Icon class="menu-icon" :icon="item.icon" aria-hidden="true" />
            <span class="menu-label">{{ item.label }}</span>
          </RouterLink>
        </nav>

        <div class="sider-meta">
          <div class="sider-user">
            <span class="sider-user-label">当前模式</span>
            <strong>单用户控制台</strong>
            <small>本机持久登录态</small>
          </div>

          <div class="sider-actions">
            <button type="button" class="sider-action-link" @click="handleLogout">
              <Icon class="sider-action-icon" :icon="logout3Bold" aria-hidden="true" />
              退出登录
            </button>
          </div>
        </div>

        <div
          class="sider-footer"
          :style="isHidden ? { bottom: `calc(${handleBottom}px + var(--app-safe-area-bottom, 0px))` } : undefined"
        >
          <button
            type="button"
            class="sider-trigger"
            :class="{ 'is-dragging': isDragging }"
            :aria-label="triggerText"
            @click="onHandleClick"
            @mousedown="onHandleStart"
            @touchstart="onHandleStart"
          >
            <Icon class="trigger-icon" :icon="triggerIcon" aria-hidden="true" />
            <span class="sider-trigger-text">{{ triggerText }}</span>
          </button>
        </div>
      </div>
    </aside>

    <main class="admin-content">
      <RouterView />
    </main>
  </div>
</template>

<style scoped>
.admin-shell {
  --shell-bg: #0f172a;
  --shell-bg-elevated: #1e293b;
  --shell-bg-hover: #334155;
  --shell-text: #f1f5f9;
  --shell-text-secondary: #cbd5e1;
  --shell-text-tertiary: #94a3b8;
  --shell-border: #334155;
  --shell-border-light: #475569;
  --shell-active: #18a058;
  display: flex;
  height: 100vh;
  overflow: hidden;
  background: var(--shell-bg);
}

.admin-nav {
  align-self: stretch;
  position: relative;
  overflow: hidden;
  border-right: 1px solid var(--shell-border);
  background-color: var(--shell-bg-elevated);
  color: var(--shell-text);
  transition: width 0.24s cubic-bezier(0.22, 1, 0.36, 1);
  will-change: width;
}

.sider-inner {
  display: flex;
  height: 100%;
  flex-direction: column;
  overflow: hidden;
  padding: 8px 0;
}

.sider-title {
  display: flex;
  align-items: center;
  gap: 6px;
  overflow: hidden;
  padding: 8px 16px 16px 24px;
  color: var(--shell-text);
  font-size: 16px;
  font-weight: 600;
  white-space: nowrap;
}

.sider-title-icon {
  min-width: 18px;
  font-size: 18px;
}

.sider-title-text,
.sider-trigger-text {
  opacity: 1;
  transform: translateX(0);
  transition:
    opacity 0.16s ease,
    transform 0.2s ease;
}

.sider-menu {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 0 8px;
  scrollbar-width: none;
}

.sider-menu::-webkit-scrollbar {
  display: none;
}

.menu-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 52px;
  margin: 0;
  border-radius: 8px;
  padding: 0 20px;
  color: var(--shell-text-secondary);
  text-decoration: none;
  transition:
    background-color 0.2s ease,
    color 0.2s ease;
}

.menu-item:hover {
  background-color: var(--shell-bg-hover);
  color: var(--shell-text);
}

.menu-item.active {
  color: var(--shell-active);
  background-color: rgba(24, 160, 88, 0.1);
}

.menu-item--admin-start {
  margin-top: 14px;
}

.menu-item--admin-start::before {
  content: '';
  position: absolute;
  left: 16px;
  right: 16px;
  top: -8px;
  height: 1px;
  background-color: var(--shell-border);
  opacity: 0.9;
}

.menu-icon {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  min-width: 20px;
  font-size: 20px;
  line-height: 1;
  text-align: center;
  opacity: 1;
  flex-shrink: 0;
}

.menu-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sider-meta {
  display: grid;
  gap: 10px;
  margin-top: auto;
  padding: 12px 16px;
  border-top: 1px solid var(--shell-border);
}

.sider-user {
  display: grid;
  gap: 2px;
  color: var(--shell-text-secondary);
}

.sider-user strong {
  color: var(--shell-text);
}

.sider-user small {
  color: var(--shell-text-tertiary);
}

.sider-user-label {
  color: var(--shell-text-tertiary);
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.sider-actions {
  display: grid;
  gap: 8px;
}

.sider-action-link {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 36px;
  border: 1px solid var(--shell-border-light);
  border-radius: 8px;
  background: transparent;
  color: var(--shell-text-secondary);
  font-size: 14px;
  text-decoration: none;
  transition:
    background-color 0.2s ease,
    color 0.2s ease,
    border-color 0.2s ease;
}

.sider-action-icon {
  min-width: 16px;
  font-size: 16px;
  flex-shrink: 0;
}

.sider-action-link:hover {
  border-color: #64748b;
  background-color: var(--shell-bg-hover);
  color: var(--shell-text);
}

.sider-footer {
  margin-top: auto;
  overflow: hidden;
  padding: 12px 8px calc(12px + var(--app-safe-area-bottom, 0px));
}

.sider-trigger {
  width: 100%;
  justify-content: flex-start;
  overflow: hidden;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--shell-text-secondary);
  white-space: nowrap;
  box-shadow: none;
  padding: 8px 0;
}

.sider-trigger:hover {
  background-color: var(--shell-bg-hover);
  color: var(--shell-text);
  border-color: transparent;
}

.sider-trigger:active {
  background-color: var(--shell-bg-hover);
}

.trigger-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  min-width: 20px;
  font-size: 18px;
  line-height: 1;
  color: var(--shell-text);
  opacity: 1;
  flex-shrink: 0;
}

.sider-trigger {
  display: flex;
  align-items: center;
  gap: 6px;
  padding-left: 20px;
  white-space: nowrap;
}

.admin-content {
  flex: 1;
  height: 100%;
  overflow: auto;
  min-width: 0;
  background-color: var(--shell-bg);
}

.admin-nav.is-compact {
  min-width: 64px;
}

.admin-nav.is-compact .sider-title {
  padding-left: 24px;
}

.admin-nav.is-compact .sider-title {
  justify-content: center;
  padding: 8px 0 16px;
}

.admin-nav.is-compact .menu-item {
  justify-content: center;
  padding: 0;
  gap: 0;
}

.admin-nav.is-compact .menu-icon {
  width: 24px;
  min-width: 24px;
  font-size: 20px;
}

.admin-nav.is-compact .sider-title-text,
.admin-nav.is-compact .sider-trigger-text,
.admin-nav.is-compact .menu-label {
  display: none;
}

.admin-nav.is-compact .sider-meta {
  display: none;
}

.admin-nav.is-compact .menu-item--admin-start::before {
  left: 12px;
  right: 12px;
}

.admin-nav.is-compact .sider-trigger {
  justify-content: center;
  padding-left: 0;
  gap: 0;
}

.admin-nav.is-compact .trigger-icon {
  width: 24px;
  min-width: 24px;
}

.admin-nav.is-hidden {
  width: 0 !important;
  min-width: 0 !important;
  overflow: visible;
  border-right: none;
}

.admin-nav.is-hidden .sider-inner {
  overflow: visible;
  padding: 0;
}

.admin-nav.is-hidden .sider-title,
.admin-nav.is-hidden .sider-menu,
.admin-nav.is-hidden .sider-meta {
  opacity: 0;
  pointer-events: none;
}

.admin-nav.is-hidden .sider-footer {
  position: fixed;
  left: 0;
  z-index: 1000;
  overflow: visible;
  padding: 0;
}

.admin-nav.is-hidden .sider-trigger {
  position: relative;
  z-index: 10000;
  width: 60px;
  min-width: 60px;
  height: 36px;
  cursor: grab;
  border: 1px solid var(--shell-border-light);
  border-left: none;
  border-radius: 0 16px 16px 0;
  background-color: var(--shell-bg-elevated);
  box-shadow: 0 10px 28px rgba(2, 6, 23, 0.32);
  color: var(--shell-text);
  justify-content: center;
  padding: 0 0 0 10px;
}

.admin-nav.is-hidden .sider-trigger.is-dragging {
  cursor: grabbing;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.18);
}

.admin-nav.is-hidden .sider-trigger::before {
  content: '';
  position: absolute;
  left: 10px;
  top: 50%;
  width: 4px;
  height: 16px;
  transform: translateY(-50%);
  border-radius: 999px;
  background-color: rgba(203, 213, 225, 0.22);
}

.admin-nav.is-hidden .sider-trigger-text {
  display: none;
}

.admin-nav.is-hidden .trigger-icon {
  font-size: 18px;
}

@media (max-width: 768px) {
  .menu-item {
    min-height: 48px;
  }
}
</style>
