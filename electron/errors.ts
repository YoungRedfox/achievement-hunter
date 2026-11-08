import type { ErrorCode, Result } from '../shared/types';

export class AppError extends Error {
  constructor(
    public code: ErrorCode,
    message?: string,
  ) {
    super(message ?? code);
  }
}

// Do interfejsu wysyłamy kod błędu, a nie wyjątek — tłumaczenie robi renderer
export async function toResult<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    if (e instanceof AppError) return { ok: false, code: e.code, message: e.message };
    console.error(e);
    return { ok: false, code: 'UNKNOWN', message: e instanceof Error ? e.message : String(e) };
  }
}

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
