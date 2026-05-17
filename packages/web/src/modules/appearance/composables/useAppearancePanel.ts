import { ref, readonly } from 'vue'

// Module-level singleton — shared between AppearanceButton and AppearancePanel
const isOpen = ref(false)

export function useAppearancePanel() {
  function open(): void {
    isOpen.value = true
  }

  function close(): void {
    isOpen.value = false
  }

  function toggle(): void {
    isOpen.value = !isOpen.value
  }

  return {
    isOpen: readonly(isOpen),
    open,
    close,
    toggle,
  }
}
