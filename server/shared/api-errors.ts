import type { RequestHandler } from 'express';

/** Keep endpoint-specific fields while giving every failed JSON response a message and code. */
export function normalizeApiError(body: unknown, status: number): unknown {
  if (status < 400) return body;
  const value = body && typeof body === 'object' && !Array.isArray(body) ? body as Record<string, unknown> : {};
  const nested = value.error && typeof value.error === 'object' ? value.error as Record<string, unknown> : null;
  const error = typeof value.error === 'string' ? value.error : typeof nested?.message === 'string' ? nested.message : typeof value.message === 'string' ? value.message : typeof body === 'string' ? body : `HTTP ${status}`;
  return { ...value, ...(nested ? { details: value.details ?? nested } : {}), error, code: value.code ?? nested?.code ?? `HTTP_${status}` };
}

export const apiErrorResponses: RequestHandler = (request, response, next) => {
  const isApi = request.path.startsWith('/api/');
  const json = response.json;
  response.json = function (body: unknown) {
    return json.call(this, isApi ? normalizeApiError(body, this.statusCode) : body);
  };
  next();
};
