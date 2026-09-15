import type { TpClient } from '../tp.js'
import type * as TP from '../types.js'

export async function handleCreateUserStory(
  tp: TpClient,
  params: {
    title: string
    description?: string
    featureId?: string
    releaseId?: string
    projectId?: string
    teamId?: string
    tags?: string
    teamIterationId?: string
  },
) {
  const result = await tp.createUserStory<TP.UserStory>(params)

  if (!result.ok) {
    return {
      content: [{
        type: 'text' as const,
        text: `Failed to create user story "${params.title}"\n` +
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
