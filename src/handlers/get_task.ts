import type { TpClient } from '../tp.js'
import type * as TP from '../types.js'

export async function handleGetTask(tp: TpClient, id: string) {
  const task = await tp.getTask<TP.Task>(id)
  if (task instanceof Error) {
    return {
      content: [{ type: 'text' as const, text: `Failed to get task id: ${id}\nError: ${task.message}` }],
      isError: true,
    }
  }
  return { content: [{ type: 'text' as const, text: JSON.stringify(task) }] }
}

export async function handleGetUserStoryTasks(tp: TpClient, userStoryId: string) {
  const response = await tp.getUserStoryTasks(userStoryId)
  if (response instanceof Error) {
    return {
      content: [{ type: 'text' as const, text: `Failed to list tasks for user story id: ${userStoryId}\nError: ${response.message}` }],
      isError: true,
    }
  }
  return { content: [{ type: 'text' as const, text: JSON.stringify(response) }] }
}
