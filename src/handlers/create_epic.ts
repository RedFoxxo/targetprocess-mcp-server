import type { TpClient } from '../tp.js'

export async function handleCreateEpic(
  tp: TpClient,
  params: {
    title: string
    description?: string
    releaseId?: string
    projectId?: string
  },
) {
  const result = await tp.createEpic(params)

  if (!result.ok) {
    return {
      content: [{
        type: 'text' as const,
        text: `Failed to create epic "${params.title}"\n` +
          `HTTP status: ${result.status}\n` +
          `Response body: ${result.body}`,
      }],
      isError: true,
    }
  }

  return {
    content: [{ type: 'text' as const, text: JSON.stringify(result.data) }],
  }
}
