import { NextResponse } from "next/server";

export const ok = (data: object = {}) => NextResponse.json({ ok: true, ...data });
export const fail = (error: string, status = 400) => NextResponse.json({ ok: false, error }, { status });

export function isAdmin(req: Request) {
  const pin = process.env.ADMIN_PIN;
  return !!pin && req.headers.get("x-admin-pin") === pin;
}

/** Wraps a route handler so unexpected errors return JSON instead of a crash page. */
export function handle(fn: (req: Request) => Promise<Response>) {
  return async (req: Request) => {
    try {
      return await fn(req);
    } catch (e) {
      console.error(e);
      return fail(e instanceof Error ? e.message : "Terjadi kesalahan server.", 500);
    }
  };
}
