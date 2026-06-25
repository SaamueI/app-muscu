// Flag « ne plus me demander » pour la suppression de mesoSessions.
// Persiste le temps de la session applicative (suppression en série).
let skip = false;

export function getSkipSessionConfirm(): boolean {
  return skip;
}

export function setSkipSessionConfirm(value: boolean): void {
  skip = value;
}
