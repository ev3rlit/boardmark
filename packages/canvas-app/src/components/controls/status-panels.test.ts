import { describe, expect, it } from 'vitest'
import { readStatusMessages } from '@canvas-app/components/controls/status-panels'

describe('StatusPanels', () => {
  it('deduplicates repeated invalid and operation messages', () => {
    expect(readStatusMessages({
      dropState: { status: 'idle' },
      invalidState: {
        status: 'invalid',
        message: 'Duplicate message'
      },
      loadState: { status: 'ready' },
      operationError: 'Duplicate message',
      saveState: { status: 'idle' }
    })).toEqual(['Duplicate message'])
  })
})
