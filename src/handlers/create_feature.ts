import type { TpClient } from '../tp.js'
import type * as TP from '../types.js'

export async function handleCreateFeature(
  tp: TpClient,
  params: {
    title: string
    description?: string
    epicId?: string
    releaseId?: string
    projectId?: string
    teamId?: string
  },
) {
  const result = await tp.createFeature<TP.Feature>(params)

  if (!result.ok) {
    return {
      content: [{
        type: 'text' as const,
        text: `Failed to create feature "${params.title}"\n` +
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
