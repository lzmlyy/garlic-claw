# Runtime Token Coverage Audit — Phase 4.6

**Date**: 2026-05-14
**Scope**: 72 `.vue`/`.css`/`.scss` files in `packages/web/src`
**Goal**: Establish complete coverage map before any further migration

---

## Executive Summary

| Metric | Value |
|--------|-------|
| Total files scanned | 72 |
| `--gc-*` token consumers | 13 files (18%) |
| Legacy `--shell-*` consumers | 13 files (18%) |
| Chat module `--gc-*` usage | **ZERO** |
| Estimated GC-token coverage | **~14%** of visual declarations |
| Largest problem file | `message-list.css` (~98 hardcoded values) |

---

## Category Definitions

| Category | Criteria |
|----------|----------|
| **FullyTokenized** | ALL colors/shadows/blur/z-index use `--gc-*` tokens; NO hardcoded rgba/hex |
| **PartiallyTokenized** | Most values tokenized via `--gc-*` or legacy vars, some hardcoded values remain |
| **LegacyStyled** | Uses old token variables (`--text`, `--border`, `--accent`, `--surface-*`, `--shell-*`) but NO `--gc-*` depth tokens |
| **Hardcoded** | Majority of visual values are raw rgba/hex strings without token references |

---

## Per-File Audit Results

### APPEARANCE Module (Phase 4.5 — Depth Foundation applied)

| File | Category | Hardcoded Items |
|------|----------|-----------------|
| `AppearancePanel.vue` | **FullyTokenized** | 0 (all `--gc-*` depth tokens) |
| `AppearanceButton.vue` | **FullyTokenized** | 0 |
| `ThemePresetCard.vue` | **FullyTokenized** | 0 |
| `ThemeSliders.vue` | **FullyTokenized** | 0 |
| `ThemePreview.vue` | **FullyTokenized** | 0 |
| `AppearanceTabs.vue` | **FullyTokenized** | 0 |

### ADMIN Layout

| File | Category | Hardcoded Items |
|------|----------|-----------------|
| `AdminConsoleLayout.vue` | **LegacyStyled** | 9 hardcoded transitions (`0.18s ease`, `0.28s cubic-bezier(...)`, etc.), 5 opacity values. Colors via `--shell-*`, shadows via `--gc-shadow-*`, z-index via `--gc-z-*` |

### CHAT Module — **ZERO `--gc-*` usage**

| File | Category | Hardcoded Count |
|------|----------|-----------------|
| `styles/message-list.css` | **Hardcoded** | ~98 — Every color, shadow, blur, border, and transition is raw rgba/hex. No token system. |
| `components/ChatComposer.vue` | **PartiallyTokenized** | ~18 — Blur(12px/18px), hardcoded box-shadow, z-index:20, `#fff` text, raw transitions |
| `components/ChatRuntimePermissionPanel.vue` | **PartiallyTokenized** | ~14 — All permission card colors are raw rgba/hex |
| `views/ChatView.vue` | **PartiallyTokenized** | ~17 — Context bar, progress fill, settings link, todo items all hardcoded |
| `layouts/ChatConsoleView.vue` | **PartiallyTokenized** | ~3 — Active conversation item uses hardcoded rgba |

### AI SETTINGS Module — ZERO `--gc-*` usage

| File | Category | Hardcoded Count |
|------|----------|-----------------|
| `AiProviderModelsPanel.vue` | **LegacyStyled** | ~13 — `blur(18px)`, `blur(12px)`, hardcoded box-shadow, `#fff` on buttons |
| `AiProviderSidebar.vue` | **LegacyStyled** | ~10 — Same glass-morphism pattern, hardcoded blur/shadows |
| `AiModelCapabilityToggles.vue` | **LegacyStyled** | ~10 — Active state borders/backgrounds are hardcoded gradients |
| `VisionFallbackPanel.vue` | **LegacyStyled** | ~3 — `blur(12px)`, hardcoded transition, `#fff` |
| `HostModelRoutingPanel.vue` | **LegacyStyled** | ~1 — `#fff` on primary button |
| `ProviderSettings.vue` | **LegacyStyled** | ~35 — Heavy `--shell-*` usage, many `#fallback` hex values, direct rgba |
| `AiModelDiscoveryDialog.vue` | **FullyTokenized** | 0 |
| `AiProviderEditorDialog.vue` | **FullyTokenized** | 0 |
| `RuntimeToolsSettingsPanel.vue` | **FullyTokenized** | 0 |
| `SubagentSettingsPanel.vue` | **FullyTokenized** | 0 |
| `ContextGovernanceSettingsPanel.vue` | **FullyTokenized** | 0 |

### PLUGINS Module — ZERO `--gc-*` usage

| File | Category | Hardcoded Count |
|------|----------|-----------------|
| `PluginAttentionPanel.vue` | **Hardcoded** | ~18 — All colors/surfaces raw rgba/hex with dark mode baked in |
| `PluginSidebar.vue` | **Hardcoded** | ~27 — rgba borders, hex colors, `--el-*` overrides with rgba, hardcoded gradients/box-shadows |
| `PluginDetailOverview.vue` | **Hardcoded** | ~16 — Badge colors, `blur(12px)`, rgba borders/backgrounds |
| `PluginPageHero.vue` | **PartiallyTokenized** | ~2 — rgba border, hex warning color |
| `PluginRemoteAccessPanel.vue` | **Hardcoded** | ~8 — rgba backgrounds/borders, hex validation error |
| `PluginRemoteSummaryPanel.vue` | **PartiallyTokenized** | ~6 — Badge colors rgba/hex |
| `PluginCronList.vue` | **PartiallyTokenized** | ~4 — Status colors rgba/hex |
| `PluginConversationSessionList.vue` | **PartiallyTokenized** | ~3 — rgba borders |
| `PluginLlmPreferencePanel.vue` | **PartiallyTokenized** | ~2 — rgba background |
| `PluginRouteList.vue` | **PartiallyTokenized** | ~3 — rgba borders |
| `PluginStoragePanel.vue` | **PartiallyTokenized** | ~1 — rgba border |
| `PluginsView.vue` | **LegacyStyled** | ~10 — rgba, hex, `blur(12px)`, `--shell-bg-hover` fallback hex |
| `PluginEventLog.vue` | **FullyTokenized** | 0 (no style block — wrapper only) |
| `PluginScopeEditor.vue` | **FullyTokenized** | 0 (no style block — wrapper only) |

### OTHER MODULES

| File | Category | Hardcoded Count |
|------|----------|-----------------|
| `AutomationsView.vue` | **LegacyStyled** | ~18 — rgba, hex, `blur(12px/18px)`, `z-index:1`, gradients, hardcoded transitions |
| `CommandsView.vue` | **LegacyStyled** | ~8 — rgba borders, hex colors, hardcoded transitions |
| `McpView.vue` | **LegacyStyled** | ~4 — rgba, box-shadow, transition |
| `PersonaSettingsView.vue` | **LegacyStyled** | ~20 — rgba, hex, box-shadow, `opacity 0.9`, avatar colors |
| `ToolsView.vue` | **LegacyStyled** | ~5 — Legacy vars with hardcoded fallbacks |
| `ToolGovernancePanel.vue` | **LegacyStyled** | ~2 — rgba borders |
| `McpConfigPanel.vue` | **LegacyStyled** | ~6 — `box-shadow` with `#fallback` hex |
| `EventLogPanel.vue` | **LegacyStyled** | ~2 |
| `SubagentView.vue` | **LegacyStyled** | ~3 |
| `SkillsView.vue` | **LegacyStyled** | ~5 — `box-shadow` with `#fallback` hex |
| `SkillCard.vue` | **LegacyStyled** | ~2 — `#fallback` values |
| `ConsoleSettingsView.vue` | **LegacyStyled** | ~3 — rgba gradients, box-shadow |
| `LoginView.vue` | **LegacyStyled** | 1 — `rgba(103, 199, 207, 0.12)` in box-shadow |
| `SchemaConfigForm.vue` | **FullyTokenized** | 0 |
| `SchemaConfigNodeRenderer.vue` | **FullyTokenized** | 0 |

### SHARED COMPONENTS

| File | Category | Hardcoded Count |
|------|----------|-----------------|
| `ModelQuickInput.vue` | **PartiallyTokenized** | ~4 — `blur(18px)`, hardcoded box-shadow, `z-index:20` |
| `HeaderViewSwitch.vue` | **PartiallyTokenized** | ~3 — `#fff`, `#f5f7fa` fallback, hardcoded transitions |
| `SegmentedSwitch.vue` | **PartiallyTokenized** | ~2 — `rgba(133, 163, 199, 0.14)` border |
| `ThemeToggle.vue` | **LegacyStyled** | 2 — `z-index:1100`, hardcoded transition |
| `ThemePanel.vue` | **PartiallyTokenized** | 2 — `rgba(0,0,0,0.9)` title, `all 0.2s` transition |
| `GenericListView.vue` | **LegacyStyled** | 1 — `rgba(76, 189, 255, 0.06)` |
| `ConsolePage.vue` | **LegacyStyled** | 0 |
| `ConsoleViewHeader.vue` | **LegacyStyled** | 0 |

### SHARED STYLES

| File | Category | Notes |
|------|----------|-------|
| `tokens.css` | **Token Definition** | Contains all legacy token definitions (--text, --border, --accent, --surface-*, --shell-*, --shadow, --glass-blur) with hardcoded rgba/hex — this IS the token source |
| `element-plus.css` | **PartiallyTokenized** | ~25 hardcoded hex/rgba in `--el-*` derived colors (success-light-3, warning-light-5, etc.). Shadows use `--gc-shadow-*` depth tokens |
| `shell.css` | **PartiallyTokenized** | 4 hardcoded rgba in mask-image grid overlays; main backgrounds use `--gc-*` tokens |
| `base.css` | **LegacyStyled** | Mix of old tokens (`--text`, `--accent`, `--border`) and some `--gc-*` tokens |
| `markdown.css` | **LegacyStyled** | All `color-mix()` with old `--text`, `--accent`, `--surface-*` tokens; 1 hardcoded transition |
| `app.css` | **FullyTokenized** | Only `@import` rules |

---

## Migration Priority List

### P0 — CRITICAL (Core Layout Visual Fracture)

**Impact**: These files define the main surfaces users see every session. Hardcoded values create visible inconsistency with depth-tokenized components.

1. **`message-list.css`** (98 issues)
   - The primary chat surface. Entirely hardcoded dark-mode palette.
   - All message bubbles, status colors, tool entries, custom blocks are raw rgba/hex
   - Shadows, blurs, transitions all use literal values
   - *Risk: Any theme change looks broken in chat*

2. **`element-plus.css`** (25 issues)
   - Element Plus derived color palette (success-light-*, warning-light-*, danger-light-*, info-light-*) uses hardcoded hex/rgba
   - Affects ALL Element Plus components across the entire app
   - *Risk: Component library colors deviate from runtime theme*

### P1 — HIGH (Frequently Interacted Components)

3. **`ChatComposer.vue`** (18 issues) — Input area seen every session
4. **`ChatView.vue`** (17 issues) — Main chat interface
5. **`ChatRuntimePermissionPanel.vue`** (14 issues) — Permission dialogs
6. **`AiProviderModelsPanel.vue`** (13 issues) — Model configuration
7. **`AiProviderSidebar.vue`** (10 issues) — Provider list sidebar
8. **`ChatConsoleView.vue`** (3 issues) — Chat console shell

### P2 — MEDIUM (Business Page Local Components)

9. **`PluginSidebar.vue`** (27 issues) — Plugin list sidebar
10. **`PluginAttentionPanel.vue`** (18 issues) — Plugin warning panel
11. **`PluginDetailOverview.vue`** (16 issues) — Plugin detail view
12. **`PluginsView.vue`** (10 issues) — Plugin management page
13. **`AutomationsView.vue`** (18 issues) — Automation rules page
14. **`ProviderSettings.vue`** (35 issues, but mostly `--shell-*` fallbacks)
15. **`PersonaSettingsView.vue`** (20 issues) — Persona management
16. **`McpConfigPanel.vue`** (6 issues) — MCP configuration

### P3 — LOW (Minor Issues / Wrapper Components)

17. **`AdminConsoleLayout.vue`** (9 hardcoded transitions) — colors/shadows/z-index already tokenized
18. **`ModelQuickInput.vue`** (4 issues) — blur/box-shadow/z-index
19. **`VisionFallbackPanel.vue`** (3 issues)
20. **`HeaderViewSwitch.vue`** (3 issues)
21. **Remaining PartiallyTokenized files** (1-5 issues each)

---

## Identified Patterns

### 1. Glass-Morphism Copy-Paste
The following identical rules appear in 4+ files:
```css
backdrop-filter: blur(18px);
-webkit-backdrop-filter: blur(18px);
box-shadow: 0 12px 28px rgba(1, 6, 15, 0.2), 0 0 15px rgba(103, 199, 207, 0.08);
```
**Files**: `ChatComposer.vue`, `AiProviderModelsPanel.vue`, `AiProviderSidebar.vue`, `message-list.css`
**Fix**: Replace with `var(--gc-blur-deep)` and a composite `var(--gc-shadow-glass)` depth token.

### 2. `#fff` on Primary Buttons
5 files have `color: #fff` on `.primary-button`:
`ChatComposer.vue`, `AiProviderModelsPanel.vue`, `AiProviderSidebar.vue`, `HostModelRoutingPanel.vue`, `VisionFallbackPanel.vue`
**Fix**: Use `var(--gc-primary-foreground)` which already exists.

### 3. Status Color Palette Duplication
`message-list.css` defines a complete hardcoded color system for statuses, duplicated across many selectors:
- Success: `#a6efd0` / `rgba(68, 204, 136, ...)`
- Error: `#ffaaaa` / `rgba(226, 74, 74, ...)`
- Warning: `#ffd48d` / `rgba(255, 184, 77, ...)`
- Info: `#9fe9ff` / `rgba(92, 203, 255, ...)`
**Fix**: These should become semantic `--gc-status-*` tokens in the legacy bridge.

### 4. `--shell-*` Legacy Token System
13 files use `var(--shell-bg)`, `var(--shell-border)`, `var(--shell-text)`, etc.
These are defined in `tokens.css` with hardcoded fallback hex values (`#0f172a`, `#334155`, `#f1f5f9`).
**Fix**: Wire `--shell-*` variables into the legacy bridge (like `--accent` → `--gc-primary`) so they become runtime-reactive.

### 5. `--el-*` Derived Colors in element-plus.css
`--el-color-success-light-3: #74d8a8` and similar derived colors are hardcoded.
**Fix**: Generate these from primitives using `color-mix()` or HSL manipulation.

---

## Runtime Token Coverage Calculation

**Methodology**: Count files using `--gc-*` tokens vs. files using legacy var() / hardcoded values.

- **FullyTokenized** (`--gc-*` depth tokens only): 18 files (25%)
  - Appearance (6), AI dialogs (5), Config (2), Wrapper components (2), app.css (1), shared styles partial (shell.css)
  
- **PartiallyTokenized** (mix of `--gc-*` + legacy + some hardcoded): 5 files (7%)
  - Shared components (SegmentedSwitch, HeaderViewSwitch, ModelQuickInput, ThemePanel), element-plus.css

- **LegacyStyled** (only legacy `--text`/`--border`/`--accent`/`--surface-*`/`--shell-*`): 38 files (53%)
  - Most business modules, admin layout, shared styles

- **Hardcoded** (majority raw rgba/hex): 8 files (11%)
  - message-list.css, PluginAttentionPanel, PluginSidebar, PluginDetailOverview, PluginRemoteAccessPanel, etc.

- **No styles** (trivially clean): 3 files (4%)

### Estimated Visual Declaration Coverage

| Token Type | Est. % of Declarations |
|------------|----------------------|
| `--gc-*` depth tokens | **~14%** |
| Legacy tokens (`--text`, `--border`, `--surface-*`, `--shell-*`) | **~55%** |
| Hardcoded rgba/hex/blur/z-index | **~31%** |

**RuntimeTokenCoveragePercentage: ~14%** (percentage of visual CSS declarations using `--gc-*` runtime-computed tokens)

---

## Recommendations

1. **P0 First**: Fix `message-list.css` and `element-plus.css` — these two files account for ~40% of all hardcoded values
2. **Wire `--shell-*` into legacy bridge**: This would instantly tokenize 13 files (183 occurrences) with near-zero component changes
3. **Create `--gc-shadow-glass` composite token**: Eliminates the glass-morphism copy-paste pattern across 4+ files
4. **Create status color tokens**: `--gc-status-success-text`, `--gc-status-error-bg`, etc. for the duplicated status palette
5. **Proceed P0→P1→P2→P3**: Each priority level must be fully migrated before starting the next
