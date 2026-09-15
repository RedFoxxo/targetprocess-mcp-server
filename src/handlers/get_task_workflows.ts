import type { TpClient } from '../tp.js'
import { readStatesForProcess } from './workflow_states.js'

export async function handleGetTaskWorkflows(tp: TpClient, taskId: string) {
  const task = await tp.getTaskProcess(taskId)
  if (task instanceof Error || !task) {
    return {
      content: [{ type: 'text' as const, text: `Failed to read task id: ${taskId}` }],
      isError: true,
    }
  }

  const process = task.Project?.Process
  if (!process) {
    return {
      content: [{
        type: 'text' as const,
        text: `Task id: ${taskId} has no project process, so its task states cannot be resolved`,
      }],
      isError: true,
    }
  }

  const states = await readStatesForProcess(tp, process, 'Task')
  if (states instanceof Error) {
    return {
      content: [{ type: 'text' as const, text: states.message }],
      isError: true,
    }
  }

  return {
    content: [{
      type: 'text' as const,
      text: JSON.stringify({
        taskId: Number(taskId),
        project: { id: task.Project.Id, name: task.Project.Name },
        process: { id: process.Id, name: process.Name },
        entityType: 'Task',
        states,
      }, null, 2),
    }],
  }
}
