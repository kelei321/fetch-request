import { getResponseConfig, mergeClientConfig } from './config.js'
import { createRequestError, isAbortError, isRequestError } from './error.js'
import {
  appendQueryParams,
  buildUrl,
  isBodylessMethod,
  mergeRequestParams,
  normalizeFetchOptions,
  toRequestParams
} from './query.js'
import { handleResponse } from './response.js'
import {
  appendFormData,
  bindAbort,
  createFetchResponse,
  createXhrResponse,
  removeInterceptor,
  setXhrHeaders
} from './transport.js'
import type {
  RawResponseResult,
  RequestClient,
  RequestClientConfig,
  RequestClientConfigWithReturn,
  RequestClientConfigWithoutReturn,
  RequestContext,
  RequestInterceptor,
  RequestOptions,
  ResponseErrorInterceptor,
  ResponseInterceptor,
  ResponseReturnType,
  RuntimeRequestClientConfig,
  UploadRequestContext,
  UploadRequestOptions
} from './types.js'

export function createRequestClient<DefaultData = unknown>(
  config: RequestClientConfigWithReturn<'raw'>
): RequestClient<DefaultData, 'raw'>
export function createRequestClient<DefaultData = unknown>(
  config: RequestClientConfigWithReturn<'body'>
): RequestClient<DefaultData, 'body'>
export function createRequestClient<DefaultData = unknown>(
  config: RequestClientConfigWithReturn<'data'>
): RequestClient<DefaultData, 'data'>
export function createRequestClient<DefaultData = unknown>(
  config?: RequestClientConfigWithoutReturn
): RequestClient<DefaultData, 'data'>
export function createRequestClient<DefaultData = unknown>(
  config: RequestClientConfig
): RequestClient<DefaultData, ResponseReturnType>
export function createRequestClient<DefaultData = unknown>(
  config: RequestClientConfig = {}
): RequestClient<DefaultData, ResponseReturnType> {
  let currentConfig = mergeClientConfig(config)
  const requestInterceptors: RequestInterceptor[] = []
  const responseInterceptors: ResponseInterceptor[] = []
  const responseErrorInterceptors: ResponseErrorInterceptor[] = []

  const configure = (nextConfig: RuntimeRequestClientConfig): void => {
    if ((nextConfig as RequestClientConfig).responseReturn !== undefined) {
      throw new TypeError(
        'configure 不支持修改 responseReturn，请创建新客户端或使用单次请求的 responseConfig'
      )
    }
    currentConfig = mergeClientConfig(nextConfig, currentConfig)
  }

  const addRequestInterceptor = (interceptor: RequestInterceptor) => {
    requestInterceptors.push(interceptor)
    return () => removeInterceptor(requestInterceptors, interceptor)
  }

  const addResponseInterceptor = (interceptor: ResponseInterceptor) => {
    responseInterceptors.push(interceptor)
    return () => removeInterceptor(responseInterceptors, interceptor)
  }

  const addResponseErrorInterceptor = (interceptor: ResponseErrorInterceptor) => {
    responseErrorInterceptors.push(interceptor)
    return () => removeInterceptor(responseErrorInterceptors, interceptor)
  }

  const request = async <T = DefaultData>(
    path: string,
    options: RequestOptions = {}
  ): Promise<T | RawResponseResult> => {
    const configSnapshot = currentConfig
    const { timeout, signal, responseConfig, meta, data, params, arrayFormat, ...fetchOptions } = options
    const queryArrayFormat = arrayFormat ?? configSnapshot.arrayFormat
    const dataAsParams = isBodylessMethod(fetchOptions.method) ? toRequestParams(data) : undefined
    const requestData = dataAsParams ? undefined : data
    const normalizedOptions = normalizeFetchOptions(fetchOptions, requestData)
    const url = appendQueryParams(
      buildUrl(path, configSnapshot.baseURL),
      mergeRequestParams(params, dataAsParams),
      queryArrayFormat
    )
    const requestConfig = (await runRequestInterceptors(
      {
        type: 'request',
        path,
        url,
        options: normalizedOptions,
        meta
      },
      requestInterceptors
    )) as RequestContext

    const controller = new AbortController()
    const timer = globalThis.setTimeout(() => controller.abort(), timeout ?? configSnapshot.timeout)
    const cleanupAbort = bindAbort(signal, () => controller.abort())

    try {
      let response: Response
      try {
        response = await fetch(requestConfig.url, {
          ...requestConfig.options,
          signal: controller.signal
        })
      } catch (error) {
        if (isAbortError(error)) {
          throw createRequestError(configSnapshot.timeoutErrorMessage)
        }
        if (isRequestError(error)) {
          throw error
        }
        throw createRequestError(configSnapshot.networkErrorMessage)
      }
      return await handleResponse<T | RawResponseResult>(createFetchResponse(response), {
        config: getResponseConfig(configSnapshot, responseConfig),
        messages: configSnapshot,
        meta: requestConfig.meta,
        responseErrorInterceptors,
        responseInterceptors
      })
    } finally {
      globalThis.clearTimeout(timer)
      cleanupAbort()
    }
  }

  const uploadRequest = async <T = DefaultData>(
    path: string,
    options: UploadRequestOptions
  ): Promise<T | RawResponseResult> => {
    const configSnapshot = currentConfig
    const { timeout, signal, responseConfig, meta, onProgress, ...uploadOptions } = options
    const url = buildUrl(path, configSnapshot.baseURL)
    const requestConfig = (await runRequestInterceptors(
      {
        type: 'upload',
        path,
        url,
        options: uploadOptions,
        meta
      },
      requestInterceptors
    )) as UploadRequestContext

    return new Promise<T | RawResponseResult>((resolve, reject) => {
      if (!requestConfig.options.file) {
        reject(createRequestError('请选择上传文件'))
        return
      }

      const xhr = new XMLHttpRequest()
      const formData = new FormData()
      formData.append(requestConfig.options.fieldName || 'file', requestConfig.options.file)
      appendFormData(formData, requestConfig.options.data)

      if (signal?.aborted) {
        reject(createRequestError(configSnapshot.timeoutErrorMessage))
        return
      }

      const cleanupAbort = bindAbort(signal, () => xhr.abort())
      const rejectWith = (message: string) => {
        cleanupAbort()
        reject(createRequestError(message))
      }

      xhr.open(requestConfig.options.method || 'POST', requestConfig.url)
      xhr.timeout = timeout ?? configSnapshot.timeout
      setXhrHeaders(xhr, requestConfig.options.headers)

      xhr.upload.onprogress = (event) => {
        if (!event.lengthComputable || typeof onProgress !== 'function') {
          return
        }
        onProgress({
          loaded: event.loaded,
          total: event.total,
          percent: Math.round((event.loaded / event.total) * 100)
        })
      }

      xhr.onload = async () => {
        cleanupAbort()
        try {
          const response = createXhrResponse(xhr)
          const result = await handleResponse<T | RawResponseResult>(response, {
            config: getResponseConfig(configSnapshot, responseConfig),
            messages: configSnapshot,
            meta: requestConfig.meta,
            responseErrorInterceptors,
            responseInterceptors
          })
          resolve(result)
        } catch (error) {
          reject(error)
        }
      }

      xhr.onerror = () => rejectWith(configSnapshot.networkErrorMessage)
      xhr.ontimeout = () => rejectWith(configSnapshot.timeoutErrorMessage)
      xhr.onabort = () => rejectWith(configSnapshot.timeoutErrorMessage)

      xhr.send(formData)
    })
  }

  return {
    request: request as RequestClient<DefaultData, ResponseReturnType>['request'],
    uploadRequest: uploadRequest as RequestClient<DefaultData, ResponseReturnType>['uploadRequest'],
    addRequestInterceptor,
    addResponseInterceptor,
    addResponseErrorInterceptor,
    configure
  }
}

async function runRequestInterceptors(
  context: RequestContext | UploadRequestContext,
  interceptors: RequestInterceptor[]
): Promise<RequestContext | UploadRequestContext> {
  let intercepted = context
  for (const interceptor of interceptors) {
    const nextContext: RequestContext | UploadRequestContext | void = await Promise.resolve(interceptor(intercepted))
    if (nextContext) {
      intercepted = nextContext
    }
  }
  return intercepted
}
