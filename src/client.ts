import { getResponseConfig, mergeClientConfig } from './config'
import { createRequestError, getErrorMessage, isAbortError, isRequestError } from './error'
import {
  appendQueryParams,
  buildUrl,
  isBodylessMethod,
  mergeRequestParams,
  normalizeFetchOptions,
  toRequestParams
} from './query'
import { handleResponse } from './response'
import {
  appendFormData,
  bindAbort,
  createFetchResponse,
  createXhrResponse,
  removeInterceptor,
  setXhrHeaders
} from './transport'
import type {
  RequestClient,
  RequestClientConfig,
  RequestContext,
  RequestInterceptor,
  RequestOptions,
  ResponseInterceptor,
  UploadRequestContext,
  UploadRequestOptions
} from './types'

export function createRequestClient<DefaultData = unknown>(config: RequestClientConfig = {}): RequestClient<DefaultData> {
  let currentConfig = mergeClientConfig(config)
  const requestInterceptors: RequestInterceptor[] = []
  const responseInterceptors: ResponseInterceptor[] = []

  const configure = (nextConfig: RequestClientConfig) => {
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

  const request = async <T = DefaultData>(path: string, options: RequestOptions = {}): Promise<T> => {
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
      const response = await fetch(requestConfig.url, {
        ...requestConfig.options,
        signal: controller.signal
      })
      return await handleResponse<T>(createFetchResponse(response), {
        config: getResponseConfig(configSnapshot, responseConfig),
        messages: configSnapshot,
        meta,
        responseInterceptors
      })
    } catch (error) {
      if (isAbortError(error)) {
        throw createRequestError(configSnapshot.timeoutErrorMessage)
      }
      if (isRequestError(error)) {
        throw error
      }
      throw createRequestError(configSnapshot.networkErrorMessage)
    } finally {
      globalThis.clearTimeout(timer)
      cleanupAbort()
    }
  }

  const uploadRequest = async <T = DefaultData>(path: string, options: UploadRequestOptions): Promise<T> => {
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

    return new Promise<T>((resolve, reject) => {
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
          const result = await handleResponse<T>(response, {
            config: getResponseConfig(configSnapshot, responseConfig),
            messages: configSnapshot,
            meta,
            responseInterceptors
          })
          resolve(result)
        } catch (error) {
          reject(isRequestError(error) ? error : createRequestError(getErrorMessage(error, configSnapshot.networkErrorMessage)))
        }
      }

      xhr.onerror = () => rejectWith(configSnapshot.networkErrorMessage)
      xhr.ontimeout = () => rejectWith(configSnapshot.timeoutErrorMessage)
      xhr.onabort = () => rejectWith(configSnapshot.timeoutErrorMessage)

      xhr.send(formData)
    })
  }

  return {
    request,
    uploadRequest,
    addRequestInterceptor,
    addResponseInterceptor,
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
