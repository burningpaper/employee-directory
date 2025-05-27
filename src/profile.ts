// src/profile.js – Skills modal uses multi‑select from live DB options
//------------------------------------------------------------------------
const $ = sel => document.querySelector(sel);
const el = id  => document.getElementById(id);

/* 1  Airtable basics */
const BASE_ID = import.meta.env.VITE_AIRTABLE_BASE_ID.trim();
const TOKEN   = import.meta.env.VITE_AIRTABLE_PAT.trim();
const HEADERS = { Authorization:`Bearer ${TOKEN}`, 'Content-Type':'application/json' };
const api = (tbl, q='') => `https://api.airtable.com/v0/${BASE_ID}/${encodeURIComponent(tbl)}${q}`;
const get  = (u)=>fetch(u,{headers:HEADERS}).then(r=>r.json());
const post = (t,b)=>fetch(api(t),{method:'POST', headers:HEADERS, body:JSON.stringify(b)}).then(r=>r.json());
const patch=(t,b)=>fetch(api(t),{method:'PATCH',headers:HEADERS, body:JSON.stringify(b)}).then(r=>r.json());

const EMP_TABLE='Employee Database';
const SKILL_TABLE='Skills';
const TRAIT_TABLE='Traits';
const EXP_TABLE   = 'Work Experience';
const CLIENT_TABLE = 'Client Experience';

/* 2  Modal helpers */
function showModal(html){el('modalContent').innerHTML=html;el('modal').classList.remove('hidden');}
function closeModal(){el('modal').classList.add('hidden');el('modalContent').innerHTML='';}
el('modal').onclick=e=>{if(e.target.id==='modal')closeModal();};

/* 3  Skills modal with checkboxes */
async function openSkillsModal(currentIDs){
  const {records}=await get(api(SKILL_TABLE,'?pageSize=100&sort%5B0%5D%5Bfield%5D=Skill%20Name'));
  const rows=records.sort((a,b)=>a.fields['Skill Name'].localeCompare(b.fields['Skill Name']));
  const opts=rows.map(r=>`<label class="flex items-center gap-2"><input type="checkbox" value="${r.id}" ${currentIDs.includes(r.id)?'checked':''} class="skillChk">${r.fields['Skill Name']}</label>`).join('<br>');
  showModal(`<h2 class="text-lg font-semibold mb-4">Edit Skills</h2><div class="space-y-2 mb-6 max-h-60 overflow-y-auto">${opts}</div><div class="flex justify-end gap-2"><button id="mCancel" class="px-3 py-1 bg-gray-200 rounded">Cancel</button><button id="mSave" class="px-3 py-1 bg-indigo-600 text-white rounded">Save</button></div>`);
  el('mCancel').onclick=closeModal;
  el('mSave').onclick=async()=>{
    const newIDs=[...document.querySelectorAll('.skillChk:checked')].map(c=>c.value);
    await patch(EMP_TABLE,{records:[{id:REC_ID,fields:{'Skills List':newIDs}}]});
    closeModal();location.reload();};
}

/* 3a Traits modal with checkboxes */
async function openTraitsModal(currentIDs){
  const {records}=await get(api(TRAIT_TABLE,'?pageSize=100&sort%5B0%5D%5Bfield%5D=Trait%20Name'));
  const rows=records.sort((a,b)=>a.fields['Trait Name'].localeCompare(b.fields['Trait Name']));
  const opts=rows.map(r=>`<label class="flex items-center gap-2"><input type="checkbox" value="${r.id}" ${currentIDs.includes(r.id)?'checked':''} class="traitChk">${r.fields['Trait Name']}</label>`).join('<br>');
  showModal(`<h2 class="text-lg font-semibold mb-4">Edit Personality Traits</h2><div class="space-y-2 mb-6 max-h-60 overflow-y-auto">${opts}</div><div class="flex justify-end gap-2"><button id="mCancel" class="px-3 py-1 bg-gray-200 rounded">Cancel</button><button id="mSave" class="px-3 py-1 bg-indigo-600 text-white rounded">Save</button></div>`);
  el('mCancel').onclick=closeModal;
  el('mSave').onclick=async()=>{
    const newIDs=[...document.querySelectorAll('.traitChk:checked')].map(c=>c.value);
    await patch(EMP_TABLE,{records:[{id:REC_ID,fields:{'Personality Traits':newIDs}}]});
    closeModal();location.reload();};
}

/* 3b Experience modal form */
function openExperienceModal(){
  showModal(`
    <h2 class="text-lg font-semibold mb-4">Add Experience</h2>
    <div class="space-y-3">
      <input id="expCompany" class="w-full border rounded px-3 py-1" placeholder="Company" />
      <input id="expRole"    class="w-full border rounded px-3 py-1" placeholder="Role / Title" />
      <div class="flex gap-2">
        <input id="expStart" type="month" class="w-full border rounded px-3 py-1" />
        <input id="expEnd"   type="month" class="w-full border rounded px-3 py-1" />
      </div>
      <textarea id="expDesc" class="w-full border rounded p-2" rows="3" placeholder="Description"></textarea>
    </div>
    <div class="mt-6 flex justify-end gap-2">
      <button id="mCancelExp" class="px-3 py-1 bg-gray-200 rounded">Cancel</button>
      <button id="mSaveExp"   class="px-3 py-1 bg-indigo-600 text-white rounded">Add</button>
    </div>
  `);
  el('mCancelExp').onclick = closeModal;
  el('mSaveExp').onclick = async ()=>{
    const body={records:[{fields:{
      Company: el('expCompany').value,
      Role: el('expRole').value,
      'Start Date': el('expStart').value?new Date(el('expStart').value).toISOString():undefined,
      'End Date': el('expEnd').value?new Date(el('expEnd').value).toISOString():undefined,
      Description: el('expDesc').value,
      'Employee Code': [REC_ID]
    }}]};
    await post(EXP_TABLE, body);
    closeModal();location.reload();
  };
}

/* 4  Page init (simplified) */
let REC_ID = '';
let EMP_CODE = '';
window.addEventListener('DOMContentLoaded', async () => {
  REC_ID = new URLSearchParams(location.search).get('id');
  if (!REC_ID) return;
  // fetch employee
  const empRes = await get(api(EMP_TABLE, '/' + REC_ID));
  const f = empRes.fields;
  EMP_CODE = f['Employee Code'];
  // render header
  el('emp-name').textContent  = f['Employee Name'] || '';
  el('emp-title').textContent = f['Job Title'] || '';
  el('emp-meta').textContent  = `${f.Department || ''}${f.Location ? ' • '+f.Location : ''}`;
  el('emp-bio').textContent   = f.Bio || '';
  el('emp-photo').src         = (f['Profile Photo'] && f['Profile Photo'][0]?.url) || 'https://placehold.co/128';
  // render skills
  const esRes = await get(api('Skill Levels', `?filterByFormula=${encodeURIComponent(`{Employee}='${REC_ID}'`)}`));
  const skillIds = esRes.records.map(r => r.fields['Skill']?.[0]).filter(Boolean);
  let skillsMap = {};
  if (skillIds.length) {
    const skillsRes = await get(api('Skills', `?filterByFormula=${encodeURIComponent(`OR(${skillIds.map(id => `RECORD_ID()='${id}'`).join(',')})`)}`));
    skillsRes.records.forEach(r => skillsMap[r.id] = r.fields['Skill Name']);
  }
  esRes.records.forEach(r => {
    const skillId = r.fields['Skill']?.[0];
    const skillName = skillsMap[skillId] || 'Unknown';
    const level = r.fields['Level'] || '';
    el('emp-skills').insertAdjacentHTML('beforeend', `<span class="px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded-full text-sm">${skillName} (${level})</span>`);
  });

  // render traits
  if (f['Personality Traits']?.length) {
    const traitsRes = await get(api(TRAIT_TABLE, `?filterByFormula=${encodeURIComponent(`OR(${f['Personality Traits'].map(id=>`RECORD_ID()='${id}'`).join(',')})`)}`));
    traitsRes.records.forEach(r => el('emp-traits').insertAdjacentHTML('beforeend', `<li class="text-sm text-gray-700">${r.fields['Trait Name']}</li>`));
  }
   // render work experience
   if (f['Work Experience']?.length) {
    const expRes = await get(
      api(EXP_TABLE,
          `?filterByFormula=${encodeURIComponent(
            `OR(${f['Work Experience']
              .map(id => `RECORD_ID()='${id}'`)
              .join(',')})`
          )}`)
    );
    expRes.records.forEach(r => {
      const ef = r.fields;
      el('emp-experience').insertAdjacentHTML(
        'beforeend',
        `<div class="bg-white p-4 rounded-lg shadow-sm">
           <h4 class="font-medium text-gray-900">${ef.Role || ''} · ${ef.Company || ''}</h4>
           <p class="text-sm text-gray-500">${ef['Start Date']?.slice(0,7)} – ${ef['End Date']?.slice(0,7) || 'Present'}</p>
           <p class="mt-2 text-gray-700 text-sm">${ef.Description || ''}</p>
         </div>`
      );
    });
  }

    // render client experience
  if (f['Client Experience']?.length) {
    const clientRes = await get(
      api(CLIENT_TABLE,
          `?filterByFormula=${encodeURIComponent(
            `OR(${f['Client Experience']
              .map(id => `RECORD_ID()='${id}'`)
              .join(',')})`
          )}`)
    );
    clientRes.records.forEach(r => {
      const cf = r.fields;
      const start = cf['Start Date'] ? new Date(cf['Start Date']) : null;
      const end   = cf['End Date']   ? new Date(cf['End Date'])   : new Date();
      const years = cf['Years Experience'] || (start ? (end.getFullYear() - start.getFullYear()) : '');
      const lastYear = cf['End Date'] ? cf['End Date'].slice(0,4) : new Date().getFullYear();
      el('emp-clients').insertAdjacentHTML(
        'beforeend',
        `<tr>
           <td class="px-4 py-2">${cf['Client Name'] || cf['Client'] || ''}</td>
           <td class="px-4 py-2">${cf.Industry || ''}</td>
           <td class="px-4 py-2">${years}</td>
           <td class="px-4 py-2">${lastYear}</td>
         </tr>`
      );
    });
  }

    // bind action buttons
  el('addExpBtn').onclick      = openExperienceModal;
  el('editClientBtn').onclick  = () => openClientModal(f['Client Experience'] || []);
  el('editSkillsBtn').onclick  = () => openSkillsModal(f['Skills List']      || []);
  el('editTraitsBtn').onclick  = () => openTraitsModal(f['Personality Traits']|| []);

  // quick search bar on profile page
  const qs = el('quickSearch');
  if (qs) qs.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      const term = e.target.value.trim();
      const url = term ? `search.html?q=${encodeURIComponent(term)}` : 'search.html';
      location.href = url;
    }
  });
});

