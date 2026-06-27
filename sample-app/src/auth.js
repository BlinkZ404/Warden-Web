// Sign-in email normalization. Trims and lowercases the address so it compares
// consistently no matter how the user typed it.
//
// Like the rest of the sample app this is the kind of code an AI app builder
// ships: small and readable, with one sharp edge. The guarded version here is
// correct; Warden's demo injects a typo (toLowerCasee) into an isolated
// workspace to reproduce the production crash. Because this is an auth module,
// Warden verifies its fix but routes it to a human for approval before shipping.

/** @param {string} email */
export function normalizeEmail(email) {
  return email.trim().toLowerCase();
}
