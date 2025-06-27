// src/profile.ts – robust binding (no optional chaining), waits for DOMContentLoaded
console.log('profile.ts script parsing started...');
const $ = (id: string) => document.getElementById(id) as HTMLElement | null;

// 1️⃣ Env vars (Vite)
export const BASE_ID = (import.meta.env.VITE_AIRTABLE_BASE_ID ?? '').trim();
export const TOKEN   = (import.meta.env.VITE_AIRTABLE_PAT ?? '').trim();
if (!BASE_ID || !TOKEN) throw new Error('Missing Airtable env vars');

// 2️⃣ Tables
const EMP_TABLE   = 'Employee Database';
const SKILL_TABLE = 'Skills'; // Master Skills table
const TRAIT_TABLE = 'Traits'; // Master Traits table
const LEVEL_TABLE = 'Levels'; // Master Levels table (e.g., Basic, Average, Good, Excellent)
const SKILL_LEVELS_TABLE = 'Skill Levels'; // Linking table for Employee-Skill-Level
const WORK_EXPERIENCE_TABLE = 'Work Experience'; // Table name for work experience records

// 3️⃣ Helpers
const authHeaders = { Authorization: `Bearer ${TOKEN}` };
const jsonHeaders = { ...authHeaders, 'Content-Type': 'application/json' };

// Helper function for fetching from Airtable with consistent error handling
async function fetchAirtable(tableName: string, method: 'GET' | 'POST' | 'PATCH' | 'DELETE', data?: any, recordId?: string) {
    let url = `https://api.airtable.com/v0/${BASE_ID}/${encodeURIComponent(tableName)}${recordId ? `/${recordId}` : ''}`;
    const options: any = { method, headers: jsonHeaders };
    if (data) options.body = JSON.stringify(data);

    const response = await fetch(url, options);

    if (!response.ok) {
        const errorData = await response.json();
        console.error(`Airtable API error (${method} ${url}):`, response.status, errorData);
        throw new Error(`Airtable API error: ${response.status} - ${JSON.stringify(errorData)}`);
    }

    return await response.json();
}

// Helper for batch creation
async function createAirtableRecords(tableName: string, records: any[]) {
    const airtableApiUrl = `https://api.airtable.com/v0/${BASE_ID}/${encodeURIComponent(tableName)}`;
    const CHUNK_SIZE = 10;
    let createdRecords: any[] = [];

    for (let i = 0; i < records.length; i += CHUNK_SIZE) {
        const chunk = records.slice(i, i + CHUNK_SIZE);
        const response = await fetch(airtableApiUrl, {
            method: 'POST',
            headers: jsonHeaders,
            body: JSON.stringify({ records: chunk })
        });
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`Failed to create records in ${tableName}: ${response.status} - ${JSON.stringify(errorData)}`);
        }
        const data = await response.json();
        createdRecords = createdRecords.concat(data.records);
    }
    return createdRecords;
}

// Helper for batch update
async function updateAirtableRecords(tableName: string, records: any[]) {
    const airtableApiUrl = `https://api.airtable.com/v0/${BASE_ID}/${encodeURIComponent(tableName)}`;
    const CHUNK_SIZE = 10;
    let updatedRecords: any[] = [];

    for (let i = 0; i < records.length; i += CHUNK_SIZE) {
        const chunk = records.slice(i, i + CHUNK_SIZE);
        const response = await fetch(airtableApiUrl, {
            method: 'PATCH',
            headers: jsonHeaders,
            body: JSON.stringify({ records: chunk })
        });
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`Failed to update records in ${tableName}: ${response.status} - ${JSON.stringify(errorData)}`);
        }
        const data = await response.json();
        updatedRecords = updatedRecords.concat(data.records);
    }
    return updatedRecords;
}

// Helper for batch delete
async function deleteAirtableRecords(tableName: string, recordIds: string[]) {
    const airtableApiUrl = `https://api.airtable.com/v0/${BASE_ID}/${encodeURIComponent(tableName)}`;
    const CHUNK_SIZE = 10;
    let deletedIds: string[] = [];

    for (let i = 0; i < recordIds.length; i += CHUNK_SIZE) {
        const chunk = recordIds.slice(i, i + CHUNK_SIZE);
        const queryParams = chunk.map(id => `records[]=${id}`).join('&');
        const response = await fetch(`${airtableApiUrl}?${queryParams}`, {
            method: 'DELETE',
            headers: authHeaders
        });
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`Failed to delete records from ${tableName}: ${response.status} - ${JSON.stringify(errorData)}`);
        }
        const data = await response.json();
        deletedIds = deletedIds.concat(data.records.map((r: any) => r.id));
    }
    return deletedIds;
}

// Helper function to perform combined Airtable operations (create, update, delete)
async function performAirtableOperations(tableName: string, toCreate: any[], toUpdate: any[], toDelete: string[]) {
    const created = toCreate.length ? await createAirtableRecords(tableName, toCreate) : [];
    const updated = toUpdate.length ? await updateAirtableRecords(tableName, toUpdate) : [];
    const deleted = toDelete.length ? await deleteAirtableRecords(tableName, toDelete) : [];
    return { created, updated, deleted };
}


function fmt(d?: string) {
  return d ? new Date(d).toLocaleDateString('en-ZA', { year: 'numeric', month: 'short' }) : '';
}

// Global variables to store master lists of skills and traits
let allSkills: { id: string; name: string }[] = [];
let allLevels: { id: string; name: string }[] = [];
let allTraits: { id: string; name: string }[] = [];

// Global variable to store the employee's current skill levels (from Skill Levels table)
let employeeSkillLevels: { id: string; skillId: string; levelId: string; skillName: string; levelName: string }[] = [];


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

  // Fetch master lists of skills, levels, and traits once on load
  try {
    allSkills = (await fetchAirtable(SKILL_TABLE, 'GET')).records.map((r: any) => ({ id: r.id, name: r.fields['Skill Name'] || r.fields.Name }));
    allLevels = (await fetchAirtable(LEVEL_TABLE, 'GET')).records.map((r: any) => ({ id: r.id, name: r.fields.Name }));
    allTraits = (await fetchAirtable(TRAIT_TABLE, 'GET')).records.map((r: any) => ({ id: r.id, name: r.fields['Trait Name'] || r.fields.Name }));
  } catch (error) {
    console.error("Failed to fetch master data (Skills, Levels, Traits):", error);
    alert("Failed to load master data for skills, levels, or traits. Please check console for details.");
    return; // Stop execution if master data cannot be loaded
  }


  try {
    const emp = await fetchAirtable(EMP_TABLE, 'GET', undefined, recordId);
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
            const experiencePromises = workExpIds.map(id => fetchAirtable(WORK_EXPERIENCE_TABLE, 'GET', undefined, id));
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
    const empSkillsEl = $('emp-skills');
    // f['Employee Skill Levels'] will be an array of record IDs from Airtable, e.g., ['recABC', 'recDEF']
    const employeeSkillLevelIds = Array.isArray(f['Employee Skill Levels']) ? f['Employee Skill Levels'] : [];

    // Fetch the actual Skill Levels records to get the linked Skill and Level details
    if (employeeSkillLevelIds.length > 0) {
        const skillLevelPromises = employeeSkillLevelIds.map(id =>
            fetchAirtable(SKILL_LEVELS_TABLE, 'GET', undefined, id)
        );
        const skillLevelRecords = await Promise.all(skillLevelPromises);

        employeeSkillLevels = skillLevelRecords.map((r: any) => ({
            id: r.id,
            skillId: r.fields.Skill?.[0], // Linked record returns array of IDs
            levelId: r.fields.Level?.[0], // Linked record returns array of IDs
            skillName: allSkills.find(s => s.id === r.fields.Skill?.[0])?.name || 'Unknown Skill', // Lookup from master list
            levelName: allLevels.find(l => l.id === r.fields.Level?.[0])?.name || 'Unknown Level' // Lookup from master list
        }));

        if (empSkillsEl) {
            empSkillsEl.innerHTML = employeeSkillLevels
                .map(sl =>
                    `<span class="px-2 py-1 bg-indigo-50 text-indigo-700 rounded-full text-sm font-medium">${sl.skillName} (${sl.levelName})</span>`
                ).join('');
        }
    } else if (empSkillsEl) {
        empSkillsEl.innerHTML = `<p class="text-gray-500">No skills listed.</p>`;
    }


    // Populate Traits
    const empTraitsEl = $('emp-traits'); // Display div
    // f['Personality Traits'] is an array of record IDs from Airtable
    let currentTraitIds = Array.isArray(f['Personality Traits']) ? f['Personality Traits'] : []; // Use 'Personality Traits'
    if (empTraitsEl) {
        // Find the full trait objects from our master list to get their names for display
        const traitsToDisplay = allTraits.filter(trait => currentTraitIds.includes(trait.id));
        empTraitsEl.innerHTML = traitsToDisplay
            .map(trait => `<p class="text-gray-700">${trait.name}</p>`).join('');
    }

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
            // Populate skills checkboxes with associated level radio buttons
            if (skillsOptionsContainer) {
                skillsOptionsContainer.innerHTML = allSkills.map(skill => {
                    const currentLevel = employeeSkillLevels.find(esl => esl.skillId === skill.id)?.levelId;
                    const levelRadios = allLevels.map(level => `
                        <div class="flex items-center mr-4">
                            <input id="skill-${skill.id}-level-${level.id}" name="skill-${skill.id}-level" type="radio" value="${level.id}" class="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300" ${currentLevel === level.id ? 'checked' : ''}>
                            <label for="skill-${skill.id}-level-${level.id}" class="ml-1 text-sm text-gray-700">${level.name}</label>
                        </div>
                    `).join('');

                    return `
                        <div class="border-b border-gray-200 py-2 last:border-b-0">
                            <div class="flex items-center mb-2">
                                <input id="skill-${skill.id}" type="checkbox" value="${skill.id}" class="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded" ${currentLevel ? 'checked' : ''}>
                                <label for="skill-${skill.id}" class="ml-2 block text-base font-medium text-gray-900">${skill.name}</label>
                            </div>
                            <div class="flex flex-wrap ml-6">
                                ${levelRadios}
                            </div>
                        </div>
                    `;
                }).join('');
            }
            skillsModal.classList.remove('hidden');
        });

        cancelSkillsBtn.addEventListener('click', () => {
            skillsModal.classList.add('hidden');
        });

        saveSkillsBtn.addEventListener('click', async () => {
            const selectedSkillLevelPairs: { skillId: string; levelId: string }[] = [];
            skillsOptionsContainer?.querySelectorAll('input[type="checkbox"]:checked').forEach(checkbox => {
                const skillId = (checkbox as HTMLInputElement).value;
                const selectedLevelRadio = skillsOptionsContainer.querySelector(`input[name="skill-${skillId}-level"]:checked`) as HTMLInputElement | null;
                if (selectedLevelRadio) {
                    selectedSkillLevelPairs.push({ skillId: skillId, levelId: selectedLevelRadio.value });
                }
            });

            try {
                // 1. Get existing Skill Levels for this employee
                const existingSkillLevelRecords = employeeSkillLevels; // Use the global variable populated on load

                // 2. Determine records to delete, update, and create
                const recordsToDelete: string[] = [];
                const recordsToCreate: { fields: { [key: string]: any } }[] = [];
                const recordsToUpdate: { id: string; fields: { [key: string]: any } }[] = [];

                // Identify deletions and updates
                existingSkillLevelRecords.forEach(existing => {
                    const newSelection = selectedSkillLevelPairs.find(s => s.skillId === existing.skillId);
                    if (!newSelection) {
                        // Skill was deselected, mark for deletion
                        recordsToDelete.push(existing.id);
                    } else if (newSelection.levelId !== existing.levelId) {
                        // Skill is still selected but level changed, mark for update
                        recordsToUpdate.push({
                            id: existing.id,
                            fields: {
                                'Level': [newSelection.levelId]
                            }
                        });
                    }
                });

                // Identify creations
                selectedSkillLevelPairs.forEach(newSelection => {
                    const existing = existingSkillLevelRecords.find(esl => esl.skillId === newSelection.skillId);
                    if (!existing) {
                        // New skill selected, mark for creation
                        recordsToCreate.push({
                            fields: {
                                'Employee': [recordId],
                                'Skill': [newSelection.skillId],
                                'Level': [newSelection.levelId]
                            }
                        });
                    }
                });

                // 3. Perform batch operations
                const { created: createdSkillLevels } = await performAirtableOperations(SKILL_LEVELS_TABLE, recordsToCreate, recordsToUpdate, recordsToDelete);
                
                // 4. Update the Employee Database record's 'Employee Skill Levels' field
                // This field should contain an array of all current Skill Levels record IDs for this employee
                const allCurrentSkillLevelIds = [
                    ...existingSkillLevelRecords.filter(esl => !recordsToDelete.includes(esl.id)).map(esl => esl.id),
                    ...createdSkillLevels.map((r: any) => r.id)
                ];

                await updateEmployeeRecord(recordId, { 'Employee Skill Levels': allCurrentSkillLevelIds });

                // 5. Re-fetch employee data to update the display and global employeeSkillLevels
                const updatedEmp = await fetchAirtable(EMP_TABLE, 'GET', undefined, recordId);
                const updatedEmployeeSkillLevelIds = Array.isArray(updatedEmp.fields['Employee Skill Levels']) ? updatedEmp.fields['Employee Skill Levels'] : [];

                // Re-populate employeeSkillLevels global variable for next modal open
                if (updatedEmployeeSkillLevelIds.length > 0) {
                    const updatedSkillLevelPromises = updatedEmployeeSkillLevelIds.map(id =>
                        fetchAirtable(SKILL_LEVELS_TABLE, 'GET', undefined, id)
                    );
                    const updatedSkillLevelRecords = await Promise.all(updatedSkillLevelPromises);

                    employeeSkillLevels = updatedSkillLevelRecords.map((r: any) => ({
                        id: r.id,
                        skillId: r.fields.Skill?.[0],
                        levelId: r.fields.Level?.[0],
                        skillName: allSkills.find(s => s.id === r.fields.Skill?.[0])?.name || 'Unknown Skill',
                        levelName: allLevels.find(l => l.id === r.fields.Level?.[0])?.name || 'Unknown Level'
                    }));
                } else {
                    employeeSkillLevels = [];
                }

                // Update display after successful save
                if (empSkillsEl) {
                    empSkillsEl.innerHTML = employeeSkillLevels
                        .map(sl =>
                            `<span class="px-2 py-1 bg-indigo-50 text-indigo-700 rounded-full text-sm font-medium">${sl.skillName} (${sl.levelName})</span>`
                        ).join('');
                }

                skillsModal.classList.add('hidden');
                alert('Skills updated successfully!');
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
                await updateEmployeeRecord(recordId, { 'Personality Traits': selectedTraitIds });
                console.log("Successfully updated Traits in Airtable with IDs:", selectedTraitIds);
                // Update the display with the new traits from our master list
                const updatedTraitsForDisplay = allTraits.filter(trait => selectedTraitIds.includes(trait.id));
                empTraitsEl.innerHTML = updatedTraitsForDisplay
                    .map(trait => `<p class="text-gray-700">${trait.name}</p>`).join('');

                // Update the state for the next time the modal opens
                currentTraitIds = selectedTraitIds;

                traitsModal.classList.add('hidden');
            } catch (error: any) {
                console.error('Error updating traits:', error);
                alert(`Failed to save traits. Please try again. Details: ${error.message}`);
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
