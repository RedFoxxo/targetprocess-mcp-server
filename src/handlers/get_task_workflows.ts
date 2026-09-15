import type { TpClient } from '../tp.js'

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

  const states = await tp.getTaskEntityStates(String(process.Id))
  if (states instanceof Error || !states) {
    return {
      content: [{
        type: 'text' as const,
        text: `Failed to read task states for process id: ${process.Id} (${process.Name})`,
      }],
      isError: true,
    }
  }

  if (states.Items.length === 0) {
    return {
      content: [{
        type: 'text' as const,
        text: `No task states found for process id: ${process.Id} (${process.Name})`,
      }],
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
        states: states.Items.map(({ Id, Name, NumericPriority, IsInitial, IsFinal, Workflow }) => ({
          entityStateId: Id,
          name: Name,
          numericPriority: NumericPriority,
          isInitial: IsInitial,
          isFinal: IsFinal,
          workflowId: Workflow?.Id ?? null,
          workflowName: Workflow?.Name ?? null,
          // A sub-workflow belongs to a team rather than to the card itself.
          isTeamWorkflow: Boolean(Workflow?.ParentWorkflow),
        })),
      }, null, 2),
    }],
  }
}
