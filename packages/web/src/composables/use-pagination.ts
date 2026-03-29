import { computed, ref, watch, type ComputedRef, type Ref } from 'vue'

/**
 * 为当前列表提供轻量前端分页。
 * @param items 完整列表
 * @param pageSize 每页条数
 * @returns 当前页数据与翻页操作
 */
export function usePagination<T>(
  items: Ref<T[]> | ComputedRef<T[]>,
  pageSize: number,
) {
  const currentPage = ref(1)

  const totalItems = computed(() => items.value.length)
  const pageCount = computed(() =>
    Math.max(1, Math.ceil(totalItems.value / pageSize)),
  )
  const pagedItems = computed(() => {
    const startIndex = (currentPage.value - 1) * pageSize
    return items.value.slice(startIndex, startIndex + pageSize)
  })
  const rangeStart = computed(() =>
    totalItems.value === 0 ? 0 : (currentPage.value - 1) * pageSize + 1,
  )
  const rangeEnd = computed(() =>
    totalItems.value === 0
      ? 0
      : Math.min(currentPage.value * pageSize, totalItems.value),
  )
  const canGoPrev = computed(() => currentPage.value > 1)
  const canGoNext = computed(() => currentPage.value < pageCount.value)

  watch(pageCount, (nextPageCount) => {
    if (currentPage.value > nextPageCount) {
      currentPage.value = nextPageCount
    }
  })

  function resetPage() {
    currentPage.value = 1
  }

  function goPrevPage() {
    if (canGoPrev.value) {
      currentPage.value -= 1
    }
  }

  function goNextPage() {
    if (canGoNext.value) {
      currentPage.value += 1
    }
  }

  return {
    currentPage,
    pageCount,
    pagedItems,
    rangeStart,
    rangeEnd,
    canGoPrev,
    canGoNext,
    resetPage,
    goPrevPage,
    goNextPage,
  }
}
