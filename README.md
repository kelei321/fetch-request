# fetch-request

一个轻量的 TypeScript 请求客户端封装，基于 `fetch` 实现普通请求，并使用 `XMLHttpRequest` 支持上传进度。适合在 Vue、React、uni-app H5、Vite 等前端项目里作为统一请求层使用。

## 特性

- 基于 `fetch` 的统一请求入口
- TypeScript 类型友好，支持请求返回值泛型
- 支持 `baseURL`、超时、统一错误文案
- 支持请求拦截器、响应拦截器和响应错误拦截器
- 支持业务响应结构解析，例如 `{ code, data, message }`
- 支持 GET/HEAD 自动把 `data` 转成 query 参数
- 支持数组 query 序列化：`indices`、`brackets`、`repeat`、`comma`
- 支持文件上传和上传进度回调

## 安装

当前仓库可以先作为源码工具库使用：

```bash
git clone https://github.com/kelei321/fetch-request.git
```

也可以后续发布为 npm 包后安装：

```bash
npm install fetch-request
```

## 快速开始

```ts
import { createRequestClient } from 'fetch-request'

type User = {
  id: string
  name: string
}

const api = createRequestClient({
  baseURL: '/api',
  timeout: 15000
})

const user = await api.request<User>('/users/current')
```

默认会按下面这种响应结构取 `data`：

```json
{
  "code": 200,
  "data": {},
  "message": "success"
}
```

默认成功码是 `200` 和 `0`。

## 创建客户端

```ts
import { createRequestClient } from 'fetch-request'

const requestClient = createRequestClient({
  baseURL: import.meta.env.VITE_API_PREFIX || '/api',
  timeout: 15000,
  networkErrorMessage: '网络异常，请稍后重试',
  responseErrorMessage: '服务响应异常，请稍后重试',
  timeoutErrorMessage: '请求已取消或超时，请稍后重试'
})
```

如果没有显式传入 `baseURL`，默认会读取 `import.meta.env.VITE_API_PREFIX`，读取不到时使用 `/api`。

## 请求示例

### GET 请求

```ts
const list = await requestClient.request('/records/timeline', {
  params: {
    baby_id: 'baby_001',
    limit: 30
  }
})
```

### GET 请求使用 data

GET / HEAD 请求中传入的 `data` 会自动合并到 query 参数里：

```ts
const list = await requestClient.request('/records/timeline', {
  method: 'GET',
  data: {
    baby_id: 'baby_001',
    limit: 30
  }
})
```

### POST 请求

```ts
type CreateRecordResult = {
  id: string
}

const result = await requestClient.request<CreateRecordResult>('/records', {
  method: 'POST',
  data: {
    type: 'feeding',
    start_time: new Date().toISOString(),
    data: {
      amount: 120,
      unit: 'ml'
    }
  }
})
```

### 原生请求体

需要发送二进制、表单、流或文本时，使用 `RequestInit.body`。库只会为通过 `data` 序列化的 JSON 自动添加 `Content-Type: application/json`：

```ts
await requestClient.request('/binary', {
  method: 'POST',
  body: new Uint8Array([1, 2, 3])
})
```

### 自定义请求头

```ts
const result = await requestClient.request('/profile', {
  headers: {
    Authorization: `Bearer ${token}`
  }
})
```

## 响应解析配置

默认配置：

```ts
{
  codeField: 'code',
  dataField: 'data',
  messageFields: ['message', 'msg'],
  successCodes: [200, 0],
  allowRawResponse: true,
  responseReturn: 'data'
}
```

### 返回完整 body

```ts
const body = await requestClient.request('/users/current', {
  responseConfig: {
    responseReturn: 'body'
  }
})
```

### 返回原始响应信息

```ts
const raw = await requestClient.request('/users/current', {
  responseConfig: {
    responseReturn: 'raw'
  }
})

console.log(raw.status, raw.headers, raw.body)
```

当 `responseReturn` 为 `raw` 时，返回值会自动推导为 `RawResponseResult`，并且不会按 HTTP 状态或业务码抛错。

### 适配不同字段名

```ts
const api = createRequestClient({
  codeField: 'status.code',
  dataField: 'result',
  messageFields: ['status.message', 'message'],
  successCodes: ['SUCCESS']
})
```

## 拦截器

### 请求拦截器

```ts
const removeRequestInterceptor = requestClient.addRequestInterceptor((context) => {
  const token = localStorage.getItem('token')

  if (token) {
    context.options.headers = {
      ...context.options.headers,
      Authorization: `Bearer ${token}`
    }
  }

  return context
})
```

### 响应拦截器

```ts
const removeResponseInterceptor = requestClient.addResponseInterceptor((context) => {
  console.log(context.response.status)
  return context.data
})
```

响应拦截器只处理成功解析后的响应，可以返回新值交给下一个响应拦截器。

### 响应错误拦截器

HTTP 错误、业务码错误和响应解析错误会依次经过响应错误拦截器：

```ts
const removeResponseErrorInterceptor = requestClient.addResponseErrorInterceptor((context) => {
  if (context.error.status === 401) {
    localStorage.removeItem('token')
    window.location.href = '/login'
  }
})
```

错误拦截器用于日志、鉴权失效等副作用，执行完成后原始 `RequestError` 仍会抛出。错误拦截器自身抛错时会停止后续错误拦截器，并传播该错误。网络错误、超时、主动取消以及 `responseReturn: 'raw'` 不会进入响应错误拦截器。

拦截器注册后会返回一个移除函数：

```ts
removeRequestInterceptor()
removeResponseInterceptor()
removeResponseErrorInterceptor()
```

## 上传文件

`uploadRequest` 使用 `XMLHttpRequest`，适合浏览器环境里需要上传进度的场景。

```ts
const file = fileInput.files?.[0]

if (file) {
  const result = await requestClient.uploadRequest('/upload/avatar', {
    file,
    fieldName: 'avatar',
    data: {
      userId: 'u_001'
    },
    onProgress(progress) {
      console.log(progress.percent)
    }
  })
}
```

## Query 数组格式

```ts
await requestClient.request('/search', {
  params: {
    tags: ['vue', 'typescript']
  },
  arrayFormat: 'repeat'
})
```

支持格式：

| arrayFormat | 输出示例 |
| --- | --- |
| `indices` | `tags[0]=vue&tags[1]=typescript` |
| `brackets` | `tags[]=vue&tags[]=typescript` |
| `repeat` | `tags=vue&tags=typescript` |
| `comma` | `tags=vue,typescript` |

## 错误处理

请求失败时会抛出 `RequestError`：

```ts
import type { RequestError } from 'fetch-request'

try {
  await requestClient.request('/records')
} catch (error) {
  const requestError = error as RequestError
  console.error(requestError.message)
  console.error(requestError.status)
  console.error(requestError.code)
}
```

## 动态更新配置

```ts
requestClient.configure({
  baseURL: '/new-api',
  timeout: 10000
})
```

如果动态修改默认 `responseReturn`，请使用 `configure` 返回的同一客户端实例，以获得更新后的返回类型：

```ts
const rawClient = requestClient.configure({
  responseReturn: 'raw'
})

const raw = await rawClient.request('/health')
console.log(raw.status)
```

## 示例文件

仓库内提供了几个示例：

- `examples/basic.ts`：基础 GET / POST 用法
- `examples/interceptors.ts`：请求和响应拦截器
- `examples/upload.ts`：浏览器上传进度

## 开发

```bash
npm install
npm run typecheck
npm test
npm run build
```

发布前的 `prepack` 会自动清理并重新构建 `dist`。构建产物为纯 ESM，可用于浏览器打包器和 Node.js 18+。

## 注意事项

- 普通请求依赖运行环境提供 `fetch` 和 `AbortController`。
- 上传进度依赖 `XMLHttpRequest`，主要面向浏览器环境。
- 默认响应解析面向 `{ code, data, message }` 结构；如果后端直接返回原始 JSON，默认 `allowRawResponse: true` 会直接返回原始 body。
- 包仅提供 ESM 产物，不提供 CommonJS `require()` 入口。
