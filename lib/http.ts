/** Throw a uniform error for a failed fetch, including a truncated response body. */
export async function httpError(op: string, res: Response): Promise<never> {
  let body = "";
  try {
    body = (await res.text()).slice(0, 200);
  } catch {
    /* body unavailable */
  }
  throw new Error(body ? `${op} ${res.status}: ${body}` : `${op} ${res.status}`);
}
