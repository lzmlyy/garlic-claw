<script setup lang="ts">
import { ElSwitch } from 'element-plus'
import { Icon } from '@iconify/vue'
import settingsBold from '@iconify-icons/solar/settings-bold'
import { useAdminShellPreferences } from '@/modules/admin/modules/admin-shell-preferences'
import { useThemeStore } from '@/shared/stores/theme'

const {
  topbarPullCordEnabled,
  setTopbarPullCordEnabled,
} = useAdminShellPreferences()
const theme = useThemeStore()

function handleToggleTopbarPullCord() {
  setTopbarPullCordEnabled(!topbarPullCordEnabled.value)
}

function handleToggleDarkMode() {
  if (theme.followSystem) {
    return
  }

  if (theme.isDark) {
    theme.setLightMode()
    return
  }

  theme.setDarkMode()
}
</script>

<template>
  <div class="console-settings-page">
    <header class="settings-page-header">
      <div class="settings-hero">
        <h1><Icon :icon="settingsBold" class="hero-icon" aria-hidden="true" />控制台设置</h1>
      </div>
    </header>

    <section class="settings-grid">
      <article class="settings-card">
        <div class="settings-row">
          <div class="settings-copy">
            <strong>启用顶栏拉绳按钮</strong>
            <p class="settings-copy-note">开启后，顶栏中间会出现一个可点击的下拉拉绳，用来收起或展开顶部栏。</p>
          </div>

          <ElSwitch
            :model-value="topbarPullCordEnabled"
            aria-label="启用顶栏拉绳按钮"
            @change="handleToggleTopbarPullCord"
          />
        </div>
      </article>

      <article class="settings-card">
        <div class="settings-row">
          <div class="settings-copy">
            <strong>切换深色模式</strong>
            <p class="settings-copy-note">关闭时使用浅色模式；开启后使用深色模式。</p>
          </div>

          <ElSwitch
            :model-value="theme.isDark && !theme.followSystem"
            :disabled="theme.followSystem"
            aria-label="切换深色模式"
            @change="handleToggleDarkMode"
          />
        </div>

        <div class="settings-divider" />

        <div class="settings-row">
          <div class="settings-copy">
            <strong>深色模式跟随系统</strong>
            <p class="settings-copy-note">开启后，界面主题会根据系统主题自动切换。</p>
          </div>

          <ElSwitch
            :model-value="theme.followSystem"
            aria-label="深色模式跟随系统"
            @change="theme.setFollowSystem(!theme.followSystem)"
          />
        </div>
      </article>
    </section>
  </div>
</template>

<style scoped>
.console-settings-page {
  min-height: 100%;
  padding: 1.5rem 2rem;
  background:
    radial-gradient(circle at top right, rgba(245, 158, 11, 0.12), transparent 28%),
    radial-gradient(circle at left 20%, rgba(148, 163, 184, 0.08), transparent 26%),
    var(--gc-surface-base);
}

.settings-page-header {
  margin-bottom: 24px;
}

.settings-hero {
  max-width: 720px;
}

.hero-icon {
  vertical-align: -0.15em;
  margin-right: 6px;
}

.settings-hero h1,
.settings-card-header h2 {
  margin: 0;
  color: var(--shell-text);
}

.settings-hero p,
.settings-copy p {
  margin: 8px 0 0;
  color: var(--shell-text-secondary);
  line-height: 1.6;
}

.settings-grid {
  display: grid;
  width: min(100%, 860px);
  margin: 0 auto;
  gap: 18px;
}

.settings-card {
  border: 1px solid var(--gc-border);
  border-radius: var(--gc-radius);
  padding: 24px;
  background: var(--gc-surface-elevated);
  backdrop-filter: blur(var(--gc-blur));
  box-shadow: var(--gc-shadow);
}

.settings-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
}

.settings-copy {
  min-width: 0;
}

.settings-copy strong {
  color: var(--shell-text);
  font-size: 14px;
}

.settings-copy-note {
  font-size: 12px;
  color: var(--shell-text-tertiary);
}

.settings-divider {
  height: 1px;
  margin: 18px 0;
  background: var(--shell-border);
}

@media (max-width: 768px) {
  .console-settings-page {
    padding: 1rem;
  }

  .settings-card {
    padding: 18px;
  }

  .settings-row {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
