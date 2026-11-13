async function jsonResponse(response: Response): Promise<{ csrf?: string; error?: string }> {
  if (!response.headers.get('content-type')?.toLowerCase().includes('application/json')) throw new Error('The service returned an unexpected page. Please try again later.');
  const data = await response.json() as { csrf?: string; error?: string };
  if (!response.ok || !data.csrf) throw new Error(data.error || 'The service is unavailable. Please try again.');
  return data;
}
export async function guestCsrf(): Promise<string> {
  const response = await fetch('/api/guest/session', { method: 'POST', credentials: 'same-origin', headers: { 'X-Requested-With': 'Year7Interview' } });
  return (await jsonResponse(response)).csrf!;
}
export async function adminCsrf(): Promise<string> {
  const response = await fetch('/api/admin/session', { credentials: 'same-origin' });
  return (await jsonResponse(response)).csrf!;
}
