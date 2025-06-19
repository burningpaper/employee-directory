// src/profile.ts – robust binding (no optional chaining), waits for DOMContentLoaded
console.log('profile.ts script parsing started...'); // <-- ADD THIS LINE
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
  console.log('DOMContentLoaded event fired. Setting up profile page...');
  // --- PDF Processing Elements ---
  const pdfUploader = document.getElementById('linkedinPdfUploader') as HTMLInputElement | null;
  const processPdfButton = document.getElementById('processPdfButton') as HTMLButtonElement | null;
  const experienceOutput = document.getElementById('experienceOutput') as HTMLPreElement | null;

  // Bind static buttons
  const editBtn   = $('editBtn');
  const cancelBtn = $('cancelBtn');
  if (editBtn) {
    console.log('Edit button found. Attaching listener.');
    editBtn.addEventListener('click', () => toggleEdit(true));
  }
  if (cancelBtn) {
    console.log('Cancel button found. Attaching listener.');
    cancelBtn.addEventListener('click', () => toggleEdit(false));
  }

  // Load data
  const recordId = new URLSearchParams(location.search).get('id');
  if (!recordId) return;
  try {
    const emp = await getJSON(`https://api.airtable.com/v0/${BASE_ID}/${encodeURIComponent(EMP_TABLE)}/${recordId}`);
    const f = emp.fields;

    const empNameEl = $('emp-name');
    if (empNameEl) empNameEl.textContent  = f['Employee Name'];

    const empTitleEl = $('emp-title');
    if (empTitleEl) empTitleEl.textContent = f['Job Title'] || '';

    const empMetaEl = $('emp-meta');
    if (empMetaEl) empMetaEl.textContent  = `${f.Department || ''}${f.Location ? ' • ' + f.Location : ''}`;

    const empBioEl = $('emp-bio');
    if (empBioEl) empBioEl.textContent   = f.Bio || '';

    const empPhotoEl = $('emp-photo');
    if (empPhotoEl) empPhotoEl.setAttribute('src', (f['Profile Photo'] && f['Profile Photo'][0]?.url) || 'https://placehold.co/128');

    const empPhoneEl = $('emp-phone');
    if (empPhoneEl) empPhoneEl.textContent = f.Phone || '';

    const empStartEl = $('emp-start');
    if (empStartEl) empStartEl.textContent = fmt(f['Employee Start Date']);

    // skills
    const skills = await getJSON(`https://api.airtable.com/v0/${BASE_ID}/${encodeURIComponent(SKILL_TABLE)}?pageSize=3`);
    const empSkillsEl = $('emp-skills');
    // simple demo chip - ensure empSkillsEl exists
    if (empSkillsEl) {
        skills.records.slice(0,3).forEach((r: any)=> empSkillsEl.insertAdjacentHTML('beforeend', `<span class="px-2 py-1 bg-indigo-50 text-indigo-700 rounded-full text-sm">${r.fields['Skill Name']}</span>`));
    }

    const saveBtn = $('saveBtn');
    if (saveBtn) saveBtn.addEventListener('click', () => saveEdits(recordId));
  } catch (e) {
    console.error("Error loading employee data:", e);
    const empNameEl = $('emp-name');
    if (empNameEl) empNameEl.textContent = "Error loading profile.";
  }

  // --- PDF Processing Logic ---
  if (pdfUploader && processPdfButton && experienceOutput) {
    console.log('PDF processing elements found. Attaching click listener to processPdfButton.');
    processPdfButton.addEventListener('click', async () => {
        console.log('processPdfButton clicked! (Inside listener)');
        console.log('processPdfButton clicked!');
        if (!pdfUploader.files || pdfUploader.files.length === 0) {
            experienceOutput.textContent = 'Please select a PDF file first.';
            console.log('No PDF file selected.');
            return;
        }

        const file = pdfUploader.files[0];
        const formData = new FormData();
        formData.append('linkedinPdf', file); // Name must match what backend expects
        // Add the recordId to the FormData
        const currentRecordId = new URLSearchParams(location.search).get('id');
        if (currentRecordId) {
            formData.append('employeeRecordId', currentRecordId);
        }

        experienceOutput.textContent = 'Processing PDF... Please wait.';
        processPdfButton.disabled = true;
        console.log('Attempting to fetch /api/process-linkedin-pdf');

        try {
            const response = await fetch('/api/process-linkedin-pdf', {
                method: 'POST',
                body: formData,
            });
            console.log('Fetch response received:', response.status);

            if (response.ok) {
                const data = await response.json();
                experienceOutput.textContent = JSON.stringify(data.job_experiences || data, null, 2);
            } else {
                const contentType = response.headers.get('content-type');
                if (contentType && contentType.includes('application/json')) {
                    const errorData = await response.json();
                    experienceOutput.textContent = `Error: ${response.status} - ${errorData.error || 'Failed to process PDF.'}\nDetails: ${errorData.details || 'N/A'}`;
                    console.error('Server error during PDF processing (JSON):', errorData);
                } else {
                    const errorText = await response.text();
                    experienceOutput.textContent = `Error: ${response.status} - Server returned non-JSON response. Check backend logs. Response: ${errorText.substring(0, 200)}...`;
                    console.error('Server error during PDF processing (non-JSON):', errorText);
                }
            }
        } catch (error) {
            experienceOutput.textContent = 'An unexpected error occurred while sending the PDF processing request.';
            console.error('Fetch error during PDF processing:', error);
        } finally {
            processPdfButton.disabled = false;
        }
    });
  } else {
    console.warn('One or more PDF processing elements (linkedinPdfUploader, processPdfButton, or experienceOutput) were NOT found in the DOM. Button will not work.');
  }
});
