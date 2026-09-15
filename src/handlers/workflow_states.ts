import type { TpClient } from '../tp.js'
import type * as TP from '../types.js'

export type WorkflowStateRow = {
  entityStateId: number
  name: string
  numericPriority: number
  isInitial: boolean
  isFinal: boolean
  workflowId: number | null
  workflowName: string | null
  isTeamWorkflow: boolean
}

export function toStateRows(items: TP.WorkflowEntityState[]): WorkflowStateRow[] {
  return items.map(({ Id, Name, NumericPriority, IsInitial, IsFinal, Workflow }) => ({
    entityStateId: Id,
    name: Name,
    numericPriority: NumericPriority,
    isInitial: IsInitial,
    isFinal: IsFinal,
    workflowId: Workflow?.Id ?? null,
    workflowName: Workflow?.Name ?? null,
    // A sub-workflow belongs to a team rather than to the card itself.
    isTeamWorkflow: Boolean(Workflow?.ParentWorkflow),
  }))
}

export async function readStatesForProcess(
  tp: TpClient,
  process: { Id: number, Name: string },
  entityType: 'Task' | 'UserStory' | 'Bug',
): Promise<WorkflowStateRow[] | Error> {
  const states = await tp.getEntityStates(String(process.Id), entityType)
  if (states instanceof Error || !states) {
    return new Error(`Failed to read ${entityType} states for process id: ${process.Id} (${process.Name})`)
  }
  if (states.Items.length === 0) {
    return new Error(`No ${entityType} states found for process id: ${process.Id} (${process.Name})`)
  }
  return toStateRows(states.Items)
}

// Used by the tools that look states up for a whole project rather than for
// one specific card.
export async function handleProjectWorkflowStates(
  tp: TpClient,
  projectId: string,
  entityType: 'UserStory' | 'Bug',
) {
  if (!projectId) {
    return {
      content: [{
        type: 'text' as const,
        text: `No project was given and TP_PROJECT_ID is not configured, so the ${entityType} states cannot be resolved. ` +
          `Pass a projectId, or use "get_projects" to find one.`,
      }],
      isError: true,
    }
  }

  const project = await tp.getProjectProcess(projectId)
  if (project instanceof Error || !project) {
    return {
      content: [{ type: 'text' as const, text: `Failed to read project id: ${projectId}` }],
      isError: true,
    }
  }

  if (!project.Process) {
    return {
      content: [{
        type: 'text' as const,
        text: `Project id: ${projectId} has no process, so its ${entityType} states cannot be resolved`,
      }],
      isError: true,
    }
  }

  const states = await readStatesForProcess(tp, project.Process, entityType)
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
        project: { id: project.Id, name: project.Name },
        process: { id: project.Process.Id, name: project.Process.Name },
        entityType,
        states,
      }, null, 2),
    }],
  }
}
