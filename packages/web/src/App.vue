<script setup lang="ts">
import { storeToRefs } from 'pinia'

import { useUiStore } from '@/stores/ui'

const uiStore = useUiStore()
const { notifications } = storeToRefs(uiStore)

function dismiss(notificationId: string) {
  uiStore.removeNotification(notificationId)
}
</script>

<template>
  <router-view />

  <div v-if="notifications.length > 0" class="app-notification-stack" aria-live="polite">
    <div
      v-for="notification in notifications"
      :key="notification.id"
      class="app-notification"
      :class="`app-notification--${notification.type}`"
      role="status"
    >
      <span class="app-notification__message">{{ notification.message }}</span>
      <button
        type="button"
        class="app-notification__close"
        aria-label="关闭提示"
        @click="dismiss(notification.id)"
      >
        ×
      </button>
    </div>
  </div>
</template>

<style scoped>
.app-notification-stack {
  position: fixed;
  top: 16px;
  right: 16px;
  z-index: 2000;
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-width: min(420px, calc(100vw - 32px));
}

.app-notification {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 8px;
  color: #fff;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
}

.app-notification--success {
  background: #176b3d;
}

.app-notification--error {
  background: #b42318;
}

.app-notification__message {
  line-height: 1.4;
  font-size: 14px;
}

.app-notification__close {
  border: 0;
  background: transparent;
  color: inherit;
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
}
</style>
