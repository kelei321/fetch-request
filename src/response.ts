import { createRequestError } from './error'
import type {
  ApiResponseConfig,
  FieldPath,
  RawResponseResult,
  RequestError,
  RequestMeta,
  ResolvedRequestClientConfig,
  ResponseInterceptor,
  ResponseLike
} from './types'

export async function handleResponse<T>(
  response: ResponseLike,
  options: {
    config: ApiResponseConfig
    messages: Pick<ResolvedRequestClientConfig, 'networkErrorMessage' | 'responseErrorMessage'>
    meta?: RequestMeta
    responseInterceptors: ResponseInterceptor[]
  }
): Promise<T> {
  const responseText = await response.text()

  if (options.config.responseReturn === 'raw') {
    return runResponseInterceptors<T>(
      {
        response,
        body: responseText,
        headers: response.headers,
        status: response.status,
        statusText: response.statusText
      },
      response,
      responseText,
      options
    )
  }

  const body = parseResponseText(responseText, options.messages.responseErrorMessage)
  const parsed = parseResponse<T>(response, body, options.config, options.messages.responseErrorMessage)
  return runResponseInterceptors<T>(parsed, response, body, options)
}

async function runResponseInterceptors<T>(
  data: unknown,
  response: ResponseLike,
  raw: unknown,
  options: {
    config: ApiResponseConfig
    meta?: RequestMeta
    responseInterceptors: ResponseInterceptor[]
  }
): Promise<T> {
  let nextData = data
  for (const interceptor of options.responseInterceptors) {
    const intercepted = await interceptor({
      data: nextData,
      response,
      raw,
      config: options.config,
      meta: options.meta
    })
    if (intercepted !== undefined) {
      nextData = intercepted
    }
  }
  return nextData as T
}

function parseResponseText(responseText: string, responseErrorMessage: string): unknown {
  try {
    return responseText ? JSON.parse(responseText) : null
  } catch (error) {
    throw createRequestError(responseErrorMessage, { raw: responseText })
  }
}

function parseResponse<T>(
  response: ResponseLike,
  body: unknown,
  config: ApiResponseConfig,
  responseErrorMessage: string
): T | RawResponseResult | null {
  if (response.ok && body === null) {
    return null
  }
  if (body === null) {
    throw createRequestError(responseErrorMessage, getResponseErrorExtra(response, body))
  }

  if (!response.ok) {
    throw createRequestError(getBusinessMessage(body, config) || responseErrorMessage, {
      code: getByPath(body, config.codeField),
      ...getResponseErrorExtra(response, body)
    })
  }

  if (config.responseReturn === 'body') {
    return body as T
  }

  const code = getByPath(body, config.codeField)
  const hasCode = code !== undefined

  if (!hasCode && config.allowRawResponse) {
    return body as T
  }

  const success = hasCode && config.successCodes.some((successCode) => String(successCode) === String(code))
  if (!success) {
    throw createRequestError(getBusinessMessage(body, config) || responseErrorMessage, {
      code,
      ...getResponseErrorExtra(response, body)
    })
  }

  return getByPath(body, config.dataField) as T
}

function getResponseErrorExtra(
  response: ResponseLike,
  raw: unknown
): Pick<RequestError, 'status' | 'statusText' | 'response' | 'raw'> {
  return {
    status: response.status,
    statusText: response.statusText,
    response,
    raw
  }
}

function getBusinessMessage(raw: unknown, config: ApiResponseConfig): string {
  for (const field of config.messageFields) {
    const value = getByPath(raw, field)
    if (value !== undefined && value !== null && value !== '') {
      return String(value)
    }
  }
  return ''
}

function getByPath(source: unknown, path: FieldPath): unknown {
  if (!path) {
    return undefined
  }

  return path.split('.').reduce<unknown>((current, key) => {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined
    }
    return (current as Record<string, unknown>)[key]
  }, source)
}
