import assert from 'node:assert/strict'
import test from 'node:test'
import { ReadableStream } from 'node:stream/web'
import { createRequestClient } from '../dist/index.js'

function jsonResponse(body, status = 200, statusText = '') {
  return new Response(JSON.stringify(body), {
    status,
    statusText,
    headers: {
      'content-type': 'application/json'
    }
  })
}

async function withGlobal(name, value, run) {
  const hadOwnValue = Object.prototype.hasOwnProperty.call(globalThis, name)
  const previousValue = globalThis[name]
  globalThis[name] = value
  try {
    return await run()
  } finally {
    if (hadOwnValue) {
      globalThis[name] = previousValue
    } else {
      delete globalThis[name]
    }
  }
}

test('returns data, body, and raw response shapes', async () => {
  await withGlobal(
    'fetch',
    async () => jsonResponse({ code: 200, data: { id: 'u1' }, message: 'ok' }, 200, 'OK'),
    async () => {
      const client = createRequestClient({ baseURL: 'https://example.test' })

      assert.deepEqual(await client.request('/data'), { id: 'u1' })
      assert.deepEqual(
        await client.request('/body', {
          responseConfig: {
            responseReturn: 'body'
          }
        }),
        { code: 200, data: { id: 'u1' }, message: 'ok' }
      )

      const raw = await client.request('/raw', {
        responseConfig: {
          responseReturn: 'raw'
        }
      })
      assert.equal(raw.status, 200)
      assert.equal(raw.statusText, 'OK')
      assert.deepEqual(JSON.parse(raw.body), { code: 200, data: { id: 'u1' }, message: 'ok' })
    }
  )
})

test('runs response error interceptors for HTTP, business, and parse errors', async () => {
  const responses = [
    jsonResponse({ code: 401, message: 'expired' }, 401, 'Unauthorized'),
    jsonResponse({ code: 500, message: 'business failed' }, 200, 'OK'),
    new Response('<html>bad gateway</html>', {
      status: 502,
      statusText: 'Bad Gateway',
      headers: {
        'content-type': 'text/html'
      }
    })
  ]

  await withGlobal(
    'fetch',
    async () => responses.shift(),
    async () => {
      const client = createRequestClient({
        baseURL: 'https://example.test',
        responseErrorMessage: 'bad response'
      })
      const intercepted = []
      client.addRequestInterceptor((context) => ({
        ...context,
        meta: {
          ...context.meta,
          intercepted: true
        }
      }))
      client.addResponseErrorInterceptor((context) => {
        intercepted.push({
          status: context.response.status,
          raw: context.raw,
          meta: context.meta
        })
      })

      await assert.rejects(
        client.request('/http', { meta: { requestId: 'http' } }),
        (error) => error.message === 'expired' && error.status === 401 && error.response?.status === 401
      )
      await assert.rejects(
        client.request('/business', { meta: { requestId: 'business' } }),
        (error) => error.message === 'business failed' && error.code === 500 && error.status === 200
      )
      await assert.rejects(
        client.request('/parse', { meta: { requestId: 'parse' } }),
        (error) =>
          error.message === 'bad response' &&
          error.status === 502 &&
          error.statusText === 'Bad Gateway' &&
          error.response?.status === 502 &&
          error.raw === '<html>bad gateway</html>'
      )

      assert.deepEqual(
        intercepted.map((item) => item.status),
        [401, 200, 502]
      )
      assert.equal(intercepted[0].meta.requestId, 'http')
      assert.equal(intercepted[0].meta.intercepted, true)
      assert.equal(intercepted[2].raw, '<html>bad gateway</html>')
    }
  )
})

test('supports removing error interceptors and propagates interceptor failures', async () => {
  await withGlobal(
    'fetch',
    async () => jsonResponse({ code: 401, message: 'expired' }, 401, 'Unauthorized'),
    async () => {
      const client = createRequestClient({ baseURL: 'https://example.test' })
      const calls = []
      const remove = client.addResponseErrorInterceptor(() => {
        calls.push('removed')
      })
      remove()
      client.addResponseErrorInterceptor(() => {
        calls.push('first')
      })
      const interceptorError = new Error('interceptor failed')
      client.addResponseErrorInterceptor(() => {
        calls.push('second')
        throw interceptorError
      })
      client.addResponseErrorInterceptor(() => {
        calls.push('third')
      })

      await assert.rejects(client.request('/http'), (error) => error === interceptorError)
      assert.deepEqual(calls, ['first', 'second'])
    }
  )
})

test('raw responses and network errors do not enter the response error chain', async () => {
  const networkError = new Error('offline')
  const responses = [
    jsonResponse({ code: 401, message: 'expired' }, 401, 'Unauthorized'),
    networkError
  ]
  let errorInterceptorCalls = 0

  await withGlobal(
    'fetch',
    async () => {
      const next = responses.shift()
      if (next instanceof Error) {
        throw next
      }
      return next
    },
    async () => {
      const client = createRequestClient({
        baseURL: 'https://example.test',
        networkErrorMessage: 'network failed'
      })
      client.addResponseErrorInterceptor(() => {
        errorInterceptorCalls += 1
      })

      const raw = await client.request('/raw', {
        responseConfig: {
          responseReturn: 'raw'
        }
      })
      assert.equal(raw.status, 401)

      await assert.rejects(client.request('/network'), (error) => error.message === 'network failed')
      assert.equal(errorInterceptorCalls, 0)
    }
  )
})

test('only JSON data adds the application/json content type', async () => {
  const capturedOptions = []
  await withGlobal(
    'fetch',
    async (_url, options) => {
      capturedOptions.push(options)
      return jsonResponse({ code: 200, data: null })
    },
    async () => {
      const client = createRequestClient({ baseURL: 'https://example.test' })
      const formData = new FormData()
      formData.append('field', 'value')
      const bodies = [
        'plain text',
        new Uint8Array([1, 2, 3]),
        new ArrayBuffer(3),
        formData,
        new ReadableStream({
          start(controller) {
            controller.enqueue(new Uint8Array([1]))
            controller.close()
          }
        })
      ]

      for (const body of bodies) {
        await client.request('/body', {
          method: 'POST',
          body
        })
      }
      await client.request('/json', {
        method: 'POST',
        data: {
          id: 'u1'
        }
      })

      for (const options of capturedOptions.slice(0, bodies.length)) {
        assert.equal(new Headers(options.headers).has('content-type'), false)
      }
      const jsonOptions = capturedOptions.at(-1)
      assert.equal(new Headers(jsonOptions.headers).get('content-type'), 'application/json')
      assert.equal(jsonOptions.body, JSON.stringify({ id: 'u1' }))
    }
  )
})

test('propagates intercepted meta through fetch responses', async () => {
  await withGlobal(
    'fetch',
    async () => jsonResponse({ code: 200, data: { ok: true } }),
    async () => {
      const client = createRequestClient({ baseURL: 'https://example.test' })
      let responseMeta
      client.addRequestInterceptor((context) => ({
        ...context,
        meta: {
          ...context.meta,
          traceId: 'after-interceptor'
        }
      }))
      client.addResponseInterceptor((context) => {
        responseMeta = context.meta
        return context.data
      })

      await client.request('/meta', {
        meta: {
          traceId: 'before-interceptor'
        }
      })
      assert.equal(responseMeta.traceId, 'after-interceptor')
    }
  )
})

test('propagates intercepted meta through upload responses', async () => {
  class FakeXMLHttpRequest {
    upload = {}
    status = 200
    statusText = 'OK'
    responseText = JSON.stringify({ code: 200, data: { uploaded: true } })
    timeout = 0

    open() {}

    setRequestHeader() {}

    getAllResponseHeaders() {
      return 'content-type: application/json\r\n'
    }

    send() {
      queueMicrotask(() => this.onload?.())
    }

    abort() {
      queueMicrotask(() => this.onabort?.())
    }
  }

  await withGlobal('XMLHttpRequest', FakeXMLHttpRequest, async () => {
    const client = createRequestClient({ baseURL: 'https://example.test' })
    let responseMeta
    client.addRequestInterceptor((context) => ({
      ...context,
      meta: {
        ...context.meta,
        traceId: 'upload-after-interceptor'
      }
    }))
    client.addResponseInterceptor((context) => {
      responseMeta = context.meta
      return context.data
    })

    const result = await client.uploadRequest('/upload', {
      file: new Blob(['content']),
      meta: {
        traceId: 'upload-before-interceptor'
      }
    })
    assert.deepEqual(result, { uploaded: true })
    assert.equal(responseMeta.traceId, 'upload-after-interceptor')
  })
})
