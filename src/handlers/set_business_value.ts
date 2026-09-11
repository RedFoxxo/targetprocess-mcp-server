import type { TpClient } from '../tp.js'

export async function handleSetBusinessValue(
  tp: TpClient,
  params: { id: string; entityType: string; priorityId: string },
) {
  const response = await tp.setBusinessValue<any>(params)
  if (response instanceof Error) {
    return {
      content: [{
        type: 'text' as const,
        text: `Failed to set Business Value on ${params.entityType} id: ${params.id}\nError: ${response.message}`,
      }],
      isError: true,
    }
  }

  return { content: [{ type: 'text' as const, text: JSON.stringify(response) }] }
}
