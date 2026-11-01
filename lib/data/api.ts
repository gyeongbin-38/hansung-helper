export type ApiError = { code: string; message: string };
export type ApiSuccess<T> = { ok: true; data: T };
export type ApiFailure = { ok: false; error: ApiError };
export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

export class ApiRequestError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(
    message: string,
    code: string,
    status: number,
  ) {
    super(message);
    this.code = code;
    this.status = status;
    this.name = 'ApiRequestError';
  }
}

export async function apiFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs = 15000,
): Promise<Response> {
  try {
    return await fetch(input, {
      ...init,
      signal: init.signal ?? AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    const timedOut =
      error instanceof DOMException &&
      (error.name === 'TimeoutError' || error.name === 'AbortError');
    throw new ApiRequestError(
      timedOut
        ? '요청 시간이 초과됐습니다. 잠시 후 다시 시도해 주세요.'
        : '서버에 연결하지 못했습니다. 네트워크를 확인해 주세요.',
      timedOut ? 'TIMEOUT' : 'NETWORK_ERROR',
      0,
    );
  }
}

export async function apiData<T>(response: Response): Promise<T> {
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new ApiRequestError('서버 응답을 읽지 못했습니다.', 'INVALID_RESPONSE', response.status);
  }
  if (
    !response.ok ||
    !payload ||
    typeof payload !== 'object' ||
    !('ok' in payload) ||
    (payload as { ok?: unknown }).ok !== true ||
    !('data' in payload)
  ) {
    const error =
      payload && typeof payload === 'object' && 'error' in payload
        ? (payload as { error?: Partial<ApiError> }).error
        : undefined;
    throw new ApiRequestError(
      typeof error?.message === 'string'
        ? error.message
        : '요청을 처리하지 못했습니다.',
      typeof error?.code === 'string' ? error.code : 'REQUEST_FAILED',
      response.status,
    );
  }
  return (payload as ApiSuccess<T>).data;
}
