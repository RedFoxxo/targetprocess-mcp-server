import type { TpClient } from '../tp.js'
import { config } from '../config.js'
import { handleProjectWorkflowStates } from './workflow_states.js'

export async function handleGetUserStoryWorkflows(tp: TpClient, projectId?: string) {
  return handleProjectWorkflowStates(tp, projectId || config.tp.projectId, 'UserStory')
}
