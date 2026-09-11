import type { TpClient } from '../tp.js'

export async function handleRemoveRoleAssignment(
  tp: TpClient,
  { cardId, userId, roleId }: { cardId: string; userId: string; roleId: string },
) {
  const assignments = await tp.getRoleAssignments(cardId, userId, roleId)
  if (assignments instanceof Error || !assignments) {
    return {
      content: [{
        type: 'text' as const,
        text: `Failed to find the role assignment on card id: ${cardId}`,
      }],
      isError: true,
    }
  }

  if (assignments.Items.length !== 1 || assignments.Next) {
    const assignmentIds = assignments.Items.map(({ Id }) => Id)
    return {
      content: [{
        type: 'text' as const,
        text: assignments.Items.length === 0 && !assignments.Next
          ? `No matching role assignment found on card id: ${cardId}`
          : `Refusing to remove an ambiguous role assignment on card id: ${cardId}. Matching assignment IDs: ${assignmentIds.join(', ')}`,
      }],
      isError: true,
    }
  }

  const assignmentId = String(assignments.Items[0].Id)
  const result = await tp.deleteRoleAssignment(assignmentId)
  if (!result.ok) {
    return {
      content: [{
        type: 'text' as const,
        text: `Failed to remove role assignment id: ${assignmentId}\n` +
          `HTTP status: ${result.status}\n` +
          `Response body: ${result.body}`,
      }],
      isError: true,
    }
  }

  return {
    content: [{
      type: 'text' as const,
      text: JSON.stringify({
        removed: true,
        assignmentId: Number(assignmentId),
        cardId: Number(cardId),
        userId: Number(userId),
        roleId: Number(roleId),
      }),
    }],
  }
}
