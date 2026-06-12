import { createRequestClient } from '@kelei321/fetch-request'

type TimelineRecord = {
  id: string
  type: string
  start_time: string
  data: Record<string, unknown>
}

type TimelineResult = {
  records: TimelineRecord[]
  hasMore: boolean
}

type CreateRecordResult = {
  id: string
}

const api = createRequestClient({
  baseURL: '/api',
  timeout: 15000
})

export async function getTimeline(babyId: string) {
  return api.request<TimelineResult>('/records/timeline', {
    params: {
      baby_id: babyId,
      limit: 30
    }
  })
}

export async function createFeedingRecord(babyId: string) {
  return api.request<CreateRecordResult>('/records', {
    method: 'POST',
    data: {
      baby_id: babyId,
      type: 'feeding',
      start_time: new Date().toISOString(),
      data: {
        amount: 120,
        unit: 'ml'
      }
    }
  })
}
