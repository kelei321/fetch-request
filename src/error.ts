import type { RequestError } from './types'

const REQUEST_ERROR_FLAG: unique symbol = Symbol('requestError')

type InternalRequestError = RequestError & {
  [REQUEST_ERROR_FLAG]?: true
}

export function createRequestError(
  message: string,
  extra: Pick<RequestError, 'code' | 'status' | 'statusText' | 'response' | 'raw'> = {}
): RequestError {
  const error = new Error(message) as InternalRequestError
  error[REQUEST_ERROR_FLAG] = true
  Object.assign(error, extra)
  return error
}

export function isRequestError(error: unknown): error is RequestError {
  return error instanceof Error && (error as InternalRequestError)[REQUEST_ERROR_FLAG] === true
}

export function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}

export function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) {
    return error.message
  }
  return fallback
}
