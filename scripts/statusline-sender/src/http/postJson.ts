export async function postJson(
  apiUrl: string,
  path: string,
  payload: unknown,
  authToken: string | null
): Promise<void> {
  const headers = new Headers({
    'content-type': 'application/json'
  });

  if (typeof authToken === 'string') {
    headers.set('authorization', `Bearer ${authToken}`);
  }

  const response = await fetch(new URL(path, apiUrl), {
    method: 'POST',
    headers,
    body: JSON.stringify(payload)
  });

  if (response.ok) {
    return;
  }

  const responseText = await response.text();
  throw new Error(`POST ${path} failed with ${response.status}: ${responseText}`);
}
