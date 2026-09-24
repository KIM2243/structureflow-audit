// Shared by account creation and administrative password reset.
export function validPassword(password: string) {
  return Array.from(password).length >= 10 && /[\p{P}\p{S}]/u.test(password);
}
