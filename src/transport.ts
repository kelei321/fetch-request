import { normalizeHeaders } from './query'
import type { ResponseLike, UploadRequestOptions } from './types'

export function bindAbort(signal: AbortSignal | null | undefined, abort: () => void): () => void {
  if (!signal) {
    return () => {}
  }
  const abortHandler: EventListener = () => abort()
  if (signal.aborted) {
    abort()
    return () => {}
  }
  signal.addEventListener('abort', abortHandler, { once: true })
  return () => signal.removeEventListener('abort', abortHandler)
}

export function appendFormData(
  formData: FormData,
  data?: Record<string, FormDataEntryValue | FormDataEntryValue[] | null | undefined>
) {
  if (!data) {
    return
  }

  Object.entries(data).forEach(([key, value]) => {
    if (value === undefined || value === null) {
      return
    }
    if (Array.isArray(value)) {
      value.forEach((item) => formData.append(key, item))
      return
    }
    formData.append(key, value)
  })
}

export function setXhrHeaders(xhr: XMLHttpRequest, headers?: UploadRequestOptions['headers']) {
  Object.entries(headers || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      xhr.setRequestHeader(key, String(value))
    }
  })
}

export function createFetchResponse(response: Response): ResponseLike {
  return {
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    headers: normalizeHeaders(response.headers),
    text: () => response.text()
  }
}

export function createXhrResponse(xhr: XMLHttpRequest): ResponseLike {
  return {
    ok: xhr.status >= 200 && xhr.status < 300,
    status: xhr.status,
    statusText: xhr.statusText,
    headers: parseXhrHeaders(xhr.getAllResponseHeaders()),
    text: () => Promise.resolve(xhr.responseText || '')
  }
}

function parseXhrHeaders(headerText: string): Record<string, string> {
  return headerText
    .trim()
    .split(/[\r\n]+/)
    .filter(Boolean)
    .reduce<Record<string, string>>((headers, line) => {
      const separatorIndex = line.indexOf(':')
      if (separatorIndex === -1) {
        return headers
      }
      const key = line.slice(0, separatorIndex).trim().toLowerCase()
      const value = line.slice(separatorIndex + 1).trim()
      headers[key] = value
      return headers
    }, {})
}

export function removeInterceptor<T>(interceptors: T[], interceptor: T) {
  const index = interceptors.indexOf(interceptor)
  if (index > -1) {
    interceptors.splice(index, 1)
  }
}
