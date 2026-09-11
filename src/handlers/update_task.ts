import type { TpClient } from '../tp.js'
import type * as TP from '../types.js'

export async function handleUpdateTask(
  tp: TpClient,
  params: { id: string; description: string },
) {
  const response = await tp.updateTask<TP.Task>(params)
  if (response instanceof Error) {
    return {
      content: [{
        type: 'text' as const,
        text: `Failed to update task id: ${params.id}\n Error: ${response.message}`
      }],
    }
  }

  return {
    content: [{ type: 'text' as const, text: JSON.stringify(response) }],
  }
}
