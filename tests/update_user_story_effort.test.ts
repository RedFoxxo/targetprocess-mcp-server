import { afterEach, describe, expect, it, vi } from 'vitest'

const TOKEN = 'test-token'
const BASE_URL = 'https://tp.example.com'

async function loadClient() {
  vi.resetModules()
  vi.stubEnv('TP_TOKEN', TOKEN)
  vi.stubEnv('TP_BASE_URL', BASE_URL)
  const { TpClient } = await import('../src/tp.js')
  return new TpClient()
}

function stubSuccessfulUpdate() {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ Id: 36193 }),
  })
  vi.stubGlobal('fetch', fetchMock)
  vi.spyOn(console, 'error').mockImplementation(() => { })
  return fetchMock
}

function requestBody(fetchMock: ReturnType<typeof vi.fn>) {
  const options = fetchMock.mock.calls[0][1] as RequestInit
  return JSON.parse(String(options.body))
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('updateUserStory effort', () => {
  it('includes a supplied effort estimate', async () => {
    const tp = await loadClient()
    const fetchMock = stubSuccessfulUpdate()

    await tp.updateUserStory({ id: '36193', effort: 8 })

    expect(requestBody(fetchMock)).toEqual({ Id: '36193', Effort: 8 })
  })

  it('includes zero so an estimate can be cleared', async () => {
    const tp = await loadClient()
    const fetchMock = stubSuccessfulUpdate()

    await tp.updateUserStory({ id: '36193', effort: 0 })

    expect(requestBody(fetchMock)).toEqual({ Id: '36193', Effort: 0 })
  })

  it('does not change effort when it is omitted', async () => {
    const tp = await loadClient()
    const fetchMock = stubSuccessfulUpdate()

    await tp.updateUserStory({ id: '36193', title: 'Updated title' })

    expect(requestBody(fetchMock)).toEqual({ Id: '36193', Name: 'Updated title' })
  })
})

describe('updateUserStoryCustomFields', () => {
  function stubCustomFieldUpdate(currentFields: unknown[], updatedFields: unknown[], effort = 12) {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ Effort: effort, CustomFields: currentFields }) })
      .mockResolvedValueOnce({ ok: true, text: async () => JSON.stringify({ Id: 36194 }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ Id: 36194, Effort: effort, CustomFields: updatedFields }) })
    vi.stubGlobal('fetch', fetchMock)
    vi.spyOn(console, 'error').mockImplementation(() => { })
    return fetchMock
  }

  it('uses the v1 field shape, preserves effort, and verifies the update', async () => {
    const tp = await loadClient()
    const fetchMock = stubCustomFieldUpdate(
      [
        { Name: 'BackEnd', Type: 'DropDown', Value: 'To Do' },
        { Name: 'FrontEnd', Type: 'DropDown', Value: 'To Do' },
        { Name: 'Figma', Type: 'URL', Value: null },
      ],
      [
        { Name: 'BackEnd', Type: 'DropDown', Value: 'Doing' },
        { Name: 'FrontEnd', Type: 'DropDown', Value: 'Done' },
        { Name: 'Figma', Type: 'URL', Value: 'https://www.figma.com/design/example' },
      ],
    )

    await tp.updateUserStoryCustomFields({
      id: '36194',
      backEnd: 'Doing',
      frontEnd: 'Done',
      figma: 'https://www.figma.com/design/example',
    })

    const options = fetchMock.mock.calls[1][1] as RequestInit
    expect(JSON.parse(String(options.body))).toEqual({
      Id: '36194',
      Effort: 12,
      CustomFields: [
        { Name: 'BackEnd', Type: 'DropDown', Value: 'Doing' },
        { Name: 'FrontEnd', Type: 'DropDown', Value: 'Done' },
        { Name: 'Figma', Type: 'URL', Value: 'https://www.figma.com/design/example' },
      ],
    })
  })

  it('reports success as an error when read-back does not match', async () => {
    const tp = await loadClient()
    stubCustomFieldUpdate(
      [{ Name: 'Figma', Type: 'URL', Value: null }],
      [{ Name: 'Figma', Type: 'URL', Value: null }],
    )

    const result = await tp.updateUserStoryCustomFields({
      id: '36194', figma: 'https://www.figma.com/design/example',
    })

    expect(result).toBeInstanceOf(Error)
    expect((result as Error).message).toContain('was not persisted')
  })

  it('reports an error when effort changes during the custom-field update', async () => {
    const tp = await loadClient()
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ Effort: 12, CustomFields: [{ Name: 'Figma', Type: 'URL', Value: null }] }),
      })
      .mockResolvedValueOnce({ ok: true, text: async () => JSON.stringify({ Id: 36194 }) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ Effort: 0, CustomFields: [{ Name: 'Figma', Type: 'URL', Value: 'https://www.figma.com/design/example' }] }),
      })
    vi.stubGlobal('fetch', fetchMock)
    vi.spyOn(console, 'error').mockImplementation(() => { })

    const result = await tp.updateUserStoryCustomFields({
      id: '36194', figma: 'https://www.figma.com/design/example',
    })

    expect(result).toBeInstanceOf(Error)
    expect((result as Error).message).toContain('effort changed')
  })

  it('requires a cleared field to remain present in read-back', async () => {
    const tp = await loadClient()
    stubCustomFieldUpdate(
      [{ Name: 'Figma', Type: 'URL', Value: 'https://www.figma.com/design/example' }],
      [],
    )

    const result = await tp.updateUserStoryCustomFields({ id: '36194', figma: null })

    expect(result).toBeInstanceOf(Error)
    expect((result as Error).message).toContain('missing from the update read-back')
  })
})
