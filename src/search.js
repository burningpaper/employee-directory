// src/search.js – Employee Directory with Advanced Search modal (Skills & Client Experience)
// Requires VITE_AIRTABLE_BASE_ID and VITE_AIRTABLE_PAT in .env

// 🍃 Tiny DOM helpers
const el  = id => document.getElementById(id);
const $$  = sel => Array.from(document.querySelectorAll(sel));

// 🌐 Airtable setup
const BASE_ID = import.meta.env.VITE_AIRTABLE_BASE_ID.trim();
const PAT     = import.meta.env.VITE_AIRTABLE_PAT.trim();
if (!BASE_ID || !PAT) throw new Error('Missing Airtable env vars');
const HEADERS = { Authorization: `Bearer ${PAT}`, 'Content-Type': 'application/json' };
const api = (table, query = '') =>
  `https://api.airtable.com/v0/${BASE_ID}/${encodeURIComponent(table)}${query}`;

// 📦 State
let EMPLOYEES = [];
let JOB_TITLE_FILTER = '';
let skillFilter     = [];
let clientFilter    = [];
let industryFilter  = [];
let clientIndustryMap = {};  // client ID -> industry

// 🔄 Fetch JSON
async function getJSON(url) {
  const r = await fetch(url, { headers: HEADERS, cache: 'no-store' });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

// helper to load all client experiences for mapping industries
async function loadAllClients() {
  const clRes = await getJSON(api('Client Experience', '?pageSize=100'));
  clRes.records.forEach(r => {
    clientIndustryMap[r.id] = r.fields['Industry'];
  });
}

// 🎨 Render grid of employee cards
function renderGrid(records) {
  const container = el('results'); if (!container) return;
  const term = (el('quickSearch').value || '').trim().toLowerCase();

  container.innerHTML = '';
  const filtered = records
    .filter(r => {
      const f = r.fields;
      const nameMatch = (f['Employee Name']||'').toLowerCase().includes(term);
      const skills  = f['Skills List']         || [];
      const clients = f['Client Experience']   || [];
      const matchSkill    = !skillFilter.length  || skills.some(id => skillFilter.includes(id));
      const matchClient   = !clientFilter.length || clients.some(id => clientFilter.includes(id));
      const matchIndustry = !industryFilter.length || clients.some(id => industryFilter.includes(clientIndustryMap[id]));
      const matchJob = !JOB_TITLE_FILTER || (f['Job Title']||'').toLowerCase().includes(JOB_TITLE_FILTER);
      return nameMatch && matchSkill && matchClient && matchIndustry && matchJob;
    })
    .sort((a, b) => (a.fields['Employee Name'] || '').localeCompare(b.fields['Employee Name'] || ''));

  if (!filtered.length) {
    el('noResults').classList.remove('hidden');
  } else {
    el('noResults').classList.add('hidden');
    filtered.forEach(emp => {
      const f = emp.fields;
      container.insertAdjacentHTML('beforeend',
        `<a href="profile.html?id=${emp.id}" class="block bg-white rounded-lg shadow hover:shadow-md p-4">
           <h3 class="font-medium text-gray-900">${f['Employee Name']||''}</h3>
           <p class="text-sm text-gray-500">${f['Job Title']||''}</p>
         </a>`
      );
    });
  }
}

// 🔍 Initial load
async function loadDirectory() {
  try {
    await loadAllClients();
    let all = [], offset;
    do {
      const url = api('Employee Database', `?pageSize=100${offset ? `&offset=${offset}` : ''}`);
      const res = await getJSON(url);
      all = all.concat(res.records);
      offset = res.offset;
    } while (offset);
    EMPLOYEES = all.sort((a, b) => (a.fields['Employee Name'] || '').localeCompare(b.fields['Employee Name'] || ''));
    renderGrid(EMPLOYEES);
  } catch (e) {
    console.error(e);
    el('results').innerHTML = '<p class="text-center text-red-600">Error loading employees.</p>';
  }
}

// 🛠 Advanced Search modal
async function openAdvancedModal() {
  const [skRes, clRes] = await Promise.all([
    getJSON(api('Skills', '?pageSize=100&sort%5B0%5D%5Bfield%5D=Skill%20Name')),
    getJSON(api('Client Experience', '?pageSize=100&sort%5B0%5D%5Bfield%5D=Client%20Name'))
  ]);

  // build industry list
  const industries = [...new Set(clRes.records.map(r => r.fields['Industry']).filter(Boolean))].sort();

  const makeList = (rows, cls, field) =>
    rows.records.map(r =>
      `<label class="flex items-center gap-2">
         <input type="checkbox" value="${r.id}" class="${cls}" ${ (cls==='skillChk'?skillFilter:clientFilter).includes(r.id)?'checked':''}>
         ${r.fields[field]||''}
       </label>`
    ).join('');

  el('advContent').innerHTML = `
    <div class="mb-4">
      <h3 class="font-medium">Job Title</h3>
      <input type="text" id="jobTitleInput" class="w-full border rounded px-2 py-1" placeholder="e.g. Creative Director">
    </div>
\$1
    <div class="mb-4">
      <h3 class="font-medium">Job Title</h3>
      <input type="text" id="jobTitleInput" class="w-full border rounded px-2 py-1" placeholder="e.g. Creative Director">
    </div>
    <div class="flex justify-end space-x-2">
      <button id="advCancel" class="px-3 py-1 bg-gray-200 rounded">Cancel</button>
      <button id="advSave"   class="px-3 py-1 bg-indigo-600 text-white rounded">Apply</button>
    </div>
  `;

  el('advModal').classList.remove('hidden');
  el('advCancel').onclick = () => el('advModal').classList.add('hidden');
  el('advSave').onclick = () => {
    const jobInput = el('jobTitleInput')?.value.trim().toLowerCase();
    JOB_TITLE_FILTER = jobInput;
    skillFilter     = $$('.skillChk:checked').map(i=>i.value);
    clientFilter    = $$('.clientChk:checked').map(i=>i.value);
    industryFilter  = $$('.industryChk:checked').map(i=>i.value);
    el('advModal').classList.add('hidden');
    renderGrid(EMPLOYEES);
  };
}

// 🔗 Wire up on DOMContentLoaded
window.addEventListener('DOMContentLoaded', () => {
  loadDirectory();
  el('quickSearch')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') renderGrid(EMPLOYEES);
  });
  el('advBtn')?.addEventListener('click', openAdvancedModal);
});
