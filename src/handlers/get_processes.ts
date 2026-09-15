import type { TpClient } from '../tp.js'
import type * as TP from '../types.js'

export async function handleGetProcesses(tp: TpClient) {
  // getProcesses() calls the v1 API, which returns a capitalised "Items"
  // collection — not the lowercase "items" the v2 endpoints return.
  const response = await tp.getProcesses<TP.TpResponse<TP.ProcessListItem>>()

  if (response instanceof Error) {
    return {
      content: [{
        type: 'text' as const,
        text: `Failed to get processes, Error: ${response.message}`
      }],
    }
  }

  const items = response.Items || []
  if (items.length === 0) {
    return {
      content: [{
        type: 'text' as const,
        text: `No processes found`,
      }],
    }
  }

  return {
    content: [{ type: 'text' as const, text: JSON.stringify(items) }],
  }
}
