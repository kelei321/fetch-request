import type { ApiResponseConfig, QueryArrayFormat, RequestClientConfig, ResolvedRequestClientConfig } from './types'

const DEFAULT_BASE_URL = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env?.VITE_API_PREFIX || '/api'
const DEFAULT_TIMEOUT = 15000
const DEFAULT_NETWORK_ERROR_MESSAGE = '网络异常，请稍后重试'
const DEFAULT_RESPONSE_ERROR_MESSAGE = '服务响应异常，请稍后重试'
const DEFAULT_TIMEOUT_ERROR_MESSAGE = '请求已取消或超时，请稍后重试'
const DEFAULT_ARRAY_FORMAT: QueryArrayFormat = 'indices'

const DEFAULT_RESPONSE_CONFIG: ApiResponseConfig = {
  codeField: 'code',
  dataField: 'data',
  messageFields: ['message', 'msg'],
  successCodes: [200, 0],
  allowRawResponse: true,
  responseReturn: 'data'
}

export function mergeClientConfig(
  config: RequestClientConfig,
  base?: ResolvedRequestClientConfig
): ResolvedRequestClientConfig {
  return {
    baseURL: config.baseURL ?? base?.baseURL ?? DEFAULT_BASE_URL,
    timeout: config.timeout ?? base?.timeout ?? DEFAULT_TIMEOUT,
    networkErrorMessage: config.networkErrorMessage ?? base?.networkErrorMessage ?? DEFAULT_NETWORK_ERROR_MESSAGE,
    responseErrorMessage: config.responseErrorMessage ?? base?.responseErrorMessage ?? DEFAULT_RESPONSE_ERROR_MESSAGE,
    timeoutErrorMessage: config.timeoutErrorMessage ?? base?.timeoutErrorMessage ?? DEFAULT_TIMEOUT_ERROR_MESSAGE,
    arrayFormat: config.arrayFormat ?? base?.arrayFormat ?? DEFAULT_ARRAY_FORMAT,
    response: {
      ...DEFAULT_RESPONSE_CONFIG,
      ...(base?.response || {}),
      ...pickResponseConfig(config)
    }
  }
}

function pickResponseConfig(config: RequestClientConfig): Partial<ApiResponseConfig> {
  const result: Partial<ApiResponseConfig> = {}
  if (config.codeField !== undefined) result.codeField = config.codeField
  if (config.dataField !== undefined) result.dataField = config.dataField
  if (config.messageFields !== undefined) result.messageFields = config.messageFields
  if (config.successCodes !== undefined) result.successCodes = config.successCodes
  if (config.allowRawResponse !== undefined) result.allowRawResponse = config.allowRawResponse
  if (config.responseReturn !== undefined) result.responseReturn = config.responseReturn
  return result
}

export function getResponseConfig(
  clientConfig: ResolvedRequestClientConfig,
  responseConfig?: Partial<ApiResponseConfig>
): ApiResponseConfig {
  return {
    ...clientConfig.response,
    ...(responseConfig || {})
  }
}
