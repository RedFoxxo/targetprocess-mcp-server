import type { TpClient } from '../tp.js'
import type * as TP from '../types.js'

export async function handleCreateTask(
  tp: TpClient,
  params: {
    title: string
    userStoryId: string
    description?: string
  },
) {
  const response = await tp.createTask<TP.Task>(params)

  if (!response.ok) {
    const details = response.status === 0
      ? `Preflight or transport error: ${response.body}`
      : `HTTP status: ${response.status}\nResponse body: ${response.body}`
    return {
      content: [{
        type: 'text' as const,
        text: `Failed to create task "${params.title}"\n${details}`
      }],
      isError: true,
    }
  }

  return {
    content: [{ type: 'text' as const, text: JSON.stringify(response.data) }],
  }
}
