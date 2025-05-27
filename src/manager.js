// manager.js – Manager Portal Base
// Loads employees, supports basic edit modal, Skill/Trait placeholders

// DOM helpers
const el = id => document.getElementById(id);

// Airtable config
const BASE_ID = import.meta.env.VITE_AIRTABLE_BASE_ID.trim();
const PAT     = import.meta.env.VITE_AIRTABLE_PAT.trim();
if (!BASE_ID || !PAT) throw new Error('Missing Airtable env vars');
const HEADERS = { Authorization: `Bearer ${PAT}`, 'Content-Type': 'application/json' };
const api = (table, query='') => `https://api.airtable.com/v0/${BASE_ID}/${encodeURIComponent(table)}${query}`;

// State
let employees = [];
let skills = [];
let traits = [];

// Fetch all employees
async function loadData() {
  let all = [], offset;
  do {
    const url = api('Employee Database', `?pageSize=100${offset?`&offset=${offset}`:''}`);
    const res = await fetch(url, { headers: HEADERS });
    const { records, offset: next } = await res.json();
    all = all.concat(records);
    offset = next;
  } while (offset);
  employees = all.sort((a, b) => (a.fields['Employee Name'] || '').localeCompare(b.fields['Employee Name'] || ''));

  const sk = await fetch(api('Skills', '?pageSize=100'), { headers: HEADERS }).then(r => r.json());
  skills = sk.records;

  const tr = await fetch(api('Traits', '?pageSize=100'), { headers: HEADERS }).then(r => r.json());
  traits = tr.records;
}

// Render employee grid
function renderGrid() {
  const grid = el('manager-grid');
  grid.innerHTML = '';
  if (!employees.length) {
    el('manager-empty').classList.remove('hidden');
    return;
  }
  el('manager-empty').classList.add('hidden');
  employees.forEach(emp => {
    const f = emp.fields;
    const card = document.createElement('div');
    card.className = 'bg-white rounded-lg shadow p-4 flex flex-col';
    card.innerHTML = `
      <h3 class="font-medium text-gray-900 mb-1">${f['Employee Name']||''}</h3>
      <p class="text-sm text-gray-500 mb-3">${f['Job Title']||''}</p>
      <button class="editBtn mt-auto px-3 py-1 bg-indigo-600 text-white rounded">Edit</button>
    `;
    card.querySelector('.editBtn').onclick = () => openEditModal(emp.id);
    grid.appendChild(card);
  });
}

// Open edit modal with Name & Title
async function openEditModal(recordId) {
  const res = await fetch(api('Employee Database', `/${recordId}`), { headers: HEADERS });
  const { fields: f } = await res.json();
  el('editContent').innerHTML = `
    <label>Name:<br><input id="edit_name" class="w-full border rounded px-2 py-1" value="${f['Employee Name']||''}"></label>
    <label>Title:<br><input id="edit_title" class="w-full border rounded px-2 py-1" value="${f['Job Title']||''}"></label>
    <label>Department:<br>
  <select id="edit_dept" class="w-full border rounded px-2 py-1">
    <option ${f['Department']==='Client Service'?'selected':''}>Client Service</option>
    <option ${f['Department']==='Creative'?'selected':''}>Creative</option>
    <option ${f['Department']==='Operations'?'selected':''}>Operations</option>
  </select>
</label>
    <label>Location:<br>
  <select id="edit_loc" class="w-full border rounded px-2 py-1">
    <option ${f['Location']==='Johannesburg'?'selected':''}>Johannesburg</option>
    <option ${f['Location']==='Cape Town'?'selected':''}>Cape Town</option>
  </select>
</label>
    <label>Skills:<br><select id="edit_skills" multiple class="w-full border rounded px-2 py-1 h-32">
      ${skills.map(r => `<option value="${r.id}" ${ (f['Skills List']||[]).includes(r.id) ? 'selected' : '' }>${r.fields['Skill Name']}</option>`).join('')}
    </select></label>
    <label>Traits:<br><select id="edit_traits" multiple class="w-full border rounded px-2 py-1 h-32">
      ${traits.map(r => `<option value="${r.id}" ${ (f['Personality Traits']||[]).includes(r.id) ? 'selected' : '' }>${r.fields['Trait Name']}</option>`).join('')}
    </select></label>
    <div class="mt-4 flex justify-end space-x-2">
      <button id="editCancel" class="px-3 py-1 bg-gray-200 rounded">Cancel</button>
      <button id="editSave"   class="px-3 py-1 bg-green-600 text-white rounded">Save</button>
    </div>`;
  el('editModal').classList.remove('hidden');
  el('editCancel').onclick = () => el('editModal').classList.add('hidden');
  el('editSave').onclick   = async () => {
    const upd = {
      'Employee Name': el('edit_name').value,
      'Job Title':     el('edit_title').value,
      'Department':    el('edit_dept').value,
      'Location':      el('edit_loc').value,
      'Skills List':   Array.from(el('edit_skills').selectedOptions).map(o => o.value),
      'Personality Traits': Array.from(el('edit_traits').selectedOptions).map(o => o.value)
    };
    try {
      const response = await fetch(api('Employee Database', `/${recordId}`), {
        method: 'PATCH',
        headers: HEADERS,
        body: JSON.stringify({ fields: upd })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(JSON.stringify(result));
      console.log('Saved:', result);
    } catch (err) {
      console.error('Failed to save employee:', err);
      alert('Failed to save changes: ' + err.message);
      return;
    }
    el('editModal').classList.add('hidden');
    const updated = await fetch(api('Employee Database', `/${recordId}`), { headers: HEADERS }).then(r => r.json());
    const idx = employees.findIndex(e => e.id === recordId);
    if (idx !== -1) employees[idx] = updated;
    renderGrid();
  };
}

// Initialize
window.addEventListener('DOMContentLoaded', async () => {
  await loadData();
  renderGrid();
});
