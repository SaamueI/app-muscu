let pendingAltId: string | null = null;

export function setPendingAlt(id: string): void {
  pendingAltId = id;
}

export function consumePendingAlt(): string | null {
  const id = pendingAltId;
  pendingAltId = null;
  return id;
}
