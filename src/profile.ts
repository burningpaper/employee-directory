// src/profile.ts – Full version with LinkedIn image processing and Airtable integration
const $ = (sel: string) => document.querySelector(sel);
// Refined 'el' function for better type safety.
// It now returns HTMLElement | null, and specific usages should cast if necessary.
const el = (id: string): HTMLElement | null => document.getElementById(id);

const BASE_ID = import.meta.env.VITE_AIRTABLE_BASE_ID.trim();
const TOKEN = import.meta.env.VITE_AIRTABLE_PAT.trim();
const OPENAI_KEY = import.meta.env.VITE_OPENAI_KEY?.trim(); // Get OpenAI Key


const HEADERS = {
  Authorization: `Bearer ${TOKEN}`,
  'Content-Type': 'application/json'
};
const api = (tbl: string, q = '') => `https://api.airtable.com/v0/${BASE_ID}/${encodeURIComponent(tbl)}${q}`;
const get = async (u: string) => {
  console.log('Attempting to GET URL:', u); // <--- ADD THIS LINE
  const r = await fetch(u, { headers: HEADERS, cache: 'no-store' }); // Added cache: 'no-store'
  if (!r.ok) throw new Error(`Airtable API Error: ${r.status} ${await r.text()}`);
  return r.json();
};
const post = (t: string, b: any) => fetch(api(t), { method: 'POST', headers: HEADERS, body: JSON.stringify(b) }).then(r => r.json());
const patch = (t: string, b: any) => fetch(api(t), { method: 'PATCH', headers: HEADERS, body: JSON.stringify(b) }).then(r => r.json());

async function createRecordsInBatches(tableName: string, records: Array<{ fields: any }>): Promise<any[]> {
  if (records.length === 0) return [];
  const allCreatedRecords: any[] = [];
  for (let i = 0; i < records.length; i += 10) {
    const chunk = records.slice(i, i + 10);
    console.log(`Attempting to POST to ${tableName}, batch ${Math.floor(i/10) + 1}, ${chunk.length} records`);
    const response = await post(tableName, { records: chunk });
    // Assuming response.records contains the array of created records from Airtable
    if (response.records && Array.isArray(response.records)) {
        allCreatedRecords.push(...response.records);
    } else if (response.error) {
        console.error(`Error creating records in batch for ${tableName}:`, response.error);
        throw new Error(`Airtable API Error (Batch Create): ${response.error.type} - ${response.error.message}`);
    } else {
        console.warn(`Unexpected response format during batch create for ${tableName}:`, response);
        // If individual records in the response have IDs, try to collect them
        if(Array.isArray(response)) allCreatedRecords.push(...response.filter(r => r.id));
    }
  }
  return allCreatedRecords;
}

async function deleteRecordsInBatches(tableName: string, recordIds: string[]): Promise<void> {
  if (recordIds.length === 0) return;
  for (let i = 0; i < recordIds.length; i += 10) {
    const chunk = recordIds.slice(i, i + 10);
    const queryParams = chunk.map(id => `records[]=${encodeURIComponent(id)}`).join('&');
    const url = api(tableName, `?${queryParams}`);
    console.log('Attempting to DELETE URL:', url);
    const r = await fetch(url, { method: 'DELETE', headers: HEADERS });
    if (!r.ok) throw new Error(`Airtable API Error (Batch DELETE): ${r.status} ${await r.text()}`);
    // Delete typically returns { records: [ { id: "...", deleted: true } ] } or similar
    console.log(`Batch delete response for ${tableName}:`, await r.json());
  }
}

const EMP_TABLE = 'Employee Database';
const SKILL_TABLE = 'Skills';
const TRAIT_TABLE = 'Traits';
const EXP_TABLE = 'Work Experience';
const SKILL_LEVELS_TABLE = 'Skill Levels'; // <-- New table for skill proficiency
const CLIENT_TABLE = 'Client Experience';

function showModal(html: string) {
  el('modalContent').innerHTML = html;
  el('modal')?.classList.remove('hidden');
}
function closeModal() {
  el('modal')?.classList.add('hidden');
  el('modalContent')!.innerHTML = ''; // Assuming modalContent always exists when this is called
}
el('modal')?.addEventListener('click', e => {
  if ((e.target as HTMLElement).id === 'modal') closeModal();
});

window.addEventListener('DOMContentLoaded', async () => {
  const recordId = new URLSearchParams(window.location.search).get('id');

  if (!recordId) {
    console.error("Employee ID not found in URL.");
    // Optionally, display an error message to the user in the UI
    const profileNameEl = el('emp-name');
    if (profileNameEl) profileNameEl.textContent = "Employee not found.";
    return;
  }

  try {
    const emp = await get(api(EMP_TABLE, '/' + recordId));
    const f = emp.fields;

    // IDs from profile.html
    el('emp-name')!.textContent = f['Employee Name'] || f['Full Name'] || ''; // Adjusted to check common field names
    el('emp-title')!.textContent = f['Job Title'] || f['Title'] || '';
    // Define readableEmployeeCode once, as it's used by multiple sections
    // Ensure 'Employee Code' is the correct field name from your 'Employee Database' table
    // that holds the human-readable employee code (e.g., _2CIN001).
    const readableEmployeeCode = f['Employee Code'];
    // el('profileLocation').textContent = f['Location'] || ''; // No direct match in profile.html, emp-meta is used
    el('emp-meta')!.textContent = `${f.Department || ''}${f.Location ? ' • ' + f.Location : ''}`;
    el('emp-bio')!.textContent = f['Bio'] || f['Profile Blurb'] || '';
    if (f['Profile Photo']?.[0]?.url) (el('emp-photo') as HTMLImageElement).src = f['Profile Photo'][0].url;

    // --- Display Skills with Levels ---
    // 1. Fetch all skills to create a Skill ID -> Skill Name map
    const allSkillsResponse = await get(api(SKILL_TABLE, '?fields%5B%5D=Skill%20Name&pageSize=100')); // Adjust pageSize if you have >100 skills
    const skillsMap = new Map<string, string>();
    allSkillsResponse.records.forEach((skillRecord: any) => {
      if (skillRecord.fields['Skill Name']) {
        skillsMap.set(skillRecord.id, skillRecord.fields['Skill Name']);
      }
    });

    // 2. Fetch Skill Level entries for the current employee
    // Assumes 'Skill Levels' table has a field named 'Employee' linking to 'Employee Database'
    // and a field 'Skill' linking to 'Skills' table, and a field 'Level' for proficiency.
    // The field in 'Skill Levels' linking to 'Employee Database' is assumed to be 'Employee Code'
    // based on previous fixes. We should search using readableEmployeeCode.
    console.log(`DIAGNOSTIC: readableEmployeeCode for Skill Levels query: '${readableEmployeeCode}'`);

    let employeeSkillLevelsResponse = { records: [] };
    if (readableEmployeeCode) {
      const skillLevelsQuery = `?filterByFormula=SEARCH('${readableEmployeeCode}', ARRAYJOIN({Employee Code}))`;
    // You might want to add sorting here, e.g., &sort[0][field]=LookupSkillName&sort[0][direction]=asc
    // if you have a lookup field for Skill Name in the 'Skill Levels' table.
      employeeSkillLevelsResponse = await get(api(SKILL_LEVELS_TABLE, skillLevelsQuery));
    } else {
      console.warn(`Readable employee code not found for employee ${recordId}. Cannot filter skill levels.`);
    }

    const skillsContainer = el('emp-skills');
    if (skillsContainer) skillsContainer.innerHTML = ''; // Clear current content


    const displayedSkillElements: string[] = [];
    if (employeeSkillLevelsResponse?.records?.length > 0) {
      for (const slRecord of employeeSkillLevelsResponse.records) {
        const fields = slRecord.fields;
        // Ensure 'Skill' is the correct field name in 'Skill Levels' linking to the 'Skills' table
        const skillLinkArray = fields['Skill'] as string[]; // Expecting an array of Skill record IDs
        // Ensure 'Level' is the correct field name in 'Skill Levels' for the proficiency
        const level = fields['Level'] as string;

        if (skillLinkArray && skillLinkArray.length > 0 && level) {
          const skillId = skillLinkArray[0];
          const skillName = skillsMap.get(skillId);
          if (skillName) {
            displayedSkillElements.push(`<span class="px-2 py-1 bg-indigo-50 text-indigo-700 rounded-full text-sm">${skillName} (${level})</span>`);
          }
        }
      }
    }

    if (skillsContainer) {
      if (displayedSkillElements.length > 0) {
        // Sort skills alphabetically before displaying
        displayedSkillElements.sort((a, b) => a.localeCompare(b));
        skillsContainer.innerHTML = displayedSkillElements.join(' ');
      } else {
        skillsContainer.textContent = 'No skills listed.';
      }
    }
    // --- End Display Skills with Levels ---

    // --- Display Personality Traits ---
    // 1. Fetch all traits to create a Trait ID -> Trait Name map
    // This assumes your 'Traits' table has a field named 'Trait Name'.
    const allTraitsResponse = await get(api(TRAIT_TABLE, '?fields%5B%5D=Trait%20Name&pageSize=100&sort%5B0%5D%5Bfield%5D=Trait%20Name&sort%5B0%5D%5Bdirection%5D=asc')); // Adjust pageSize if you have >100 traits
    const traitsMap = new Map<string, string>();
    allTraitsResponse.records.forEach((traitRecord: any) => {
      if (traitRecord.fields['Trait Name']) {
        traitsMap.set(traitRecord.id, traitRecord.fields['Trait Name']);
      }
    });

    // 2. Get trait IDs from the employee record.
    // This assumes the field in 'Employee Database' linking to 'Traits' is 'Personality Traits'.
    const employeeTraitIDs = f['Personality Traits'] as string[] || [];

    const traitsList = el('emp-traits') as HTMLUListElement | null; // Assuming it's a UL based on comment
    if (traitsList) {
      traitsList.innerHTML = ''; // Clear existing content
      const displayedTraitNames: string[] = [];

      if (employeeTraitIDs.length > 0) {
        employeeTraitIDs.forEach((traitId: string) => {
          const traitName = traitsMap.get(traitId);
          if (traitName) {
            displayedTraitNames.push(traitName);
          }
        });
      }

      if (displayedTraitNames.length > 0) {
        // Names are already sorted from the API call, but if not, you could sort here: displayedTraitNames.sort();
        displayedTraitNames.forEach((name: string) => {
          traitsList.innerHTML += `<li class="text-sm text-gray-600">${name}</li>`;
        });
      } else {
        traitsList.innerHTML = '<li class="text-sm text-gray-600">None listed</li>';
      }
    }
    // --- End Display Personality Traits ---

    // Fetch Work Experience - Simplified filterByFormula
    // Assumes {Employee} in Work Experience table is the linked record field to Employee Database
    // ❗ IMPORTANT: Replace {ActualLinkFieldName} with the real name of the field in your 'Work Experience' table that links to the 'Employee Database' table.
    // Example: If your linking field is named "Employee Link", use {Employee Link}

    // --- DIAGNOSTIC: Fetch a few Work Experience records to inspect 'Employee Code' links ---
    console.log("DIAGNOSTIC: Fetching first 5 Work Experience records to inspect 'Employee Code' links...");
    const allWorkExpDiagnosticQuery = `?maxRecords=5`; // Fetches first 5 records from the default view
    try {
      const allExpData = await get(api(EXP_TABLE, allWorkExpDiagnosticQuery));
      console.log('DIAGNOSTIC: Raw Work Experience Data (first 5 records):', JSON.parse(JSON.stringify(allExpData.records))); // Deep copy for logging
      allExpData.records.forEach((expRecord: any, index: number) => {
        console.log(`DIAGNOSTIC: Record ${index + 1} (ID: ${expRecord.id}):`);
        if (expRecord.fields['Employee Code'] && Array.isArray(expRecord.fields['Employee Code'])) {
          console.log(`  Linked 'Employee Code' IDs:`, expRecord.fields['Employee Code']);
        } else {
          console.log(`  'Employee Code' field is empty, not present, or not an array.`);
        }
      });
    } catch (diagError) {
      console.error("DIAGNOSTIC: Error fetching all work experience:", diagError);
    }
    // --- END DIAGNOSTIC ---


    let exp = { records: [] }; // Default to empty records

    if (readableEmployeeCode) {
      console.log(`Fetching work experience for readableEmployeeCode: '${readableEmployeeCode}' (from recordId: '${recordId}')`);
      // Filter by searching for the readableEmployeeCode within the ARRAYJOIN'ed primary field values of linked Employee Code records
      const workExpQuery = `?filterByFormula=SEARCH('${readableEmployeeCode}', ARRAYJOIN({Employee Code}))`;
      exp = await get(api(EXP_TABLE, workExpQuery));
    } else {
      console.warn(`Readable employee code not found for employee ${recordId}. Cannot filter work experience by it.`);
    }

    console.log('Work Experience API Response (filtered):', exp);
    const expList = el('emp-experience');
    if (expList) expList.innerHTML = '';
    for (const e of exp.records) {
      const d = e.fields;
      const from = d['Start Date']?.split('T')[0] || '';
      const to = d['End Date']?.split('T')[0] || 'Present';
      const role = d['Role'] || 'Unknown'; // Changed to match LinkedIn import field name
      const co = d['Company'] || 'Unknown';
      const para = document.createElement('div');
      para.innerHTML = `<h4 class="font-medium text-gray-800">${role} at ${co}</h4><p class="text-xs text-gray-500">${from} – ${to}</p><p class="mt-1 text-sm text-gray-600">${d['Description']||''}</p>`;
      expList?.appendChild(para);
    }

    // Fetch and render Client Experience
    let clientExp = { records: [] };
    if (readableEmployeeCode) {
      console.log(`Fetching client experience for readableEmployeeCode: '${readableEmployeeCode}'`);
      // The linking field in 'Client Experience' table is 'Employee Database'
      // The Airtable error "Unknown field name: "Last Year"" means the field specified for sorting
      // doesn't match a field name in your 'Client Experience' table.
      // Please verify the correct field name in your Airtable base and update it below.
      const clientExpQuery = `?filterByFormula=SEARCH('${readableEmployeeCode}', ARRAYJOIN({Employee Database}))&sort[0][field]=Year Last Worked&sort[0][direction]=desc`;
      clientExp = await get(api(CLIENT_TABLE, clientExpQuery));
    } else {
      console.warn(`Readable employee code not found for employee ${recordId}. Cannot filter client experience.`);
    }

    console.log('Client Experience API Response (filtered):', clientExp);
    const clientListBody = el('emp-clients');
    if (clientListBody) clientListBody.innerHTML = ''; // Clear previous entries

    for (const ce of clientExp.records) {
      const d = ce.fields;
      const row = document.createElement('tr');
      row.innerHTML = `
        <td class="px-4 py-3 whitespace-nowrap">${d['Client Name'] || 'N/A'}</td>
        <td class="px-4 py-3 whitespace-nowrap">${d['Industry'] || 'N/A'}</td>
        <td class="px-4 py-3 whitespace-nowrap">${d['Years Experience'] || d['Years'] || 'N/A'}</td> 
        <td class="px-4 py-3 whitespace-nowrap">${d['Last Year'] || 'N/A'}</td>
      `;
      clientListBody?.appendChild(row);
    }

    // Add event listeners for edit buttons, passing the recordId
    // For openSkillsModal, we pass employee's recordId and readableEmployeeCode
    el('editSkillsBtn')?.addEventListener('click', () => openSkillsModal(recordId, readableEmployeeCode));
    const currentTraitIDs = f['Personality Traits'] || [];
    el('editTraitsBtn')?.addEventListener('click', () => openTraitsModal(currentTraitIDs, recordId));

  } catch (error) {
    console.error("Error loading profile data:", error);
    const profileNameEl = el('emp-name') ;
    if (profileNameEl) profileNameEl.textContent = "Error loading profile.";
  }
});

const SKILL_LEVEL_OPTIONS = ["", "Basic", "Average", "Good", "Excellent"]; // "" for "None"

async function openSkillsModal(employeeRecordId: string, readableEmployeeCode: string) {
  // 1. Fetch all available skills
  const allSkillsResponse = await get(api(SKILL_TABLE, '?pageSize=100&sort%5B0%5D%5Bfield%5D=Skill%20Name&sort%5B0%5D%5Bdirection%5D=asc'));
  const allSkills = allSkillsResponse.records;

  // 2. Fetch employee's current skill levels
  let currentEmployeeSkillLevels = [];
  const existingSkillLevelRecordsMap = new Map<string, { level: string, recordId: string }>(); // Maps Skill ID to its level and SkillLevel record ID

  if (readableEmployeeCode) {
    const skillLevelsQuery = `?filterByFormula=SEARCH('${readableEmployeeCode}', ARRAYJOIN({Employee Code}))`;
    const employeeSkillLevelsResponse = await get(api(SKILL_LEVELS_TABLE, skillLevelsQuery));
    currentEmployeeSkillLevels = employeeSkillLevelsResponse.records || [];

    currentEmployeeSkillLevels.forEach((sl: any) => {
      const skillId = sl.fields['Skill']?.[0]; // Assuming 'Skill' is a link and returns an array of IDs
      const level = sl.fields['Level'];
      if (skillId && level) {
        existingSkillLevelRecordsMap.set(skillId, { level, recordId: sl.id });
      }
    });
  }

  // 3. Build modal HTML
  let skillsHtml = '';
  allSkills.forEach((skill: any) => {
    const skillId = skill.id;
    const skillName = skill.fields['Skill Name'];
    const currentLevelData = existingSkillLevelRecordsMap.get(skillId);
    const currentLevelValue = currentLevelData ? currentLevelData.level : "";

    let levelOptionsHtml = SKILL_LEVEL_OPTIONS.map(levelOpt =>
      `<option value="${levelOpt}" ${levelOpt === currentLevelValue ? 'selected' : ''}>${levelOpt || '--- None ---'}</option>`
    ).join('');

    skillsHtml += `
      <div class="flex items-center justify-between py-2 border-b border-gray-200">
        <span class="text-sm text-gray-700">${skillName}</span>
        <select data-skill-id="${skillId}" class="skill-level-select border rounded px-2 py-1 text-sm">
          ${levelOptionsHtml}
        </select>
      </div>
    `;
  });

  showModal(
    `<h2 class="text-lg font-semibold mb-4">Edit Skills & Levels</h2>
     <div class="space-y-1 mb-6 max-h-96 overflow-y-auto">${skillsHtml}</div>
     <div class="flex justify-end gap-2">
       <button id="mCancel" class="px-3 py-1 bg-gray-200 rounded">Cancel</button>
       <button id="mSave" class="px-3 py-1 bg-indigo-600 text-white rounded">Save</button>
     </div>`
  );

  el('mCancel')!.onclick = closeModal;
  el('mSave')!.onclick = async () => {
    const skillLevelSelects = document.querySelectorAll('.skill-level-select');
    const recordsToCreate: Array<{ fields: any }> = [];
    skillLevelSelects.forEach(selectEl => { // NodeListOf<Element>
      const select = selectEl as HTMLSelectElement;
      const skillId = select.dataset.skillId;
      const level = select.value;
      if (skillId && level) { // Only add if a level (not "None") is selected
        recordsToCreate.push({
          fields: {
            "Skill": [skillId],
            "Level": level,
            "Employee Code": [employeeRecordId] // Link to the Employee Database record
          }
        });
      }
    });

    // Delete all existing skill level records for this employee
    const existingRecordIdsToDelete = Array.from(existingSkillLevelRecordsMap.values()).map(val => val.recordId);
    if (existingRecordIdsToDelete.length > 0) {
      await deleteRecordsInBatches(SKILL_LEVELS_TABLE, existingRecordIdsToDelete);
    }

    // Create new skill level records
    if (recordsToCreate.length > 0) {
      await createRecordsInBatches(SKILL_LEVELS_TABLE, recordsToCreate);
    }

    closeModal();
    location.reload();
  };
}

async function openTraitsModal(currentIDs: string[], recordId: string) {
  const { records } = await get(api(TRAIT_TABLE, '?pageSize=100&sort%5B0%5D%5Bfield%5D=Trait%20Name&sort%5B0%5D%5Bdirection%5D=asc'));
  // Records are already sorted by 'Trait Name' from the API query.
  // If not, you could sort here:
  // const rows = records.sort((a: any, b: any) => a.fields['Trait Name'].localeCompare(b.fields['Trait Name']));
  const rows = records; // Assuming API sort is sufficient
  const opts = rows.map((r: any) => `<label class="flex items-center gap-2"><input type="checkbox" value="${r.id}" ${currentIDs.includes(r.id) ? 'checked' : ''} class="traitChk">${r.fields['Trait Name']}</label>`).join('<br>');
  showModal(`<h2 class="text-lg font-semibold mb-4">Edit Personality Traits</h2><div class="space-y-2 mb-6 max-h-60 overflow-y-auto">${opts}</div><div class="flex justify-end gap-2"><button id="mCancel" class="px-3 py-1 bg-gray-200 rounded">Cancel</button><button id="mSave" class="px-3 py-1 bg-indigo-600 text-white rounded">Save</button></div>`);
  el('mCancel')!.onclick = closeModal;
  el('mSave')!.onclick = async () => {
    const newIDs = [...document.querySelectorAll('.traitChk:checked')].map((c: any) => c.value);
    await patch(EMP_TABLE, { records: [{ id: recordId, fields: { 'Personality Traits': newIDs } }] });
    closeModal();
    location.reload();
  };
}
el('processLinkedIn')?.addEventListener('click', async () => {
  if (!OPENAI_KEY) {
    console.error("OpenAI API Key (VITE_OPENAI_KEY) is not set in environment variables.");
    alert("OpenAI API Key is not configured. LinkedIn import feature is disabled.");
    el('linkedInOutput')!.textContent = "OpenAI API Key not configured.";
    return;
  }

  const fileInput = el('linkedinUpload') as HTMLInputElement | null;
  const file = fileInput?.files?.[0];
  const recordId = new URLSearchParams(window.location.search).get('id'); // Get recordId again or pass it if this function is called from a context where it's available
  if (!recordId) {
    alert('Employee ID not found. Cannot process LinkedIn data.');
    return;
  }

  if (!file) return alert('Upload a screenshot first.');
  const reader = new FileReader();

  const fileType = file.type; // Get the MIME type of the uploaded file
  reader.onload = async () => {
    const base64 = (reader.result as string).split(',')[1];
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENAI_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Extract work experience from this LinkedIn profile screenshot. Return JSON like: [{company, role, start, end, description}]' },
              { type: 'image_url', image_url: { url: `data:${fileType};base64,${base64}` } }
            ]
          }
        ]
      })
    });

    if (!res.ok) {
      const errorBody = await res.text();
      console.error('OpenAI API Error Details:', {
        status: res.status,
        statusText: res.statusText,
        body: errorBody,
      });
      let displayErrorMessage = `Error with OpenAI API: ${res.status} ${res.statusText}.`;
      try {
        const errorJson = JSON.parse(errorBody);
        if (errorJson.error && errorJson.error.message) {
          displayErrorMessage += ` OpenAI Message: ${errorJson.error.message}`;
        }
      } catch (e) {
        displayErrorMessage += ` See console for full error body.`;

      }
      el('linkedInOutput')!.textContent = displayErrorMessage;
      return;
    }

    const data = await res.json();
    const text = data.choices?.[0]?.message?.content || 'No result.';
    el('linkedInOutput')!.textContent = text;

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      console.warn('OpenAI returned unparseable text:', text);
      alert('Could not parse response from OpenAI. Check the raw result in the text area.');
      return;
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
