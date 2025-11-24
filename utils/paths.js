// utils/paths.js
import path from 'path';

/**
 * Корень проекта фиксируется при старте процесса.
 * Это то же самое, что process.cwd(), но в одном месте.
 */
export const PROJECT_ROOT = process.cwd();

/**
 * Делаем путь от корня проекта.
 * fromRoot('files', 'UTV', 'logo.png') => <PROJECT_ROOT>/files/UTV/logo.png
 */
export function fromRoot(...segments) {
  return path.join(PROJECT_ROOT, ...segments);
}

/**
 * Если путь уже абсолютный — возвращаем как есть.
 * Если относительный — делаем его от корня проекта.
 */
export function resolveFromRoot(p) {
  return path.isAbsolute(p) ? p : path.join(PROJECT_ROOT, p);
}
