import { createRequestClient } from '@kelei321/fetch-request'

const api = createRequestClient({
  baseURL: '/api'
})

api.addRequestInterceptor((context) => {
  const token = localStorage.getItem('token')

  if (token) {
    context.options.headers = {
      ...context.options.headers,
      Authorization: `Bearer ${token}`
    }
  }

  return context
})

api.addResponseInterceptor((context) => {
  if (context.response.status === 401) {
    localStorage.removeItem('token')
    window.location.href = '/login'
    return
  }

  return context.data
})

export async function getCurrentUser() {
  return api.request('/me')
}
