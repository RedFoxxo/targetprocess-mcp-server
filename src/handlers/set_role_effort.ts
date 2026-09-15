import type { TpClient } from '../tp.js'
import { readRoleEffortBreakdown } from './get_role_efforts.js'

export type RoleEffortInput = { roleId: string; effort: number }

function failure(text: string) {
  return {
    content: [{ type: 'text' as const, text }],
    isError: true,
  }
}

export async function handleSetRoleEffort(
  tp: TpClient,
  { entityId, efforts }: { entityId: string; efforts: RoleEffortInput[] },
) {
  if (efforts.length === 0) {
    return failure(`No role efforts were provided; nothing was changed on card id: ${entityId}`)
  }

  const duplicated = [...new Set(
    efforts.map(({ roleId }) => roleId).filter((roleId, index, all) => all.indexOf(roleId) !== index),
  )]
  if (duplicated.length) {
    return failure(
      `Refusing to apply conflicting efforts for the same role on card id: ${entityId}. ` +
      `Repeated role IDs: ${duplicated.join(', ')}`,
    )
  }

  const current = await tp.getRoleEfforts(entityId)
  if (current instanceof Error || !current) {
    return failure(`Failed to read the role effort breakdown for card id: ${entityId}`)
  }

  const applied: Array<{ roleId: number; roleName: string | null; effort: number; created: boolean }> = []
  const failed: Array<{ roleId: number; effort: number; status: number; body: string }> = []

  // Written one role at a time: TP recomputes the card's total effort on every
  // RoleEffort write, so concurrent writes to the same card can lose updates.
  for (const { roleId, effort } of efforts) {
    const existing = current.Items.find(({ Role }) => String(Role?.Id) === roleId)
    const result = existing
      ? await tp.updateRoleEffort(String(existing.Id), effort)
      : await tp.createRoleEffort(entityId, roleId, effort)

    if (result.ok) {
      applied.push({
        roleId: Number(roleId),
        roleName: existing?.Role?.Name ?? result.data?.Role?.Name ?? null,
        effort,
        created: !existing,
      })
    } else {
      failed.push({ roleId: Number(roleId), effort, status: result.status, body: result.body })
    }
  }

  const breakdown = await readRoleEffortBreakdown(tp, entityId)
  if (breakdown instanceof Error) {
    return failure(
      `Card id: ${entityId} could not be read back after ${applied.length} of ${efforts.length} ` +
      `role effort write(s) were accepted, so the result is unverified.\n` +
      `${breakdown.message}\n` +
      JSON.stringify({ applied, failed }, null, 2),
    )
  }

  const notPersisted = applied.filter(({ roleId, effort }) => {
    const persisted = breakdown.roleEfforts.find((row) => row.roleId === roleId)
    return !persisted || persisted.effort !== effort
  })

  const text = JSON.stringify({
    entityId: breakdown.entityId,
    name: breakdown.name,
    applied,
    failed,
    notPersisted,
    totalEffort: breakdown.totalEffort,
    roleEfforts: breakdown.roleEfforts,
  }, null, 2)

  if (failed.length || notPersisted.length) {
    return failure(
      `Not every role effort was applied to card id: ${entityId}.\n${text}`,
    )
  }

  return { content: [{ type: 'text' as const, text }] }
}
