import type { TpClient } from '../tp.js'

export type RoleEffortRow = {
  roleEffortId: number
  roleId: number | null
  roleName: string | null
  effort: number
}

export type RoleEffortBreakdown = {
  entityId: number
  name: string | null
  totalEffort: number | null
  roleEfforts: RoleEffortRow[]
}

// Shared by the read tool and by the read-back that set_role_effort performs
// after writing, so both report the breakdown in the same shape.
export async function readRoleEffortBreakdown(
  tp: TpClient,
  entityId: string,
): Promise<RoleEffortBreakdown | Error> {
  const roleEfforts = await tp.getRoleEfforts(entityId)
  if (roleEfforts instanceof Error || !roleEfforts) {
    return new Error(`Failed to read the role effort breakdown for card id: ${entityId}`)
  }

  const total = await tp.getAssignableEffort(entityId)
  if (total instanceof Error || !total) {
    return new Error(`Failed to read the total effort for card id: ${entityId}`)
  }

  return {
    entityId: Number(entityId),
    name: total.Name ?? null,
    totalEffort: total.Effort ?? null,
    roleEfforts: roleEfforts.Items.map(({ Id, Effort, Role }) => ({
      roleEffortId: Id,
      roleId: Role?.Id ?? null,
      roleName: Role?.Name ?? null,
      effort: Effort,
    })),
  }
}

export async function handleGetRoleEfforts(tp: TpClient, entityId: string) {
  const breakdown = await readRoleEffortBreakdown(tp, entityId)
  if (breakdown instanceof Error) {
    return {
      content: [{ type: 'text' as const, text: breakdown.message }],
      isError: true,
    }
  }

  return {
    content: [{ type: 'text' as const, text: JSON.stringify(breakdown, null, 2) }],
  }
}
