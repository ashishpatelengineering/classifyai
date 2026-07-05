const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

async function parseError(res) {
  try {
    const data = await res.json();
    return data.detail || `Request failed (${res.status})`;
  } catch {
    return `Request failed (${res.status})`;
  }
}

export async function suggestCategories(file, { critique = false } = {}) {
  const form = new FormData();
  form.append('file', file);
  form.append('critique', critique ? 'true' : 'false');

  const res = await fetch(`${API_BASE}/api/suggest-categories`, {
    method: 'POST',
    body: form,
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function assignCategories(categories, file) {
  const form = new FormData();
  form.append('categories', categories.join('\n'));
  form.append('file', file);

  const res = await fetch(`${API_BASE}/api/assign-categories`, {
    method: 'POST',
    body: form,
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}
