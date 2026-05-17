<template>
  <div class="theme-preview">
    <span class="theme-preview__label">预览</span>

    <div class="theme-preview__canvas">
      <!-- Simulated card -->
      <div class="preview-card">
        <div class="preview-card__header">
          <div class="preview-card__avatar" />
          <div>
            <div class="preview-card__title" />
            <div class="preview-card__subtitle" />
          </div>
        </div>
        <div class="preview-card__body">
          <div class="preview-card__line preview-card__line--short" />
          <div class="preview-card__line" />
          <div class="preview-card__line preview-card__line--medium" />
        </div>
      </div>

      <!-- Simulated buttons -->
      <div class="preview-actions">
        <div class="preview-btn preview-btn--primary">Primary</div>
        <div class="preview-btn preview-btn--ghost">Ghost</div>
      </div>

      <!-- Simulated input -->
      <div class="preview-input" />
    </div>
  </div>
</template>

<script setup lang="ts">
</script>

<style scoped>
.theme-preview {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.theme-preview__label {
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--gc-muted-foreground);
}

.theme-preview__canvas {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 16px;
  border-radius: 14px;
  background: var(--gc-background);
  border: 1px solid var(--gc-border);
  transition: background 0.3s ease, border-color 0.3s ease;
}

/* ── Simulated card ── */
.preview-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
  border-radius: 10px;
  background: var(--gc-card);
  border: 1px solid var(--gc-glass-border);
  transition: background 0.3s ease, border-color 0.3s ease;
}

.preview-card__header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.preview-card__avatar {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--gc-primary);
  flex-shrink: 0;
  transition: background 0.3s ease;
}

.preview-card__title {
  width: 80px;
  height: 10px;
  border-radius: 3px;
  background: var(--gc-foreground);
  opacity: 0.8;
  transition: background 0.3s ease;
}

.preview-card__subtitle {
  width: 50px;
  height: 7px;
  border-radius: 3px;
  background: var(--gc-muted-foreground);
  margin-top: 4px;
  transition: background 0.3s ease;
}

.preview-card__body {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.preview-card__line {
  width: 100%;
  height: 6px;
  border-radius: 3px;
  background: var(--gc-muted);
  transition: background 0.3s ease;
}

.preview-card__line--short {
  width: 60%;
}

.preview-card__line--medium {
  width: 80%;
}

/* ── Simulated buttons ── */
.preview-actions {
  display: flex;
  gap: 8px;
}

.preview-btn {
  padding: 6px 14px;
  border-radius: 7px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.02em;
  transition: background 0.3s ease, color 0.3s ease, border-color 0.3s ease;
}

.preview-btn--primary {
  background: var(--gc-primary);
  color: var(--gc-primary-foreground);
}

.preview-btn--ghost {
  background: transparent;
  color: var(--gc-foreground);
  border: 1px solid var(--gc-border);
}

/* ── Simulated input ── */
.preview-input {
  height: 28px;
  border-radius: 7px;
  background: var(--gc-muted);
  border: 1px solid var(--gc-border);
  transition: background 0.3s ease, border-color 0.3s ease;
}
</style>
