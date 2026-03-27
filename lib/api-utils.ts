export function apiOk(data: unknown): Response {
  return Response.json({ ok: true, data }, { status: 200 });
}

export function apiError(status: number, error: string, code?: string): Response {
  return Response.json({ ok: false, error, code }, { status });
}

export async function parseBody<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

export function requireFields(body: any, fields: string[]): string | null {
  for (const f of fields) {
    if (body[f] === undefined || body[f] === null || body[f] === "") {
      return `Missing required field: ${f}`;
    }
  }
  return null;
}
