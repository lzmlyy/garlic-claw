export const INTERNAL_AUTOMATION_RUN_EVENT = 'garlic-claw:automation-run'

export interface InternalAutomationRunDetail {
  conversationId: string
}

export function emitInternalAutomationRun(detail: InternalAutomationRunDetail) {
  if (typeof window === 'undefined') {
    return
  }
  window.dispatchEvent(
    new CustomEvent<InternalAutomationRunDetail>(INTERNAL_AUTOMATION_RUN_EVENT, {
      detail,
    }),
  )
}

export function subscribeInternalAutomationRun(
  listener: (detail: InternalAutomationRunDetail) => void,
): () => void {
  if (
    typeof window === 'undefined'
    || typeof window.addEventListener !== 'function'
    || typeof window.removeEventListener !== 'function'
  ) {
    return () => {}
  }

  const wrapped = (event: Event) => {
    if (!(event instanceof CustomEvent)) {
      return
    }
    listener(event.detail as InternalAutomationRunDetail)
  }

  window.addEventListener(INTERNAL_AUTOMATION_RUN_EVENT, wrapped)
  return () => {
    window.removeEventListener(INTERNAL_AUTOMATION_RUN_EVENT, wrapped)
  }
}
