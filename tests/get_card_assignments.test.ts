import { afterEach, describe, expect, it, vi } from 'vitest'
import { handleGetCardAssignments } from '../src/handlers/get_card_assignments.js'
import type { TpClient } from '../src/tp.js'

const TOKEN = 'test-token'
const BASE_URL = 'https://tp.example.com'

async function loadClient() {
  vi.resetModules()
  vi.stubEnv('TP_TOKEN', TOKEN)
  vi.stubEnv('TP_BASE_URL', BASE_URL)
  const { TpClient } = await import('../src/tp.js')
  return new TpClient()
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function assignment(Id: number, userId: number, fullName: string, roleId: number, roleName: string) {
  return {
    Id,
    GeneralUser: { Id: userId, FullName: fullName, Login: fullName.toLowerCase().replace(' ', '') },
    Role: { Id: roleId, Name: roleName },
  } as any
}

describe('card assignment API requests', () => {
  it('queries every assignment on one card, not one exact combination', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ Items: [] }) })
    vi.stubGlobal('fetch', fetchMock)
    vi.spyOn(console, 'error').mockImplementation(() => { })
    const tp = await loadClient()

    await tp.getCardAssignments('36410')

    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/api/v1/Assignments/')
    const decoded = decodeURIComponent(url)
    expect(decoded).toContain('where=Assignable.Id eq 36410')
    expect(decoded).not.toContain('GeneralUser.Id eq')
    expect(decoded).not.toContain('Role.Id eq')
    expect(options.method).toBe('GET')
  })
})

describe('handleGetCardAssignments', () => {
  it('lists each assignment with the id needed to remove it', async () => {
    const mockTp = {
      getCardAssignments: vi.fn().mockResolvedValue({
        Items: [
          assignment(49584, 2286, 'Leszek Bielski', 13, 'Developer'),
          assignment(49585, 16, 'Giorgio Marchetti', 7, 'Product Owner'),
        ],
        Next: '',
      }),
    } as unknown as TpClient

    const result = await handleGetCardAssignments(mockTp, '36410')

    expect(result.isError).toBeUndefined()
    const payload = JSON.parse(result.content[0].text)
    expect(payload.cardId).toBe(36410)
    expect(payload.truncated).toBe(false)
    expect(payload.assignments).toEqual([
      { assignmentId: 49584, userId: 2286, userName: 'Leszek Bielski', login: 'leszekbielski', roleId: 13, roleName: 'Developer' },
      { assignmentId: 49585, userId: 16, userName: 'Giorgio Marchetti', login: 'giorgiomarchetti', roleId: 7, roleName: 'Product Owner' },
    ])
  })

  // "Nobody is assigned" is the answer, not a failure — it is what the caller
  // needs after creating a card that TP did not auto-assign.
  it('reports an unassigned card as an empty list, not an error', async () => {
    const mockTp = {
      getCardAssignments: vi.fn().mockResolvedValue({ Items: [], Next: '' }),
    } as unknown as TpClient

    const result = await handleGetCardAssignments(mockTp, '36410')

    expect(result.isError).toBeUndefined()
    expect(JSON.parse(result.content[0].text).assignments).toEqual([])
  })

  it('flags a truncated list so a partial answer is not read as complete', async () => {
    const mockTp = {
      getCardAssignments: vi.fn().mockResolvedValue({
        Items: [assignment(49584, 2286, 'Leszek Bielski', 13, 'Developer')],
        Next: '/next-page',
      }),
    } as unknown as TpClient

    const result = await handleGetCardAssignments(mockTp, '36410')

    expect(JSON.parse(result.content[0].text).truncated).toBe(true)
  })

  it('reports a failed lookup', async () => {
    const mockTp = {
      getCardAssignments: vi.fn().mockResolvedValue(new Error('boom')),
    } as unknown as TpClient

    const result = await handleGetCardAssignments(mockTp, '36410')

    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain('Failed to read the assignments on card id: 36410')
  })
})
