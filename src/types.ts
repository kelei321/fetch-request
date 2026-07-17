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

export type RequestClientConfigWithReturn<ReturnType extends ResponseReturnType> = Omit<
  RequestClientConfig,
  'responseReturn'
> & {
  responseReturn: ReturnType
}

export type RequestClientConfigWithoutReturn = Omit<RequestClientConfig, 'responseReturn'> & {
  responseReturn?: undefined
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

type ResponseConfigWithReturn<ReturnType extends ResponseReturnType> = Omit<
  Partial<ApiResponseConfig>,
  'responseReturn'
> & {
  responseReturn: ReturnType
}

type ResponseConfigWithoutReturn = Omit<Partial<ApiResponseConfig>, 'responseReturn'> & {
  responseReturn?: undefined
}

type RequestOptionsWithReturn<ReturnType extends ResponseReturnType> = Omit<RequestOptions, 'responseConfig'> & {
  responseConfig: ResponseConfigWithReturn<ReturnType>
}

type RequestOptionsWithoutReturn = Omit<RequestOptions, 'responseConfig'> & {
  responseConfig?: ResponseConfigWithoutReturn
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

type UploadRequestOptionsWithReturn<ReturnType extends ResponseReturnType> = Omit<
  UploadRequestOptions,
  'responseConfig'
> & {
  responseConfig: ResponseConfigWithReturn<ReturnType>
}

type UploadRequestOptionsWithoutReturn = Omit<UploadRequestOptions, 'responseConfig'> & {
  responseConfig?: ResponseConfigWithoutReturn
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

export interface ResponseErrorContext {
  error: RequestError
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

export type ResponseErrorInterceptor = (context: ResponseErrorContext) => Promise<void> | void

type ResolvedResponseResult<T, ReturnType extends ResponseReturnType> = ReturnType extends 'raw'
  ? RawResponseResult
  : T

interface RequestMethod<DefaultData, DefaultReturn extends ResponseReturnType> {
  <T = DefaultData>(path: string, options: RequestOptionsWithReturn<'raw'>): Promise<RawResponseResult>
  <T = DefaultData>(path: string, options: RequestOptionsWithReturn<'body' | 'data'>): Promise<T>
  <T = DefaultData>(path: string, options?: RequestOptionsWithoutReturn): Promise<
    ResolvedResponseResult<T, DefaultReturn>
  >
  <T = DefaultData>(path: string, options?: RequestOptions): Promise<T | RawResponseResult>
}

interface UploadRequestMethod<DefaultData, DefaultReturn extends ResponseReturnType> {
  <T = DefaultData>(path: string, options: UploadRequestOptionsWithReturn<'raw'>): Promise<RawResponseResult>
  <T = DefaultData>(path: string, options: UploadRequestOptionsWithReturn<'body' | 'data'>): Promise<T>
  <T = DefaultData>(path: string, options: UploadRequestOptionsWithoutReturn): Promise<
    ResolvedResponseResult<T, DefaultReturn>
  >
  <T = DefaultData>(path: string, options: UploadRequestOptions): Promise<T | RawResponseResult>
}

interface ConfigureMethod<DefaultData, DefaultReturn extends ResponseReturnType> {
  <NextReturn extends ResponseReturnType>(
    config: RequestClientConfigWithReturn<NextReturn>
  ): RequestClient<DefaultData, NextReturn>
  (config: RequestClientConfigWithoutReturn): RequestClient<DefaultData, DefaultReturn>
  (config: RequestClientConfig): RequestClient<DefaultData, ResponseReturnType>
}

export interface RequestClient<
  DefaultData = unknown,
  DefaultReturn extends ResponseReturnType = 'data'
> {
  request: RequestMethod<DefaultData, DefaultReturn>
  uploadRequest: UploadRequestMethod<DefaultData, DefaultReturn>
  addRequestInterceptor: (interceptor: RequestInterceptor) => () => void
  addResponseInterceptor: (interceptor: ResponseInterceptor) => () => void
  addResponseErrorInterceptor: (interceptor: ResponseErrorInterceptor) => () => void
  configure: ConfigureMethod<DefaultData, DefaultReturn>
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
