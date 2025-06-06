// src/profile.ts – robust binding (no optional chaining), waits for DOMContentLoaded
//-------------------------------------------------------------
const $ = (id: string) => document.getElementById(id) as HTMLElement | null;

// 1️⃣ Env vars (Vite)
export const BASE_ID = (import.meta.env.VITE_AIRTABLE_BASE_ID ?? '').trim();
export const TOKEN   = (import.meta.env.VITE_AIRTABLE_PAT ?? '').trim();
if (!BASE_ID || !TOKEN) throw new Error('Missing Airtable env vars');

// 2️⃣ Tables
const EMP_TABLE   = 'Employee Database';
const SKILL_TABLE = 'Skills';

// 3️⃣ Helpers
const authHeaders = { Authorization: `Bearer ${TOKEN}` };
const jsonHeaders = { ...authHeaders, 'Content-Type': 'application/json' };
const getJSON = async (url: string) => {
  const r = await fetch(url, { headers: authHeaders });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
};

function fmt(d?: string) {
  return d ? new Date(d).toLocaleDateString('en-ZA', { year: 'numeric', month: 'short' }) : '';
}

// 4️⃣ toggle UI
function toggleEdit(on: boolean) {
  const editBtn   = $('editBtn');
  const saveBtn   = $('saveBtn');
  const cancelBtn = $('cancelBtn');
  if (editBtn && saveBtn && cancelBtn) {
    editBtn.style.display   = on ? 'none' : '';
    saveBtn.style.display   = on ? '' : 'none';
    cancelBtn.style.display = on ? '' : 'none';
  }
  const title = $('emp-title');
  const bio   = $('emp-bio');
  const phone = $('emp-phone');
  if (!title || !bio || !phone) return;
  if (on) {
    title.innerHTML = `<input id="editTitle" class="w-full border rounded px-2 py-1" value="${title.textContent}">`;
    bio.innerHTML   = `<textarea id="editBio" class="w-full border rounded px-2 py-1" rows="4">${bio.textContent}</textarea>`;
    phone.innerHTML = `<input id="editPhone" class="w-full border rounded px-2 py-1" value="${phone.textContent}">`;
  } else {
    const t = $('editTitle') as HTMLInputElement | null;
    const b = $('editBio')   as HTMLTextAreaElement | null;
    const p = $('editPhone') as HTMLInputElement | null;
    if (t) title.textContent = t.value;
    if (b) bio.textContent   = b.value;
    if (p) phone.textContent = p.value;
  }
}

async function saveEdits(recordId: string) {
  const t = $('editTitle') as HTMLInputElement | null;
  const b = $('editBio')   as HTMLTextAreaElement | null;
  const p = $('editPhone') as HTMLInputElement | null;
  if (!t || !b || !p) return;
  const body = JSON.stringify({
    records: [{ id: recordId, fields: { 'Job Title': t.value, Bio: b.value, Phone: p.value } }]
  });
  const r = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${encodeURIComponent(EMP_TABLE)}`, {
    method: 'PATCH', headers: jsonHeaders, body
  });
  if (r.ok) toggleEdit(false); else console.error(await r.text());
}

// 5️⃣ On DOM ready
window.addEventListener('DOMContentLoaded', async () => {
  // Bind static buttons
  const editBtn   = $('editBtn');
  const cancelBtn = $('cancelBtn');
  if (editBtn)   editBtn.addEventListener('click', () => toggleEdit(true));
  if (cancelBtn) cancelBtn.addEventListener('click', () => toggleEdit(false));

  // Load data
  const recordId = new URLSearchParams(location.search).get('id');
  if (!recordId) return;
  try {
    const emp = await getJSON(`https://api.airtable.com/v0/${BASE_ID}/${encodeURIComponent(EMP_TABLE)}/${recordId}`);
    const f = emp.fields;
    $('emp-name')!.textContent  = f['Employee Name'];
    $('emp-title')!.textContent = f['Job Title'] || '';
    $('emp-meta')!.textContent  = `${f.Department || ''}${f.Location ? ' • ' + f.Location : ''}`;
    $('emp-bio')!.textContent   = f.Bio || '';
    $('emp-photo')!.setAttribute('src', (f['Profile Photo'] && f['Profile Photo'][0]?.url) || 'https://placehold.co/128');
    $('emp-phone')!.textContent = f.Phone || '';
    $('emp-start')!.textContent = fmt(f['Employee Start Date']);

    // skills
    const skills = await getJSON(`https://api.airtable.com/v0/${BASE_ID}/${encodeURIComponent(SKILL_TABLE)}?pageSize=3`);
    // simple demo chip
    skills.records.slice(0,3).forEach((r: any)=> $('emp-skills')!.insertAdjacentHTML('beforeend', `<span class="px-2 py-1 bg-indigo-50 text-indigo-700 rounded-full text-sm">${r.fields['Skill Name']}</span>`));

    const saveBtn = $('saveBtn');
    if (saveBtn) saveBtn.addEventListener('click', () => saveEdits(recordId));
  } catch (e) {
    console.error(e);
  }
});
