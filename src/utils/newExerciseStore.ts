let pendingId: string | null = null;

export function setPendingNewExercise(id: string): void {
  pendingId = id;
}

export function consumePendingNewExercise(): string | null {
  const id = pendingId;
  pendingId = null;
  return id;
}
