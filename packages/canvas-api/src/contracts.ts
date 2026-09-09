import type { CanvasDocumentEditIntent } from '../../canvas-edit/src/index'

export type EditCommand = CanvasDocumentEditIntent
export type DocumentSummary = { id: string; name: string; revision: number }
export type DocumentSnapshot = DocumentSummary & { markdown: string }
export type BundleAsset = { path: string; mime: string; base64: string }
export type DocumentBundle = { format: 'boardmark-bundle-v1'; name: string; markdown: string; assets: BundleAsset[] }
export type CreateRequest = { requestId: string; name: string; markdown: string; assets?: BundleAsset[] }
export type Lease = { token: string; objects: string[]; expiresAt: number }
export type LeaseOwner = { session: string; objects: string[]; expiresAt: number }
export type AcquireRequest = { objects: string[]; baseRevision: number }
export type EditRequest = {
  requestId: string
  baseRevision: number
  leaseToken: string
  command: EditCommand
}
export type ApiErrorCode =
  | 'invalid-request' | 'not-found' | 'invalid-document' | 'locked'
  | 'lease-expired' | 'stale-base' | 'request-reused' | 'unauthorized'
  | 'connection-failed' | 'internal-error'
export type ApiErrorData = {
  code: ApiErrorCode
  message: string
  retryable: boolean
  details?: unknown
}
export class ApiError extends Error {
  constructor(readonly data: ApiErrorData, readonly status = 400) {
    super(data.message)
    this.name = 'ApiError'
  }
}

export function fail(code: ApiErrorCode, message: string, details?: unknown): never {
  const status = code === 'not-found' ? 404 : code === 'unauthorized' ? 401
    : ['locked', 'lease-expired', 'stale-base', 'request-reused'].includes(code) ? 409 : 400
  throw new ApiError({ code, message, retryable: code === 'locked', details }, status)
}
