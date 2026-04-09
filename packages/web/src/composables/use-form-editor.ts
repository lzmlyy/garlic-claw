import { ref, type Ref } from 'vue'
import { getErrorMessage } from '@/utils/error'

type FieldKey<T extends Record<string, unknown>> = Extract<keyof T, string>

export type FormEditorErrors<T extends Record<string, unknown>> = Partial<
  Record<FieldKey<T> | '_form', string>
>

export interface UseFormEditorOptions<T extends Record<string, unknown>> {
  initialValues: T
  validate?: (values: T) => FormEditorErrors<T> | null | undefined | Promise<FormEditorErrors<T> | null | undefined>
  onSubmit: (values: T) => void | Promise<void>
}

/**
 * 统一管理表单编辑状态：值、校验、提交与重置。
 */
export function useFormEditor<T extends Record<string, unknown>>(
  options: UseFormEditorOptions<T>,
) {
  const initialValuesRef = ref(cloneValues(options.initialValues)) as Ref<T>
  const values = ref(cloneValues(options.initialValues)) as Ref<T>
  const errors = ref<FormEditorErrors<T>>({})
  const isSubmitting = ref(false)

  function setField<K extends FieldKey<T>>(key: K, value: T[K]) {
    values.value = {
      ...values.value,
      [key]: value,
    }
  }

  function setValues(nextValues: Partial<T>) {
    values.value = {
      ...values.value,
      ...nextValues,
    }
  }

  function setErrors(nextErrors: FormEditorErrors<T>) {
    errors.value = {
      ...nextErrors,
    }
  }

  function clearErrors() {
    errors.value = {}
  }

  function reset(nextInitialValues?: T) {
    if (nextInitialValues) {
      initialValuesRef.value = cloneValues(nextInitialValues)
    }

    values.value = cloneValues(initialValuesRef.value)
    clearErrors()
  }

  async function runValidation(): Promise<boolean> {
    if (!options.validate) {
      clearErrors()
      return true
    }

    const result = await options.validate(cloneValues(values.value))
    const nextErrors = normalizeErrors(result)
    errors.value = nextErrors
    return !hasErrors(nextErrors)
  }

  async function submit(): Promise<boolean> {
    if (isSubmitting.value) {
      return false
    }

    const valid = await runValidation()
    if (!valid) {
      return false
    }

    isSubmitting.value = true
    try {
      await options.onSubmit(cloneValues(values.value))
      return true
    } catch (cause) {
      errors.value = {
        ...errors.value,
        _form: toErrorMessage(cause, '提交失败，请稍后重试'),
      }
      return false
    } finally {
      isSubmitting.value = false
    }
  }

  return {
    values,
    errors,
    isSubmitting,
    setField,
    setValues,
    setErrors,
    clearErrors,
    reset,
    runValidation,
    submit,
  }
}

function normalizeErrors<T extends Record<string, unknown>>(
  errors: FormEditorErrors<T> | null | undefined,
): FormEditorErrors<T> {
  if (!errors) {
    return {}
  }

  const normalizedEntries = Object.entries(errors)
    .filter(([, message]) => typeof message === 'string' && message.trim().length > 0)

  return Object.fromEntries(normalizedEntries) as FormEditorErrors<T>
}

function hasErrors<T extends Record<string, unknown>>(errors: FormEditorErrors<T>): boolean {
  return Object.keys(errors).length > 0
}

function cloneValues<T>(values: T): T {
  const clone = globalThis.structuredClone
  if (typeof clone === 'function') {
    return clone(values)
  }

  return JSON.parse(JSON.stringify(values)) as T
}

function toErrorMessage(error: unknown, fallback: string): string {
  return getErrorMessage(error, fallback)
}
