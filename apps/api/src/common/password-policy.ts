import { z } from 'zod';

/** Şifre politikası: en az 10 karakter, en az bir harf ve bir rakam. */
export const passwordSchema = z
  .string()
  .min(10, 'Şifre en az 10 karakter olmalı')
  .max(128)
  .regex(/\p{L}/u, 'Şifre en az bir harf içermeli')
  .regex(/\d/, 'Şifre en az bir rakam içermeli');
