import { describe, it, expect, vi, beforeEach } from 'vitest'
import { handleGetProcesses } from '../src/handlers/get_processes.js'
import { handleGetProcessWorkflows } from '../src/handlers/get_process_workflows.js'
import { handleGetBugWorkflows } from '../src/handlers/get_bug_workflows.js'
import { handleGetUserStoryWorkflows } from '../src/handlers/get_user_story_workflows.js'
import { handleGetRelationTypes } from '../src/handlers/get_relation_types.js'
import { handleGetVersion } from '../src/handlers/get_version.js'
import type { TpClient } from '../src/tp.js'

const mockTp = {
  getProcesses: vi.fn(),
  getProcessWorkflows: vi.fn(),
  getProjectProcess: vi.fn(),
  getEntityStates: vi.fn(),
  getRelationTypes: vi.fn(),
} as unknown as TpClient

beforeEach(() => {
  vi.clearAllMocks()
})

describe('handleGetProcesses', () => {
  it('returns processes as JSON', async () => {
    vi.mocked(mockTp.getProcesses).mockResolvedValue({ Next: '', Items: [{ Id: 1, Name: 'Scrum' }] } as any)

    const result = await handleGetProcesses(mockTp)
    const parsed = JSON.parse(result.content[0].text)

    expect(parsed).toEqual([{ Id: 1, Name: 'Scrum' }])
  })

  // Regression: the handler used to read the lowercase "items" of the v2
  // shape while getProcesses() calls v1, so every lookup reported "No
  // processes found". Drive the real client so the shapes cannot drift apart.
  it('reads the shape the v1 client actually returns', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        Next: '',
        Items: [{ ResourceType: 'Process', Id: 89, Name: 'Scrum', IsDefault: true, Description: null }],
      }),
    })
    vi.stubGlobal('fetch', fetchMock)
    vi.spyOn(console, 'error').mockImplementation(() => { })
    vi.stubEnv('TP_TOKEN', 'test-token')
    vi.stubEnv('TP_BASE_URL', 'https://tp.example.com')
    vi.resetModules()
    const { TpClient } = await import('../src/tp.js')

    const result = await handleGetProcesses(new TpClient())

    expect(fetchMock.mock.calls[0][0]).toContain('/api/v1/Processes/')
    expect(JSON.parse(result.content[0].text)).toEqual([
      { ResourceType: 'Process', Id: 89, Name: 'Scrum', IsDefault: true, Description: null },
    ])

    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('returns failure message when null', async () => {
    vi.mocked(mockTp.getProcesses).mockResolvedValue(new Error('Simulated failure') as any)

    const result = await handleGetProcesses(mockTp)

    expect(result.content[0].text).toContain('Failed to get processes')
  })

  it('returns not found message when empty', async () => {
    vi.mocked(mockTp.getProcesses).mockResolvedValue({ Next: '', Items: [] } as any)

    const result = await handleGetProcesses(mockTp)

    expect(result.content[0].text).toContain('No processes found')
  })
})

describe('handleGetProcessWorkflows', () => {
  it('returns workflows for the process as JSON', async () => {
    vi.mocked(mockTp.getProcessWorkflows).mockResolvedValue({ next: '', items: [{ id: 1, name: 'Bug Workflow' }] } as any)

    const result = await handleGetProcessWorkflows(mockTp, '10')
    const parsed = JSON.parse(result.content[0].text)

    expect(parsed).toEqual([{ id: 1, name: 'Bug Workflow' }])
    expect(mockTp.getProcessWorkflows).toHaveBeenCalledWith({ processId: '10' })
  })

  it('returns failure message when null', async () => {
    vi.mocked(mockTp.getProcessWorkflows).mockResolvedValue(new Error('Simulated failure') as any)

    const result = await handleGetProcessWorkflows(mockTp, '10')

    expect(result.content[0].text).toContain('Failed to get process workflows')
  })

  it('returns not found message when empty', async () => {
    vi.mocked(mockTp.getProcessWorkflows).mockResolvedValue({ next: '', items: [] } as any)

    const result = await handleGetProcessWorkflows(mockTp, '10')

    expect(result.content[0].text).toContain('No process workflows found')
  })
})

function stateItem(Id, Name, workflowId, parent = null) {
  return {
    Id,
    Name,
    NumericPriority: Id,
    IsInitial: false,
    IsFinal: false,
    Workflow: { Id: workflowId, Name: 'Project workflow', ParentWorkflow: parent },
  }
}

const project = { Id: 26080, Name: 'SBP', Process: { Id: 13, Name: 'Mamami 2025' } }

describe('handleGetBugWorkflows', () => {
  it('resolves the process from the project and lists bug states', async () => {
    vi.mocked(mockTp.getProjectProcess).mockResolvedValue(project as any)
    vi.mocked(mockTp.getEntityStates).mockResolvedValue({ Items: [stateItem(20, 'Open', 203)] } as any)

    const result = await handleGetBugWorkflows(mockTp, '26080')
    const parsed = JSON.parse(result.content[0].text)

    expect(mockTp.getEntityStates).toHaveBeenCalledWith('13', 'Bug')
    expect(parsed.process).toEqual({ id: 13, name: 'Mamami 2025' })
    expect(parsed.entityType).toBe('Bug')
    expect(parsed.states).toEqual([{
      entityStateId: 20, name: 'Open', numericPriority: 20, isInitial: false, isFinal: false,
      workflowId: 203, workflowName: 'Project workflow', isTeamWorkflow: false,
    }])
  })

  it('reports a project that could not be read', async () => {
    vi.mocked(mockTp.getProjectProcess).mockResolvedValue(new Error('Simulated failure') as any)

    const result = await handleGetBugWorkflows(mockTp, '26080')

    expect(mockTp.getEntityStates).not.toHaveBeenCalled()
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain('Failed to read project id: 26080')
  })

  it('reports an empty state list', async () => {
    vi.mocked(mockTp.getProjectProcess).mockResolvedValue(project as any)
    vi.mocked(mockTp.getEntityStates).mockResolvedValue({ Items: [] } as any)

    const result = await handleGetBugWorkflows(mockTp, '26080')

    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain('No Bug states found for process id: 13')
  })
})

describe('handleGetUserStoryWorkflows', () => {
  it('resolves the process from the project and lists user story states', async () => {
    vi.mocked(mockTp.getProjectProcess).mockResolvedValue(project as any)
    vi.mocked(mockTp.getEntityStates).mockResolvedValue({ Items: [stateItem(10, 'In Progress', 203)] } as any)

    const result = await handleGetUserStoryWorkflows(mockTp, '26080')
    const parsed = JSON.parse(result.content[0].text)

    expect(mockTp.getEntityStates).toHaveBeenCalledWith('13', 'UserStory')
    expect(parsed.entityType).toBe('UserStory')
    expect(parsed.states[0].name).toBe('In Progress')
  })

  // Regression: these lookups used to filter on a hardcoded TP_PROCESS_ID
  // default of "89", so they silently queried a process that was not the
  // user's and always came back empty.
  it('flags team sub-workflow states instead of pinning a process id', async () => {
    vi.mocked(mockTp.getProjectProcess).mockResolvedValue(project as any)
    vi.mocked(mockTp.getEntityStates).mockResolvedValue({
      Items: [stateItem(10, 'In Progress', 203), stateItem(11, 'In Progress', 310, { Id: 203, Name: 'Project workflow' })],
    } as any)

    const result = await handleGetUserStoryWorkflows(mockTp, '26080')
    const parsed = JSON.parse(result.content[0].text)

    expect(parsed.states.map((s) => s.isTeamWorkflow)).toEqual([false, true])
  })

  it('reports a project with no process', async () => {
    vi.mocked(mockTp.getProjectProcess).mockResolvedValue({ Id: 26080, Name: 'SBP' } as any)

    const result = await handleGetUserStoryWorkflows(mockTp, '26080')

    expect(mockTp.getEntityStates).not.toHaveBeenCalled()
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain('has no process')
  })

  it('asks for a project when none is given and none is configured', async () => {
    const result = await handleGetUserStoryWorkflows(mockTp, '')

    expect(mockTp.getProjectProcess).not.toHaveBeenCalled()
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain('TP_PROJECT_ID is not configured')
  })
})

describe('handleGetRelationTypes', () => {
  it('returns mapped relation types', async () => {
    vi.mocked(mockTp.getRelationTypes).mockResolvedValue({
      Items: [{ Id: 10, Name: 'Depends on' }, { Id: 20, Name: 'Relate to' }],
    } as any)

    const result = await handleGetRelationTypes(mockTp)
    const parsed = JSON.parse(result.content[0].text)

    expect(parsed).toEqual([{ id: 10, name: 'Depends on' }, { id: 20, name: 'Relate to' }])
  })

  it('returns failure message when null', async () => {
    vi.mocked(mockTp.getRelationTypes).mockResolvedValue(new Error('Simulated failure') as any)

    const result = await handleGetRelationTypes(mockTp)

    expect(result.content[0].text).toContain('Failed to get relation types')
  })
})

describe('handleGetVersion', () => {
  it('returns the provided version string', async () => {
    const result = await handleGetVersion('2.5.3')

    expect(result.content[0].text).toBe('2.5.3')
  })
})
