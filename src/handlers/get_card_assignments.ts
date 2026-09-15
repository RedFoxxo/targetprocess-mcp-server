import type { TpClient } from '../tp.js'

export async function handleGetCardAssignments(tp: TpClient, cardId: string) {
  const assignments = await tp.getCardAssignments(cardId)
  if (assignments instanceof Error || !assignments) {
    return {
      content: [{ type: 'text' as const, text: `Failed to read the assignments on card id: ${cardId}` }],
      isError: true,
    }
  }

  // An unassigned card is a valid answer, not a failure: "nobody is assigned"
  // is exactly what the caller needs to know after creating a card.
  return {
    content: [{
      type: 'text' as const,
      text: JSON.stringify({
        cardId: Number(cardId),
        assignments: assignments.Items.map(({ Id, GeneralUser, Role }) => ({
          assignmentId: Id,
          userId: GeneralUser?.Id ?? null,
          userName: GeneralUser?.FullName ?? null,
          login: GeneralUser?.Login ?? null,
          roleId: Role?.Id ?? null,
          roleName: Role?.Name ?? null,
        })),
        // Set when TP returned another page; the list above is then partial.
        truncated: Boolean(assignments.Next),
      }, null, 2),
    }],
  }
}
