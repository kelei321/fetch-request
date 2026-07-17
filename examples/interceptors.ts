import { createRequestClient } from 'fetch-request'

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
  return context.data
})

api.addResponseErrorInterceptor((context) => {
  if (context.error.status === 401) {
    localStorage.removeItem('token')
    window.location.href = '/login'
  }
})

export async function getCurrentUser() {
  return api.request('/me')
}
