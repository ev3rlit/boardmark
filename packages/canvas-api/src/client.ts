import { ApiError, type ApiErrorData, type AcquireRequest, type CreateRequest, type DocumentBundle, type DocumentSnapshot, type DocumentSummary, type EditCommand, type EditRequest, type Lease } from './contracts'

export type ApiConnection = { url: string; token: string; session: string }
export type Presence = { objectId: string; session: string; expiresAt: number }

export function createApiClient(connection: ApiConnection) {
  const endpoint = connection.url.replace(/\/$/, '')
  async function request<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
    let response: Response
    try {
      response = await fetch(`${endpoint}${path}`, {
        method: body === undefined ? 'GET' : 'POST',
        headers: { Authorization: `Bearer ${connection.token}`, 'X-Boardmark-Session': connection.session, 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: signal ?? AbortSignal.timeout(15_000)
      })
    } catch (error) {
      throw new ApiError({ code: 'connection-failed', message: error instanceof Error ? error.message : 'API에 연결할 수 없습니다.', retryable: true }, 0)
    }
    let data: { ok: true; value: T } | { ok: false; error: ApiErrorData }
    try {
      const decoded: unknown = await response.json()
      if (!decoded || typeof decoded !== 'object' || !('ok' in decoded) || typeof decoded.ok !== 'boolean'
        || (decoded.ok ? !('value' in decoded) : !('error' in decoded))) throw new Error('응답 형식 오류')
      data = decoded as typeof data
    } catch {
      throw new ApiError({ code: 'connection-failed', message: `API의 저장 결과를 확인할 수 없습니다 (HTTP ${response.status}). 초안을 보존하고 같은 요청을 다시 확인하세요.`, retryable: true }, response.status)
    }
    if (!data.ok) throw new ApiError(data.error, response.status)
    return data.value
  }
  const path = (id: string) => `/documents/${encodeURIComponent(id)}`
  return {
    list: () => request<DocumentSummary[]>('/documents'),
    read: (id: string) => request<DocumentSnapshot>(path(id)),
    bundle: (id: string) => request<DocumentBundle>(`${path(id)}/bundle`),
    create: (input: CreateRequest) => request<DocumentSnapshot>('/documents', input),
    presence: (id: string) => request<Presence[]>(`${path(id)}/presence`),
    changes: (id: string) => request<{ revision: number; presence: Presence[] }>(`${path(id)}/changes`),
    plan: (id: string, command: EditCommand) => request<{ objects: string[] }>(`${path(id)}/plan`, { command }),
    revert: (id: string, input: { requestId: string; revision: number }) => request<DocumentSnapshot>(`${path(id)}/revert`, input),
    acquire: (id: string, input: AcquireRequest, signal?: AbortSignal) => request<Lease>(`${path(id)}/acquire`, input, signal),
    renew: (id: string, leaseToken: string) => request<Lease>(`${path(id)}/renew`, { leaseToken }),
    release: (id: string, leaseToken: string) => request<{ released: boolean }>(`${path(id)}/release`, { leaseToken }),
    edit: (id: string, input: EditRequest) => request<DocumentSnapshot>(`${path(id)}/edit`, input),
    rename: (id: string, input: { requestId: string; baseRevision: number; name: string }) => request<DocumentSnapshot>(`${path(id)}/rename`, input),
    replace: (id: string, input: { requestId: string; baseRevision: number; leaseToken: string; markdown: string }) => request<DocumentSnapshot>(`${path(id)}/replace`, input),
    delete: (id: string, input: { requestId: string; baseRevision: number; leaseToken: string }) => request<DocumentSnapshot>(`${path(id)}/delete`, input),
    putAsset: (base64: string, mime: string) => request<{ id: string; src: string }>('/assets', { base64, mime }),
    asset: (id: string) => request<{ base64: string; mime: string }>(`/assets/${encodeURIComponent(id)}`),
    attachments: (id: string) => request<Array<{ path: string; assetId: string }>>(`${path(id)}/attachments`)
  }
}
export type ApiClient = ReturnType<typeof createApiClient>

// AI computation happens before this call. Never replace the caller's baseRevision
// with a fresh read. Waiting only retries lease acquisition, not the proposal.
export async function submitCommand(client: ApiClient, id: string, input: {
  command: EditCommand; baseRevision: number; requestId: string; waitMs?: number; signal?: AbortSignal
  prepared?: (request: EditRequest) => void
}) {
  const deadline = Date.now() + Math.min(input.waitMs ?? 0, 60_000)
  let lease: Lease
  while (true) {
    input.signal?.throwIfAborted()
    const plan = await client.plan(id, input.command)
    try {
      lease = await client.acquire(id, { objects: plan.objects.length ? plan.objects : ['@create'], baseRevision: input.baseRevision }, input.signal)
      break
    } catch (error) {
      if (!(error instanceof ApiError) || error.data.code !== 'locked' || Date.now() >= deadline) throw error
      await new Promise<void>((resolve, reject) => {
        const cancel = () => { clearTimeout(timer); reject(input.signal?.reason ?? new Error('취소됨')) }
        const timer = setTimeout(() => { input.signal?.removeEventListener('abort', cancel); resolve() }, Math.min(250, Math.max(1, deadline - Date.now())))
        input.signal?.addEventListener('abort', cancel, { once: true })
      })
    }
  }
  try {
    const request = { requestId: input.requestId, baseRevision: input.baseRevision, leaseToken: lease.token, command: input.command }
    input.prepared?.(request)
    try { return await client.edit(id, request) }
    catch (error) {
      if (!(error instanceof ApiError) || error.data.code !== 'connection-failed') throw error
      return await client.edit(id, request)
    }
  } finally {
    await client.release(id, lease.token).catch(() => { /* Expiry reclaims a disconnected session. */ })
  }
}
