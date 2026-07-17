import { createRequestError } from './error.js'
import type { QueryArrayFormat, RequestParam, RequestParams, RequestParamValue } from './types.js'

export function normalizeFetchOptions(options: RequestInit, data?: unknown): RequestInit {
  const headers = normalizeHeaders(options.headers)
  const hasData = data !== undefined
  const normalizedOptions: RequestInit = hasData
    ? {
        ...options,
        body: JSON.stringify(data)
      }
    : options
  const shouldUseJsonContentType = hasData && !hasHeader(headers, 'content-type')

  return {
    ...normalizedOptions,
    headers: {
      ...(shouldUseJsonContentType ? { 'Content-Type': 'application/json' } : {}),
      ...headers
    }
  }
}

export function normalizeHeaders(headers?: HeadersInit): Record<string, string> {
  if (!headers) {
    return {}
  }
  if (headers instanceof Headers) {
    return Object.fromEntries(headers.entries())
  }
  if (Array.isArray(headers)) {
    return Object.fromEntries(headers)
  }
  return headers
}

export function isBodylessMethod(method?: string): boolean {
  const normalizedMethod = (method || 'GET').toUpperCase()
  return normalizedMethod === 'GET' || normalizedMethod === 'HEAD'
}

function hasHeader(headers: Record<string, string>, name: string): boolean {
  return Object.keys(headers).some((key) => key.toLowerCase() === name.toLowerCase())
}

export function toRequestParams(data: unknown): RequestParams | undefined {
  if (data === undefined) {
    return undefined
  }
  if (!isRecord(data)) {
    throw createRequestError('GET/HEAD 请求 data 仅支持对象参数')
  }
  Object.entries(data).forEach(([key, value]) => {
    if (!isRequestParam(value)) {
      throw createRequestError(`GET/HEAD 请求 data.${key} 包含不支持的查询参数类型`)
    }
  })
  return data as RequestParams
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype
}

function isRequestParam(value: unknown): value is RequestParam {
  if (isRequestParamValue(value)) {
    return true
  }
  if (Array.isArray(value)) {
    return value.every(isRequestParam)
  }
  if (isRecord(value)) {
    return Object.values(value).every(isRequestParam)
  }
  return false
}

function isRequestParamValue(value: unknown): value is RequestParamValue {
  return (
    value === null ||
    value === undefined ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  )
}

export function mergeRequestParams(params?: RequestParams, dataParams?: RequestParams): RequestParams | undefined {
  if (!params) {
    return dataParams
  }
  if (!dataParams) {
    return params
  }
  return {
    ...dataParams,
    ...params
  }
}

export function appendQueryParams(url: string, params: RequestParams | undefined, arrayFormat: QueryArrayFormat): string {
  if (!params) {
    return url
  }

  const [urlWithoutHash, hash = ''] = url.split('#', 2)
  const [pathname, search = ''] = urlWithoutHash.split('?', 2)
  const searchParams = new URLSearchParams(search)

  Object.entries(params).forEach(([key, value]) => appendQueryValue(searchParams, key, value, arrayFormat))

  const query = searchParams.toString()
  const hashSuffix = hash ? `#${hash}` : ''
  return `${pathname}${query ? `?${query}` : ''}${hashSuffix}`
}

function appendQueryValue(
  searchParams: URLSearchParams,
  key: string,
  value: RequestParam,
  arrayFormat: QueryArrayFormat
) {
  if (value === undefined || value === null) {
    return
  }
  if (Array.isArray(value)) {
    appendQueryArray(searchParams, key, value, arrayFormat)
    return
  }
  if (isRecord(value)) {
    Object.entries(value).forEach(([childKey, childValue]) => {
      appendQueryValue(searchParams, `${key}[${childKey}]`, childValue, arrayFormat)
    })
    return
  }
  searchParams.append(key, String(value))
}

function appendQueryArray(
  searchParams: URLSearchParams,
  key: string,
  value: RequestParam[],
  arrayFormat: QueryArrayFormat
) {
  if (arrayFormat === 'comma') {
    appendCommaArray(searchParams, key, value)
    return
  }
  value.forEach((item, index) => {
    const arrayKey = getArrayKey(key, index, arrayFormat)
    appendQueryValue(searchParams, arrayKey, item, arrayFormat)
  })
}

function appendCommaArray(searchParams: URLSearchParams, key: string, value: RequestParam[]) {
  const values = value.filter((item) => item !== undefined && item !== null)
  if (!values.length) {
    return
  }
  if (!values.every(isRequestParamValue)) {
    throw createRequestError(`arrayFormat 为 comma 时 ${key} 仅支持基础类型数组`)
  }
  searchParams.append(key, values.map(String).join(','))
}

function getArrayKey(key: string, index: number, arrayFormat: QueryArrayFormat): string {
  if (arrayFormat === 'brackets') {
    return `${key}[]`
  }
  if (arrayFormat === 'repeat') {
    return key
  }
  return `${key}[${index}]`
}

export function buildUrl(path: string, baseURL: string): string {
  if (/^https?:\/\//i.test(path)) {
    return path
  }
  const normalizedBase = baseURL.replace(/\/+$/, '')
  const normalizedPath = path.replace(/^\/+/, '')

  if (!normalizedBase) {
    return `/${normalizedPath}`
  }
  if (!normalizedPath) {
    return normalizedBase
  }
  return `${normalizedBase}/${normalizedPath}`
}
