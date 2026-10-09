/** API'deki şifre politikasıyla aynı: en az 10 karakter, en az bir harf ve bir rakam. */
export function passwordProblem(password: string): string | null {
  if (password.length < 10) return 'Şifre en az 10 karakter olmalı';
  if (!/\p{L}/u.test(password)) return 'Şifre en az bir harf içermeli';
  if (!/\d/.test(password)) return 'Şifre en az bir rakam içermeli';
  return null;
}

export const PASSWORD_HINT = 'En az 10 karakter; en az bir harf ve bir rakam içermeli.';
