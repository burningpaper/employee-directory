// src/profile.ts – robust binding (no optional chaining), waits for DOMContentLoaded
console.log('profile.ts script parsing started...');
const $ = (id: string) => document.getElementById(id) as HTMLElement | null;

// 1️⃣ Env vars (Vite)
export const BASE_ID = (import.meta.env.VITE_AIRTABLE_BASE_ID ?? '').trim();
export const TOKEN   = (import.meta.env.VITE_AIRTABLE_PAT ?? '').trim();
if (!BASE_ID || !TOKEN) throw new Error('Missing Airtable env vars');

// 2️⃣ Tables
const EMP_TABLE   = 'Employee Database';
const SKILL_TABLE = 'Skills'; // This might not be strictly needed if skills are directly on employee record
const TRAIT_TABLE = 'Traits'; // Assuming you have a Traits master table
const WORK_EXPERIENCE_TABLE = 'Work Experience'; // Table name for work experience records

// 3️⃣ Helpers
const authHeaders = { Authorization: `Bearer ${TOKEN}` };
const jsonHeaders = { ...authHeaders, 'Content-Type': 'application/json' };
const getJSON = async (url: string) => {
  const r = await fetch(url, { headers: authHeaders });
  if (!r.ok) {
    const errorText = await r.text();
    console.error(`Error fetching from ${url}: ${r.status} - ${errorText}`);
    throw new Error(`Failed to fetch data: ${r.status} - ${errorText}`);
  }
  return r.json();
};

function fmt(d?: string) {
  return d ? new Date(d).toLocaleDateString('en-ZA', { year: 'numeric', month: 'short' }) : '';
}

// Global variables to store master lists of skills and traits
let allSkills: { id: string; name: string }[] = [];
let allTraits: { id: string; name: string }[] = [];

// 4️⃣ toggle UI for main profile fields (Job Title, Bio, Phone)
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
    title.innerHTML = `<input id="editTitle" class="w-full border rounded px-2 py-1" value="${title.textContent || ''}">`;
    bio.innerHTML   = `<textarea id="editBio" class="w-full border rounded px-2 py-1" rows="4">${bio.textContent || ''}</textarea>`;
    phone.innerHTML = `<input id="editPhone" class="w-full border rounded px-2 py-1" value="${phone.textContent || ''}">`;
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

  const fieldsToUpdate = {
    'Job Title': t.value,
    'Bio': b.value,
    'Phone': p.value
  };

  try {
    await updateEmployeeRecord(recordId, fieldsToUpdate);
    toggleEdit(false); // Hide edit fields and show static text
    alert('Profile updated successfully!');
  } catch (error) {
    console.error("Error saving main profile edits:", error);
    alert('Failed to save profile edits. Please try again.');
  }
}

// Helper function to update employee record in Airtable (used by modals and main edit)
async function updateEmployeeRecord(recordId: string, fields: { [key: string]: any }) {
    const url = `https://api.airtable.com/v0/${BASE_ID}/${encodeURIComponent(EMP_TABLE)}`;
    const body = JSON.stringify({ records: [{ id: recordId, fields }] });
    const response = await fetch(url, {
      method: 'PATCH',
      headers: jsonHeaders,
      body,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to update record: ${response.status} - ${errorText}`);
    }
    return response.json();
}

// 5️⃣ On DOM ready
window.addEventListener('DOMContentLoaded', async () => {
  console.log('DOMContentLoaded event fired. Setting up profile page...');

  // --- PDF Processing Elements ---
  const pdfUploader = document.getElementById('linkedinPdfUploader') as HTMLInputElement | null;
  const processPdfButton = document.getElementById('processPdfButton') as HTMLButtonElement | null;
  const experienceOutput = document.getElementById('experienceOutput') as HTMLPreElement | null;

  // Bind static buttons (Edit, Save, Cancel for main profile fields)
  const editBtn   = $('editBtn');
  const cancelBtn = $('cancelBtn');
  const saveBtn = $('saveBtn'); // Re-get saveBtn for main profile fields

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
  if (!recordId) {
      console.error("No employee record ID found in URL.");
      const empNameEl = $('emp-name');
      if (empNameEl) empNameEl.textContent = "Error: Employee ID not found in URL.";
      return;
  }

  // Fetch master lists of skills and traits once on load
  allSkills = (await getJSON(`https://api.airtable.com/v0/${BASE_ID}/${encodeURIComponent(SKILL_TABLE)}`)).records.map((r: any) => ({ id: r.id, name: r.fields['Skill Name'] || r.fields.Name }));
  allTraits = (await getJSON(`https://api.airtable.com/v0/${BASE_ID}/${encodeURIComponent(TRAIT_TABLE)}`)).records.map((r: any) => ({ id: r.id, name: r.fields['Trait Name'] || r.fields.Name }));

  try {
    const emp = await getJSON(`https://api.airtable.com/v0/${BASE_ID}/${encodeURIComponent(EMP_TABLE)}/${recordId}`);
    const f = emp.fields; // Employee fields

    const empNameEl = $('emp-name');
    if (empNameEl) empNameEl.textContent  = f['Employee Name'] || 'N/A';

    const empTitleEl = $('emp-title');
    if (empTitleEl) empTitleEl.textContent = f['Job Title'] || 'N/A';

    const empMetaEl = $('emp-meta');
    if (empMetaEl) empMetaEl.textContent  = `${f.Department || ''}${f.Location ? ' • ' + f.Location : ''}`;

    const empBioEl = $('emp-bio');
    if (empBioEl) empBioEl.textContent   = f.Bio || 'No bio available.';

    const empPhotoEl = $('emp-photo');
    if (empPhotoEl) empPhotoEl.setAttribute('src', (f['Profile Photo'] && f['Profile Photo'][0]?.url) || 'https://placehold.co/128');

    const empPhoneEl = $('emp-phone');
    if (empPhoneEl) empPhoneEl.textContent = f.Phone || 'N/A';

    const empStartEl = $('emp-start');
    if (empStartEl) empStartEl.textContent = fmt(f['Employee Start Date']);

    // Bind main save button after recordId is available
    if (saveBtn) saveBtn.addEventListener('click', () => saveEdits(recordId));

    // Populate Work Experience
    const workExpEl = $('work-experience-list');
    const workExpIds = f['Work Experience']; // This will be an array of record IDs

    if (workExpEl && workExpIds && Array.isArray(workExpIds) && workExpIds.length > 0) {
        workExpEl.innerHTML = `<p class="text-gray-500">Loading work experience...</p>`;

        try {
            // Create a fetch promise for each linked record ID
            const experiencePromises = workExpIds.map(id => getJSON(`https://api.airtable.com/v0/${BASE_ID}/${encodeURIComponent(WORK_EXPERIENCE_TABLE)}/${id}`));
            const experienceRecords = await Promise.all(experiencePromises);

            // Render the full details for each job
            workExpEl.innerHTML = experienceRecords.map(record => {
                const job = record.fields;
                const startDate = job['Start Date'] ? fmt(job['Start Date']) : 'N/A';
                const endDate = job['End Date'] ? fmt(job['End Date']) : 'Present';
                return `
                    <div class="p-4 border border-gray-200 rounded-md shadow-sm">
                        <h3 class="font-bold text-gray-800">${job.Role || 'N/A'}</h3>
                        <p class="text-md text-gray-600">${job.Company || 'N/A'}</p>
                        <p class="text-sm text-gray-500">${startDate} – ${endDate}</p>
                        <p class="mt-2 text-sm text-gray-700 prose">${job.Description || ''}</p>
                    </div>`;
            }).join('');
        } catch (err) {
            console.error("Failed to fetch work experience details:", err);
            workExpEl.innerHTML = `<p class="text-red-500">Could not load work experience details.</p>`;
        }
    } else if (workExpEl) {
        workExpEl.innerHTML = `<p class="text-gray-500">No work experience listed.</p>`;
    }

    // Populate Client Experience
    const clientExpEl = $('client-experience-list'); // This is the display div
    const currentClientExp = Array.isArray(f['Client Experience']) ? f['Client Experience'].join('\n') : String(f['Client Experience'] || ''); // Data for modal
    if (clientExpEl) {
        clientExpEl.innerHTML = currentClientExp.split('\n') // Display formatted
            .filter((exp: string) => exp.trim() !== '')
            .map((exp: string) => `<p class="mb-2 text-gray-700">${exp}</p>`).join('');
    }

    // Populate Skills from the employee record
    const empSkillsEl = $('emp-skills'); // Display div
    // f.Skills will be an array of { id: 'recXYZ', name: 'Skill Name' } if it's a linked record lookup
    const currentSkillsLinked = Array.isArray(f.Skills) ? f.Skills : [];
    if (empSkillsEl) {
        empSkillsEl.innerHTML = currentSkillsLinked
            .filter((skill: any) => skill.name && skill.name.trim() !== '')
            .map((skill: any) =>
                `<span class="px-2 py-1 bg-indigo-50 text-indigo-700 rounded-full text-sm font-medium">${skill.name}</span>`
            ).join('');
    }
    // For modal pre-population, we need the IDs of current skills
    const currentSkillIds = currentSkillsLinked.map((s: any) => s.id);

    // Populate Traits
    const empTraitsEl = $('emp-traits'); // Display div
    // f.Traits will be an array of { id: 'recXYZ', name: 'Trait Name' } if it's a linked record lookup
    const currentTraitsLinked = Array.isArray(f.Traits) ? f.Traits : [];
    if (empTraitsEl) {
        empTraitsEl.innerHTML = currentTraitsLinked
            .filter((trait: any) => trait.name && trait.name.trim() !== '')
            .map((trait: any) => `<p class="text-gray-700">${trait.name}</p>`).join('');
    }
    // For modal pre-population, we need the IDs of current traits
    const currentTraitIds = currentTraitsLinked.map((t: any) => t.id);

    // --- Modal Functionality ---
    // Client Experience Modal (remains largely the same, but using currentClientExp for prepopulation)
    const editClientExpBtn = $('editClientExpBtn');
    const clientExpModal = $('clientExpModal');
    const clientExpInput = $('clientExpInput') as HTMLTextAreaElement | null;
    const saveClientExpBtn = $('saveClientExpBtn');
    const cancelClientExpBtn = $('cancelClientExpBtn');

    if (editClientExpBtn && clientExpModal && clientExpInput && saveClientExpBtn && cancelClientExpBtn && clientExpEl) {
        editClientExpBtn.addEventListener('click', () => {
            clientExpInput.value = currentClientExp; // Populate with current data
            clientExpModal.classList.remove('hidden');
        });

        cancelClientExpBtn.addEventListener('click', () => {
            clientExpModal.classList.add('hidden');
        });

        saveClientExpBtn.addEventListener('click', async () => {
            const newClientExp = clientExpInput.value;
            try {
                await updateEmployeeRecord(recordId, { 'Client Experience': newClientExp });
                // Update display after successful save
                clientExpEl.innerHTML = newClientExp.split('\n')
                    .filter((exp: string) => exp.trim() !== '')
                    .map((exp: string) => `<p class="mb-2 text-gray-700">${exp}</p>`).join('');
                clientExpModal.classList.add('hidden');
            } catch (error) {
                console.error('Error updating client experience:', error);
                alert('Failed to save client experience. Please try again.');
            }
        });
    } else if (editClientExpBtn) {
        console.warn("Client Experience modal elements not fully found. Edit button for client experience might not work. Check profile.html for #clientExpModal, #clientExpInput, #saveClientExpBtn, #cancelClientExpBtn.");
    }


    // Skills Modal
    const editSkillsBtn = $('editSkillsBtn');
    const skillsModal = $('skillsModal');
    const skillsOptionsContainer = $('skillsOptions') as HTMLDivElement | null; // New container for checkboxes
    const saveSkillsBtn = $('saveSkillsBtn') as HTMLButtonElement | null;
    const cancelSkillsBtn = $('cancelSkillsBtn') as HTMLButtonElement | null;

    if (editSkillsBtn && skillsModal && skillsOptionsContainer && saveSkillsBtn && cancelSkillsBtn && empSkillsEl) {
        editSkillsBtn.addEventListener('click', () => {
            // Populate skills checkboxes
            if (skillsOptionsContainer) {
                skillsOptionsContainer.innerHTML = allSkills.map(skill => `
                    <div class="flex items-center">
                        <input id="skill-${skill.id}" type="checkbox" value="${skill.id}" class="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded" ${currentSkillIds.includes(skill.id) ? 'checked' : ''}>
                        <label for="skill-${skill.id}" class="ml-2 block text-sm text-gray-900">${skill.name}</label>
                    </div>
                `).join('');
            }
            skillsModal.classList.remove('hidden');
        });

        cancelSkillsBtn.addEventListener('click', () => {
            skillsModal.classList.add('hidden');
        });

        saveSkillsBtn.addEventListener('click', async () => {
            const selectedSkillIds: string[] = [];
            skillsOptionsContainer?.querySelectorAll('input[type="checkbox"]:checked').forEach(checkbox => {
                selectedSkillIds.push((checkbox as HTMLInputElement).value);
            });

            try {
                // Airtable expects an array of record IDs for linked record fields
                await updateEmployeeRecord(recordId, { 'Skills': selectedSkillIds });
                // Update display after successful save
                // Re-fetch employee data to get updated skill names for display
                const updatedEmp = await getJSON(`https://api.airtable.com/v0/${BASE_ID}/${encodeURIComponent(EMP_TABLE)}/${recordId}`);
                const updatedSkillsLinked = Array.isArray(updatedEmp.fields.Skills) ? updatedEmp.fields.Skills : [];
                empSkillsEl.innerHTML = updatedSkillsLinked
                    .filter((skill: any) => skill.name && skill.name.trim() !== '')
                    .map((skill: any) =>
                        `<span class="px-2 py-1 bg-indigo-50 text-indigo-700 rounded-full text-sm font-medium">${skill.name}</span>`
                    ).join('');
                skillsModal.classList.add('hidden');
            } catch (error) {
                console.error('Error updating skills:', error);
                alert('Failed to save skills. Please try again.');
            }
        });
    } else if (editSkillsBtn) {
        console.warn("Skills modal elements not fully found. Edit button for skills might not work. Check profile.html for #skillsModal, #skillsOptions, #saveSkillsBtn, #cancelSkillsBtn.");
    }

    // Traits Modal
    const editTraitsBtn = $('editTraitsBtn');
    const traitsModal = $('traitsModal');
    const traitsOptionsContainer = $('traitsOptions') as HTMLDivElement | null; // New container for checkboxes
    const saveTraitsBtn = $('saveTraitsBtn') as HTMLButtonElement | null;
    const cancelTraitsBtn = $('cancelTraitsBtn') as HTMLButtonElement | null;

    if (editTraitsBtn && traitsModal && traitsOptionsContainer && saveTraitsBtn && cancelTraitsBtn && empTraitsEl) {
        editTraitsBtn.addEventListener('click', () => {
            // Populate traits checkboxes
            if (traitsOptionsContainer) {
                traitsOptionsContainer.innerHTML = allTraits.map(trait => `
                    <div class="flex items-center">
                        <input id="trait-${trait.id}" type="checkbox" value="${trait.id}" class="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded" ${currentTraitIds.includes(trait.id) ? 'checked' : ''}>
                        <label for="trait-${trait.id}" class="ml-2 block text-sm text-gray-900">${trait.name}</label>
                    </div>
                `).join('');
            }
            traitsModal.classList.remove('hidden');
        });

        cancelTraitsBtn.addEventListener('click', () => {
            traitsModal.classList.add('hidden');
        });

        saveTraitsBtn.addEventListener('click', async () => {
            const selectedTraitIds: string[] = [];
            traitsOptionsContainer?.querySelectorAll('input[type="checkbox"]:checked').forEach(checkbox => {
                selectedTraitIds.push((checkbox as HTMLInputElement).value);
            });

            try {
                // Airtable expects an array of record IDs for linked record fields
                await updateEmployeeRecord(recordId, { 'Traits': selectedTraitIds });
                // Update display after successful save
                // Re-fetch employee data to get updated trait names for display
                const updatedEmp = await getJSON(`https://api.airtable.com/v0/${BASE_ID}/${encodeURIComponent(EMP_TABLE)}/${recordId}`);
                const updatedTraitsLinked = Array.isArray(updatedEmp.fields.Traits) ? updatedEmp.fields.Traits : [];
                empTraitsEl.innerHTML = updatedTraitsLinked
                    .filter((trait: any) => trait.name && trait.name.trim() !== '')
                    .map((trait: any) => `<p class="text-gray-700">${trait.name}</p>`).join('');
                traitsModal.classList.add('hidden');
            } catch (error) {
                console.error('Error updating traits:', error);
                alert('Failed to save traits. Please try again.');
            }
        });
    } else if (editTraitsBtn) {
        console.warn("Traits modal elements not fully found. Edit button for traits might not work. Check profile.html for #traitsModal, #traitsOptions, #saveTraitsBtn, #cancelTraitsBtn.");
    }

  } catch (error) {
    console.error("Error loading employee profile data:", error);
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
