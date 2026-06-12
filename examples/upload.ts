import { createRequestClient } from 'fetch-request'

const api = createRequestClient({
  baseURL: '/api',
  timeout: 30000
})

export async function uploadAvatar(file: File, userId: string) {
  return api.uploadRequest('/upload/avatar', {
    file,
    fieldName: 'avatar',
    data: {
      userId
    },
    onProgress(progress) {
      console.log(`upload progress: ${progress.percent}%`)
    }
  })
}
