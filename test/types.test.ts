import { createRequestClient } from 'fetch-request'
import type { RawResponseResult } from 'fetch-request'

type User = {
  id: string
}

type UserBody = {
  code: number
  data: User
}

function expectType<T>(_value: T) {}

const client = createRequestClient<User>()

expectType<Promise<User>>(client.request('/user'))
expectType<Promise<UserBody>>(
  client.request<UserBody>('/user', {
    responseConfig: {
      responseReturn: 'body'
    }
  })
)
expectType<Promise<RawResponseResult>>(
  client.request<User>('/user', {
    responseConfig: {
      responseReturn: 'raw'
    }
  })
)
expectType<Promise<RawResponseResult>>(
  client.uploadRequest<User>('/upload', {
    file: new Blob(),
    responseConfig: {
      responseReturn: 'raw'
    }
  })
)

const rawClient = createRequestClient<User>({
  responseReturn: 'raw'
})
expectType<Promise<RawResponseResult>>(rawClient.request('/user'))

const configuredRawClient = client.configure({
  responseReturn: 'raw'
})
expectType<Promise<RawResponseResult>>(configuredRawClient.request('/user'))
expectType<Promise<RawResponseResult>>(configuredRawClient.configure({ timeout: 1000 }).request('/user'))

// @ts-expect-error raw 响应不能被当作业务数据。
const invalidRawResult: Promise<User> = client.request('/user', {
  responseConfig: {
    responseReturn: 'raw'
  }
})

void invalidRawResult
