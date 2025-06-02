// src/profile.ts – Full version with LinkedIn image processing and Airtable integration
const $ = (sel: string) => document.querySelector(sel);
const el = (id: string) => document.getElementById(id) as HTMLInputElement;

const BASE_ID = import.meta.env.VITE_AIRTABLE_BASE_ID.trim();
const TOKEN = import.meta.env.VITE_AIRTABLE_PAT.trim();
const HEADERS = {
  Authorization: `Bearer ${TOKEN}`,
  'Content-Type': 'application/json'
};
const api = (tbl: string, q = '') => `https://api.airtable.com/v0/${BASE_ID}/${encodeURIComponent(tbl)}${q}`;
const get = async (u: string) => {
  const r = await fetch(u, { headers: HEADERS });
  if (!r.ok) throw new Error(`Airtable API Error: ${r.status} ${await r.text()}`);
  return r.json();
};
const post = (t: string, b: any) => fetch(api(t), { method: 'POST', headers: HEADERS, body: JSON.stringify(b) }).then(r => r.json());
const patch = (t: string, b: any) => fetch(api(t), { method: 'PATCH', headers: HEADERS, body: JSON.stringify(b) }).then(r => r.json());

const EMP_TABLE = 'Employee Database';
const SKILL_TABLE = 'Skills';
const TRAIT_TABLE = 'Traits';
const EXP_TABLE = 'Work Experience';
const CLIENT_TABLE = 'Client Experience';

function showModal(html: string) {
  el('modalContent').innerHTML = html;
  el('modal').classList.remove('hidden');
}
function closeModal() {
  el('modal').classList.add('hidden');
  el('modalContent').innerHTML = '';
}
el('modal')?.addEventListener('click', e => {
  if ((e.target as HTMLElement).id === 'modal') closeModal();
});

window.addEventListener('DOMContentLoaded', async () => {
  const recordId = new URLSearchParams(window.location.search).get('id');

  if (!recordId) {
    console.error("Employee ID not found in URL.");
    // Optionally, display an error message to the user in the UI
    const profileNameEl = el('emp-name'); // Using ID from profile.html
    if (profileNameEl) profileNameEl.textContent = "Employee not found.";
    return;
  }

  try {
    const emp = await get(api(EMP_TABLE, '/' + recordId));
    const f = emp.fields;

    // IDs from profile.html
    (el('emp-name') as HTMLElement).textContent = f['Employee Name'] || f['Full Name'] || ''; // Adjusted to check common field names
    (el('emp-title') as HTMLElement).textContent = f['Job Title'] || f['Title'] || '';
    // el('profileLocation').textContent = f['Location'] || ''; // No direct match in profile.html, emp-meta is used
    (el('emp-meta') as HTMLElement).textContent = `${f.Department || ''}${f.Location ? ' • ' + f.Location : ''}`;
    (el('emp-bio') as HTMLElement).textContent = f['Bio'] || f['Profile Blurb'] || '';
    if (f['Profile Photo']?.[0]?.url) (el('emp-photo') as HTMLImageElement).src = f['Profile Photo'][0].url;

    // Assuming 'Skills List' contains linked record IDs and 'Skills Linked' is the lookup field name from Employee table
    // This part might need adjustment based on your actual Airtable schema for displaying skills.
    // The example below assumes f['Skills Linked'] is an array of skill objects if it's a lookup.
    // If f['Skills List'] is just an array of names, simplify accordingly.
    const skillNames = (f['Skills List'] || [])
        .map((skillId: string) => {
            // This logic depends on how 'Skills Linked' (or equivalent) is structured in your 'Employee Database' table
            // If 'Skills Linked' is an array of IDs, you might need another fetch or use pre-fetched skill names.
            // For simplicity, if 'Skills Linked' is an array of objects with 'fields.Skill Name':
            const linkedSkill = f['Skills Linked']?.find((s: any) => s.id === skillId);
            return linkedSkill?.fields['Skill Name'];
        }).filter(Boolean).join(', ');
    (el('emp-skills') as HTMLElement).textContent = skillNames || 'None listed'; // emp-skills is a div in profile.html

    const traitNames = (f['Personality Traits'] || [])
        .map((traitId: string) => {
            const linkedTrait = f['Traits Linked']?.find((t: any) => t.id === traitId);
            return linkedTrait?.fields['Trait Name'];
        }).filter(Boolean).join(', ');
    (el('emp-traits') as HTMLElement).textContent = traitNames || 'None listed'; // emp-traits is a ul in profile.html

    // Fetch Work Experience - Simplified filterByFormula
    // Assumes {Employee} in Work Experience table is the linked record field to Employee Database
    // ❗ IMPORTANT: Replace {ActualLinkFieldName} with the real name of the field in your 'Work Experience' table that links to the 'Employee Database' table.
    // Example: If your linking field is named "Employee Link", use {Employee Link}
    const workExpQuery = `?filterByFormula={Employee Code}='${recordId}'&sort[0][field]=Start%20Date&sort[0][direction]=desc`;
    const exp = await get(api(EXP_TABLE, workExpQuery));
    const expList = el('emp-experience'); // ID from profile.html
    if (expList) expList.innerHTML = '';
    for (const e of exp.records) {
      const d = e.fields;
      const from = d['Start Date']?.split('T')[0] || '';
      const to = d['End Date']?.split('T')[0] || 'Present';
      const role = d['Role Title'] || 'Unknown';
      const co = d['Company'] || 'Unknown';
      const para = document.createElement('div');
      para.innerHTML = `<h4 class="font-medium text-gray-800">${role} at ${co}</h4><p class="text-xs text-gray-500">${from} – ${to}</p><p class="mt-1 text-sm text-gray-600">${d['Description']||''}</p>`;
      expList?.appendChild(para);
    }

    // Add event listeners for edit buttons, passing the recordId
    const currentSkillIDs = f['Skills List'] || [];
    el('editSkillsBtn')?.addEventListener('click', () => openSkillsModal(currentSkillIDs, recordId));
    const currentTraitIDs = f['Personality Traits'] || [];
    el('editTraitsBtn')?.addEventListener('click', () => openTraitsModal(currentTraitIDs, recordId));

  } catch (error) {
    console.error("Error loading profile data:", error);
    const profileNameEl = el('emp-name');
    if (profileNameEl) profileNameEl.textContent = "Error loading profile.";
  }
});

async function openSkillsModal(currentIDs: string[], recordId: string) {
  const { records } = await get(api(SKILL_TABLE, '?pageSize=100&sort%5B0%5D%5Bfield%5D=Skill%20Name'));
  const rows = records.sort((a: any, b: any) => a.fields['Skill Name'].localeCompare(b.fields['Skill Name']));
  const opts = rows.map((r: any) => `<label class="flex items-center gap-2"><input type="checkbox" value="${r.id}" ${currentIDs.includes(r.id) ? 'checked' : ''} class="skillChk">${r.fields['Skill Name']}</label>`).join('<br>');
  showModal(`<h2 class="text-lg font-semibold mb-4">Edit Skills</h2><div class="space-y-2 mb-6 max-h-60 overflow-y-auto">${opts}</div><div class="flex justify-end gap-2"><button id="mCancel" class="px-3 py-1 bg-gray-200 rounded">Cancel</button><button id="mSave" class="px-3 py-1 bg-indigo-600 text-white rounded">Save</button></div>`);
  el('mCancel').onclick = closeModal;
  el('mSave').onclick = async () => {
    const newIDs = [...document.querySelectorAll('.skillChk:checked')].map((c: any) => c.value);
    await patch(EMP_TABLE, { records: [{ id: recordId, fields: { 'Skills List': newIDs } }] });
    closeModal();
    location.reload();
  };
}

async function openTraitsModal(currentIDs: string[], recordId: string) {
  const { records } = await get(api(TRAIT_TABLE, '?pageSize=100&sort%5B0%5D%5Bfield%5D=Trait%20Name'));
  const rows = records.sort((a: any, b: any) => a.fields['Trait Name'].localeCompare(b.fields['Trait Name']));
  const opts = rows.map((r: any) => `<label class="flex items-center gap-2"><input type="checkbox" value="${r.id}" ${currentIDs.includes(r.id) ? 'checked' : ''} class="traitChk">${r.fields['Trait Name']}</label>`).join('<br>');
  showModal(`<h2 class="text-lg font-semibold mb-4">Edit Personality Traits</h2><div class="space-y-2 mb-6 max-h-60 overflow-y-auto">${opts}</div><div class="flex justify-end gap-2"><button id="mCancel" class="px-3 py-1 bg-gray-200 rounded">Cancel</button><button id="mSave" class="px-3 py-1 bg-indigo-600 text-white rounded">Save</button></div>`);
  el('mCancel').onclick = closeModal;
  el('mSave').onclick = async () => {
    const newIDs = [...document.querySelectorAll('.traitChk:checked')].map((c: any) => c.value);
    await patch(EMP_TABLE, { records: [{ id: recordId, fields: { 'Personality Traits': newIDs } }] });
    closeModal();
    location.reload();
  };
}

el('processLinkedIn')?.addEventListener('click', async () => {
  const file = el('linkedinUpload')?.files?.[0];
  const recordId = new URLSearchParams(window.location.search).get('id'); // Get recordId again or pass it if this function is called from a context where it's available

  if (!recordId) {
    alert('Employee ID not found. Cannot process LinkedIn data.');
    return;
  }

  if (!file) return alert('Upload a screenshot first.');
  const reader = new FileReader();

  reader.onload = async () => {
    const base64 = (reader.result as string).split(',')[1];
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${import.meta.env.VITE_OPENAI_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', content: 'Extract work experience from this LinkedIn profile screenshot. Return JSON like: [{company, role, start, end, description}]' },
              { type: 'image_url', image_url: { url: `data:image/png;base64,${base64}` } }
            ]
          }
        ]
      })
    });

    const data = await res.json();
    const text = data.choices?.[0]?.message?.content || 'No result.';
    el('linkedInOutput').textContent = text;

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      console.warn('OpenAI returned unparseable text:', text);
      return alert('Could not parse response. Check the raw result above.');
    }

    const records = parsed.map((item: any) => ({
      fields: {
        'Employee Code': [recordId], // Use the fetched recordId
        'Company': item.company,
        'Role Title': item.role,
        'Start Date': item.start ? new Date(item.start).toISOString() : null,
        'End Date': item.end ? new Date(item.end).toISOString() : null,
        'Description': item.description || ''
      }
    }));

    const resp = await post(EXP_TABLE, { records });
    console.log('Inserted work experience:', resp);
    alert('Work experience imported. Reloading page.');
    location.reload();
  };

  reader.readAsDataURL(file);
});
