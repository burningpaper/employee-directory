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
const get = (u: string) => fetch(u, { headers: HEADERS }).then(r => r.json());
const post = (t: string, b: any) => fetch(api(t), { method: 'POST', headers: HEADERS, body: JSON.stringify(b) }).then(r => r.json());
const patch = (t: string, b: any) => fetch(api(t), { method: 'PATCH', headers: HEADERS, body: JSON.stringify(b) }).then(r => r.json());

const EMP_TABLE = 'Employee Database';
const SKILL_TABLE = 'Skills';
const TRAIT_TABLE = 'Traits';
const EXP_TABLE = 'Work Experience';
const CLIENT_TABLE = 'Client Experience';

// Assume REC_ID is globally available
declare const REC_ID: string;

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

async function openSkillsModal(currentIDs: string[]) {
  const { records } = await get(api(SKILL_TABLE, '?pageSize=100&sort%5B0%5D%5Bfield%5D=Skill%20Name'));
  const rows = records.sort((a: any, b: any) => a.fields['Skill Name'].localeCompare(b.fields['Skill Name']));
  const opts = rows.map((r: any) => `<label class="flex items-center gap-2"><input type="checkbox" value="${r.id}" ${currentIDs.includes(r.id) ? 'checked' : ''} class="skillChk">${r.fields['Skill Name']}</label>`).join('<br>');
  showModal(`<h2 class="text-lg font-semibold mb-4">Edit Skills</h2><div class="space-y-2 mb-6 max-h-60 overflow-y-auto">${opts}</div><div class="flex justify-end gap-2"><button id="mCancel" class="px-3 py-1 bg-gray-200 rounded">Cancel</button><button id="mSave" class="px-3 py-1 bg-indigo-600 text-white rounded">Save</button></div>`);
  el('mCancel').onclick = closeModal;
  el('mSave').onclick = async () => {
    const newIDs = [...document.querySelectorAll('.skillChk:checked')].map((c: any) => c.value);
    await patch(EMP_TABLE, { records: [{ id: REC_ID, fields: { 'Skills List': newIDs } }] });
    closeModal();
    location.reload();
  };
}

async function openTraitsModal(currentIDs: string[]) {
  const { records } = await get(api(TRAIT_TABLE, '?pageSize=100&sort%5B0%5D%5Bfield%5D=Trait%20Name'));
  const rows = records.sort((a: any, b: any) => a.fields['Trait Name'].localeCompare(b.fields['Trait Name']));
  const opts = rows.map((r: any) => `<label class="flex items-center gap-2"><input type="checkbox" value="${r.id}" ${currentIDs.includes(r.id) ? 'checked' : ''} class="traitChk">${r.fields['Trait Name']}</label>`).join('<br>');
  showModal(`<h2 class="text-lg font-semibold mb-4">Edit Personality Traits</h2><div class="space-y-2 mb-6 max-h-60 overflow-y-auto">${opts}</div><div class="flex justify-end gap-2"><button id="mCancel" class="px-3 py-1 bg-gray-200 rounded">Cancel</button><button id="mSave" class="px-3 py-1 bg-indigo-600 text-white rounded">Save</button></div>`);
  el('mCancel').onclick = closeModal;
  el('mSave').onclick = async () => {
    const newIDs = [...document.querySelectorAll('.traitChk:checked')].map((c: any) => c.value);
    await patch(EMP_TABLE, { records: [{ id: REC_ID, fields: { 'Personality Traits': newIDs } }] });
    closeModal();
    location.reload();
  };
}

el('processLinkedIn')?.addEventListener('click', async () => {
  const file = el('linkedinUpload')?.files?.[0];
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
              { type: 'text', content: `Extract ONLY the person's work experience from the attached LinkedIn screenshot. Format the result as raw JSON. DO NOT include commentary, just return: [{"company":"...","role":"...","start":"YYYY-MM","end":"YYYY-MM","description":"..."}]` },
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
      console.log('GPT raw output:', text);
      parsed = JSON.parse(text);
    } catch (e) {
      console.warn('OpenAI returned unparseable text:', text);
      return alert('Could not parse response. Check the raw result above.');
    }

    const records = parsed.map((item: any) => ({
      fields: {
        'Employee Code': [REC_ID],
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
