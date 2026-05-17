<template>
  <section class="generic-list-view">
    <header class="list-toolbar">
      <label class="keyword-field">
        <span class="field-label">搜索</span>
        <ElInput
          v-model="keyword"
          class="keyword-input"
          placeholder="按关键词搜索"
        />
      </label>

      <div v-if="filters.length > 0" class="filter-group">
        <label
          v-for="filter in filters"
          :key="filter.key"
          class="filter-field"
        >
          <span class="field-label">{{ filter.label }}</span>
          <ElSelect
            v-model="filterValues[filter.key]"
            placeholder="全部"
          >
            <ElOption label="全部" value="" />
            <ElOption
              v-for="option in filter.options"
              :key="option.value"
              :value="option.value"
              :label="option.label"
            />
          </ElSelect>
        </label>
      </div>
    </header>

    <div class="list-summary">
      <span>
        {{ filteredItems.length }} / {{ items.length }} 项
      </span>
      <span v-if="filteredItems.length > 0">
        第 {{ currentPage }} / {{ pageCount }} 页
        · {{ rangeStart }}-{{ rangeEnd }}
      </span>
    </div>

    <div class="table-shell">
      <table>
        <thead>
          <tr>
            <th
              v-for="column in columns"
              :key="column.key"
              :class="column.align ? `align-${column.align}` : ''"
              :style="column.width ? { width: column.width } : undefined"
            >
              {{ column.label }}
            </th>
          </tr>
        </thead>
        <tbody v-if="pagedItems.length > 0">
          <tr
            v-for="(item, rowIndex) in pagedItems"
            :key="resolveRowKey(item, rowIndex)"
            class="table-row"
            @click="emitRowClick(item, rowIndex)"
          >
            <td
              v-for="column in columns"
              :key="`${resolveRowKey(item, rowIndex)}:${column.key}`"
              :class="column.align ? `align-${column.align}` : ''"
            >
              <slot
                :name="`cell-${column.key}`"
                :item="item"
                :column="column"
                :value="resolveColumnValue(item, column)"
                :row-index="toAbsoluteRowIndex(rowIndex)"
              >
                <slot
                  name="cell"
                  :item="item"
                  :column="column"
                  :value="resolveColumnValue(item, column)"
                  :row-index="toAbsoluteRowIndex(rowIndex)"
                >
                  {{ formatValue(resolveColumnValue(item, column)) }}
                </slot>
              </slot>
            </td>
          </tr>
        </tbody>
        <tbody v-else>
          <tr>
            <td :colspan="Math.max(columns.length, 1)" class="empty-cell">
              未找到符合条件的内容。
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <footer class="pagination">
      <ElButton
        class="page-button"
        :disabled="!canGoPrevPage"
        @click="goPrevPage"
      >
        上一页
      </ElButton>
      <ElButton
        class="page-button"
        :disabled="!canGoNextPage"
        @click="goNextPage"
      >
        下一页
      </ElButton>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElButton, ElInput, ElOption, ElSelect } from 'element-plus'

type ListItem = Record<string, unknown>

interface GenericListColumn {
  key: string
  label: string
  searchable?: boolean
  width?: string
  align?: 'left' | 'center' | 'right'
}

interface GenericListFilterOption {
  label: string
  value: string
}

interface GenericListFilter {
  key: string
  label: string
  options: GenericListFilterOption[]
  defaultValue?: string
  field?: string | ((item: ListItem) => unknown)
  predicate?: (item: ListItem, selectedValue: string) => boolean
}

const props = withDefaults(defineProps<{
  items: ListItem[]
  columns: GenericListColumn[]
  filters?: GenericListFilter[]
  pageSize?: number
}>(), {
  filters: () => [],
  pageSize: 10,
})

const emit = defineEmits<{
  (event: 'row-click', payload: { item: ListItem, index: number }): void
}>()

const keyword = ref('')
const currentPage = ref(1)
const filterValues = ref<Record<string, string>>({})

const safePageSize = computed(() => Math.max(1, props.pageSize))
const searchableColumns = computed(() =>
  props.columns.filter((column) => column.searchable !== false),
)

watch(
  () => props.filters,
  (nextFilters) => {
    const nextValues: Record<string, string> = {}
    for (const filter of nextFilters) {
      const existing = filterValues.value[filter.key]
      const defaultValue = filter.defaultValue ?? ''
      nextValues[filter.key] = existing ?? defaultValue
    }
    filterValues.value = nextValues
  },
  {
    immediate: true,
    deep: true,
  },
)

const filteredItems = computed(() => {
  const normalizedKeyword = keyword.value.trim().toLowerCase()

  return props.items.filter((item) => {
    if (normalizedKeyword && !matchesKeyword(item, normalizedKeyword)) {
      return false
    }

    for (const filter of props.filters) {
      const selectedValue = filterValues.value[filter.key] ?? ''
      if (!selectedValue) {
        continue
      }

      if (filter.predicate) {
        if (!filter.predicate(item, selectedValue)) {
          return false
        }
        continue
      }

      const rawValue = resolveFilterValue(item, filter)
      if (!matchesFilterValue(rawValue, selectedValue)) {
        return false
      }
    }

    return true
  })
})

const pageCount = computed(() =>
  Math.max(1, Math.ceil(filteredItems.value.length / safePageSize.value)),
)
const canGoPrevPage = computed(() => currentPage.value > 1)
const canGoNextPage = computed(() => currentPage.value < pageCount.value)

const pagedItems = computed(() => {
  const start = (currentPage.value - 1) * safePageSize.value
  const end = start + safePageSize.value
  return filteredItems.value.slice(start, end)
})

const rangeStart = computed(() => {
  if (filteredItems.value.length === 0) {
    return 0
  }

  return (currentPage.value - 1) * safePageSize.value + 1
})
const rangeEnd = computed(() =>
  Math.min(currentPage.value * safePageSize.value, filteredItems.value.length),
)

watch(
  [keyword, filterValues],
  () => {
    currentPage.value = 1
  },
  { deep: true },
)

watch(
  [filteredItems, pageCount],
  () => {
    if (currentPage.value > pageCount.value) {
      currentPage.value = pageCount.value
    }
  },
  { immediate: true },
)

function matchesKeyword(item: ListItem, normalizedKeyword: string): boolean {
  for (const column of searchableColumns.value) {
    const rawValue = resolveColumnValue(item, column)
    const text = formatValue(rawValue).toLowerCase()
    if (text.includes(normalizedKeyword)) {
      return true
    }
  }

  return false
}

function resolveFilterValue(item: ListItem, filter: GenericListFilter): unknown {
  if (typeof filter.field === 'function') {
    return filter.field(item)
  }

  return resolveValueByPath(item, filter.field ?? filter.key)
}

function matchesFilterValue(rawValue: unknown, selectedValue: string): boolean {
  if (Array.isArray(rawValue)) {
    return rawValue.some((entry) => String(entry) === selectedValue)
  }

  return String(rawValue ?? '') === selectedValue
}

function resolveColumnValue(item: ListItem, column: GenericListColumn): unknown {
  return resolveValueByPath(item, column.key)
}

function resolveValueByPath(item: ListItem, path: string): unknown {
  const pathSegments = path.split('.')
  let cursor: unknown = item

  for (const segment of pathSegments) {
    if (!cursor || typeof cursor !== 'object' || !(segment in cursor)) {
      return undefined
    }
    cursor = (cursor as Record<string, unknown>)[segment]
  }

  return cursor
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '-'
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  if (Array.isArray(value)) {
    return value.map((entry) => formatValue(entry)).join(', ')
  }

  return JSON.stringify(value)
}

function resolveRowKey(item: ListItem, rowIndex: number): string {
  const candidate = item.id ?? item.key ?? item.name
  if (typeof candidate === 'string' || typeof candidate === 'number') {
    return String(candidate)
  }

  return `${toAbsoluteRowIndex(rowIndex)}`
}

function toAbsoluteRowIndex(pageRowIndex: number): number {
  return (currentPage.value - 1) * safePageSize.value + pageRowIndex
}

function emitRowClick(item: ListItem, pageRowIndex: number) {
  emit('row-click', {
    item,
    index: toAbsoluteRowIndex(pageRowIndex),
  })
}

function goPrevPage() {
  if (!canGoPrevPage.value) {
    return
  }

  currentPage.value -= 1
}

function goNextPage() {
  if (!canGoNextPage.value) {
    return
  }

  currentPage.value += 1
}
</script>

<style scoped>
.generic-list-view {
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
  min-height: 0;
}

.list-toolbar,
.filter-group,
.pagination {
  display: flex;
  gap: 0.75rem;
  flex-wrap: wrap;
  align-items: end;
}

.keyword-field,
.filter-field {
  display: grid;
  gap: 0.35rem;
}

.keyword-field {
  min-width: 220px;
  flex: 1 1 240px;
}

.field-label {
  font-size: 0.78rem;
  color: var(--text-muted);
}

.keyword-input,
.filter-field :deep(.el-select) {
  width: 100%;
}

.list-summary {
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
  flex-wrap: wrap;
  color: var(--text-muted);
  font-size: 0.85rem;
}

.table-shell {
  border: 1px solid var(--gc-border);
  border-radius: var(--gc-radius);
  overflow: auto;
}

table {
  width: 100%;
  border-collapse: collapse;
}

thead th {
  text-align: left;
  font-size: 0.78rem;
  color: var(--text-muted);
  border-bottom: 1px solid var(--border);
  padding: 0.65rem;
  white-space: nowrap;
}

tbody td {
  border-bottom: 1px solid var(--border);
  padding: 0.65rem;
  vertical-align: top;
  color: var(--text);
}

tbody tr:last-child td {
  border-bottom: none;
}

.table-row {
  cursor: pointer;
}

.table-row:hover {
  background: rgba(76, 189, 255, 0.06);
}

.empty-cell {
  text-align: center;
  color: var(--text-muted);
  padding: 1rem;
}

.align-center {
  text-align: center;
}

.align-right {
  text-align: right;
}

.page-button {
  border-radius: 999px;
}
</style>
