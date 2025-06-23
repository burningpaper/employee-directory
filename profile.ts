// /Users/jarred/employee-directory/profile.ts

document.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const employeeId = urlParams.get('id'); // Assuming ID is passed as ?id=recXYZ

    if (!employeeId) {
        document.getElementById('employee-profile')!.innerHTML = '<p>Employee ID not found in URL.</p>';
        return;
    }

    fetchEmployeeProfile(employeeId);
});

async function fetchEmployeeProfile(id: string) {
    try {
        const response = await fetch(`/api/get-employee-profile?id=${id}`);
        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to fetch employee profile');
        }

        renderEmployeeProfile(data.employee);

    } catch (error: any) { // Using 'any' for error type for simplicity, consider more specific typing
        console.error('Error fetching employee profile:', error);
        document.getElementById('employee-profile')!.innerHTML = `<p>Error loading profile: ${error.message}</p>`;
    }
}

function renderEmployeeProfile(employee: { [key: string]: any }) { // Using index signature for employee object
    const profileContainer = document.getElementById('employee-profile');
    if (!profileContainer) return;

    // Example: Displaying basic info
    profileContainer.innerHTML = `
        <h1>${employee['Name'] || 'Employee Profile'}</h1>
        <p><strong>Email:</strong> ${employee['Email'] || 'N/A'}</p>
        <p><strong>Role:</strong> ${employee['Role'] || 'N/A'}</p>
        <hr>
        <h2>Work Experience</h2>
        <div id="work-experience-list"></div>
        <hr>
        <h2>Client Experience</h2>
        <p>${employee['Client Experience'] || 'No client experience listed.'}</p>
        <hr>
        <h2>Skills</h2>
        <p>${employee['Skills'] || 'No skills listed.'}</p>
        <hr>
        <h2>Traits</h2>
        <p>${employee['Traits'] || 'No traits listed.'}</p>
    `;

    // For linked records like Work Experience, you might need to fetch them separately
    // or ensure your Airtable API call in get-employee-profile.js expands them.
    // For now, this assumes 'Work Experience' is a simple text field or a linked record ID.
    // If 'Work Experience' is a linked record, you'd typically fetch those records too.
    // For simplicity, I'm assuming 'Work Experience' might be a multi-select or text field here.
    // If it's a linked record, you'd need to adjust the API to expand it or make another fetch.
    const workExperienceList = document.getElementById('work-experience-list');
    if (workExperienceList && employee['Work Experience'] && Array.isArray(employee['Work Experience'])) {
        workExperienceList.innerHTML = employee['Work Experience'].map((exp: string) => `<p>${exp}</p>`).join('');
    } else if (workExperienceList && employee['Work Experience']) {
        workExperienceList.innerHTML = `<p>${employee['Work Experience']}</p>`;
    }
}