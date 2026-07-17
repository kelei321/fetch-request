import { createRequestError, isAbortError, isRequestError } from './error.js'
import type {
  ApiResponseConfig,
  FieldPath,
  RawResponseResult,
  RequestError,
  RequestMeta,
  ResolvedRequestClientConfig,
  ResponseErrorInterceptor,
  ResponseInterceptor,
  ResponseLike
} from './types.js'

export async function handleResponse<T>(
  response: ResponseLike,
  options: {
    config: ApiResponseConfig
    messages: Pick<ResolvedRequestClientConfig, 'responseErrorMessage' | 'timeoutErrorMessage'>
    meta?: RequestMeta
    responseErrorInterceptors: ResponseErrorInterceptor[]
    responseInterceptors: ResponseInterceptor[]
  }
): Promise<T> {
  const responseText = await readResponseText(response, options.messages)

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

  let body: unknown
  let parsed: T | RawResponseResult | null
  try {
    body = parseResponseText(response, responseText, options.messages.responseErrorMessage)
    parsed = parseResponse<T>(response, body, options.config, options.messages.responseErrorMessage)
  } catch (error) {
    if (!isRequestError(error)) {
      throw error
    }
    await runResponseErrorInterceptors(error, response, options)
    throw error
  }

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

async function runResponseErrorInterceptors(
  error: RequestError,
  response: ResponseLike,
  options: {
    config: ApiResponseConfig
    meta?: RequestMeta
    responseErrorInterceptors: ResponseErrorInterceptor[]
  }
) {
  for (const interceptor of [...options.responseErrorInterceptors]) {
    await interceptor({
      error,
      response,
      raw: error.raw,
      config: options.config,
      meta: options.meta
    })
  }
}

async function readResponseText(
  response: ResponseLike,
  messages: Pick<ResolvedRequestClientConfig, 'responseErrorMessage' | 'timeoutErrorMessage'>
): Promise<string> {
  try {
    return await response.text()
  } catch (error) {
    const extra = getResponseErrorExtra(response, undefined)
    if (isAbortError(error)) {
      throw createRequestError(messages.timeoutErrorMessage, extra)
    }
    throw createRequestError(messages.responseErrorMessage, extra)
  }
}

function parseResponseText(response: ResponseLike, responseText: string, responseErrorMessage: string): unknown {
  try {
    return responseText ? JSON.parse(responseText) : null
  } catch (error) {
    throw createRequestError(responseErrorMessage, getResponseErrorExtra(response, responseText))
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
