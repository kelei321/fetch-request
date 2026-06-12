export type FieldPath = string
export type SuccessCode = string | number
export type ResponseReturnType = 'body' | 'data' | 'raw'
export type QueryArrayFormat = 'indices' | 'brackets' | 'repeat' | 'comma'

export interface RawResponseResult {
  response: ResponseLike
  body: unknown
  headers: Record<string, string>
  status: number
  statusText: string
}

export interface ApiResponseConfig {
  codeField: FieldPath
  dataField: FieldPath
  messageFields: FieldPath[]
  successCodes: SuccessCode[]
  allowRawResponse: boolean
  responseReturn: ResponseReturnType
}

export interface RequestClientConfig extends Partial<ApiResponseConfig> {
  baseURL?: string
  timeout?: number
  networkErrorMessage?: string
  responseErrorMessage?: string
  timeoutErrorMessage?: string
  arrayFormat?: QueryArrayFormat
}

export interface RequestMeta {
  [key: string]: unknown
}

export type RequestParamValue = string | number | boolean | null | undefined
export type RequestParam = RequestParamValue | RequestParam[] | { [key: string]: RequestParam }
export type RequestParams = Record<string, RequestParam>

export interface RequestOptions extends RequestInit {
  data?: unknown
  params?: RequestParams
  arrayFormat?: QueryArrayFormat
  timeout?: number
  responseConfig?: Partial<ApiResponseConfig>
  meta?: RequestMeta
}

export interface UploadProgress {
  loaded: number
  total: number
  percent: number
}

export interface UploadRequestOptions {
  file: Blob
  method?: string
  fieldName?: string
  data?: Record<string, FormDataEntryValue | FormDataEntryValue[] | null | undefined>
  headers?: Record<string, string | number | boolean | null | undefined>
  timeout?: number
  signal?: AbortSignal
  responseConfig?: Partial<ApiResponseConfig>
  meta?: RequestMeta
  onProgress?: (progress: UploadProgress) => void
}

export interface RequestContext {
  type: 'request'
  path: string
  url: string
  options: RequestInit
  meta?: RequestMeta
}

export interface UploadRequestContext {
  type: 'upload'
  path: string
  url: string
  options: Omit<UploadRequestOptions, 'timeout' | 'signal' | 'responseConfig' | 'meta' | 'onProgress'>
  meta?: RequestMeta
}

export interface ResponseContext<T = unknown> {
  data: T
  response: ResponseLike
  raw: unknown
  config: ApiResponseConfig
  meta?: RequestMeta
}

export interface RequestError extends Error {
  code?: unknown
  status?: number
  statusText?: string
  response?: ResponseLike
  raw?: unknown
}

export type RequestInterceptor = (
  context: RequestContext | UploadRequestContext
) => Promise<RequestContext | UploadRequestContext | void> | RequestContext | UploadRequestContext | void

export type ResponseInterceptor = (
  context: ResponseContext
) => Promise<unknown | void> | unknown | void

export interface RequestClient<DefaultData = unknown> {
  request: <T = DefaultData>(path: string, options?: RequestOptions) => Promise<T>
  uploadRequest: <T = DefaultData>(path: string, options: UploadRequestOptions) => Promise<T>
  addRequestInterceptor: (interceptor: RequestInterceptor) => () => void
  addResponseInterceptor: (interceptor: ResponseInterceptor) => () => void
  configure: (config: RequestClientConfig) => void
}

export interface ResolvedRequestClientConfig {
  baseURL: string
  timeout: number
  networkErrorMessage: string
  responseErrorMessage: string
  timeoutErrorMessage: string
  arrayFormat: QueryArrayFormat
  response: ApiResponseConfig
}

export interface ResponseLike {
  ok: boolean
  status: number
  statusText: string
  headers: Record<string, string>
  text: () => Promise<string>
}
