import type { TpClient } from '../tp.js'
import type * as TP from '../types.js'

export async function handleCreateBugBasedOnCard(
  tp: TpClient,
  params: {
    title: string
    card: { id: string, type: "UserStory" | "Bug" | "Feature" }
    bugContent: string
    origin?: string
    releaseId?: string
    projectId?: string
    teamId?: string
  },
) {
  const result = await tp.createBug<TP.Bug>(params)

  if (!result.ok) {
    return {
      content: [{
        type: 'text' as const,
        text: `Failed to create bug "${params.title}" on ${params.card.type} ${params.card.id}\n` +
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
