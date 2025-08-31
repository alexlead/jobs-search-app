document.addEventListener('DOMContentLoaded', async function () {
    await initDatabase();

    document.getElementById('options-btn').addEventListener('click', openOptionsPage);
    function openOptionsPage() {
        chrome.runtime.openOptionsPage();
    }


    document.getElementById('search-btn').addEventListener('click', searchJobs);
    document.getElementById('save-btn').addEventListener('click', addJob);

    document.getElementById('active-url-btn').addEventListener('click', fillLinkField);

    const fieldIds = ['company', 'jobPosition', 'link'];
    fieldIds.forEach(fieldId => {
        loadInputField(fieldId);
        document.getElementById(fieldId).addEventListener('input change', () => saveInputField(fieldId));
    });

    // Copy text from active tab
    let copyFields = ['jobPosition', 'company', 'search-input'];

    copyFields.forEach(fieldId => {
        const textField = document.getElementById(fieldId);
        const copyButton = document.getElementById(`${fieldId}-btn`);
        copyButton.addEventListener('click', async function () {
            copyButton.disabled = true;

            const selectedText = await getSelectedText();

            if (selectedText) {
                textField.value = selectedText;
                saveInputField(fieldId);
            }

            copyButton.disabled = false;

        });
    });

    copyFields.push('link');

    // Copy text from input field
    copyFields.forEach(fieldId => {
        const textField = document.getElementById(fieldId);
        const copyButton = document.getElementById(`${fieldId}-copy-btn`);     
        copyButton?.addEventListener('click', async function () {
            copyButton.disabled = true;
            if (textField.value) {
                try {
                    await navigator.clipboard.writeText(textField.value);   
                    console.log('Text copied to clipboard');
                } catch (err) {
                    console.error('Failed to copy text: ', err);
                } 
            }
            copyButton.disabled = false;
        });
    });

    document.getElementById('clear-btn').addEventListener('click', function () {
        if (confirm('Are you sure you want to clear all input fields?')) {
            fieldIds.forEach(fieldId => {
                document.getElementById(fieldId).value = '';
                localStorage.removeItem(fieldId);
            });
        }
    });

    // Tab state management

    const tabEl = document.querySelectorAll('button[data-bs-toggle="tab"]');

    tabEl.forEach(tab => {
        tab.addEventListener('shown.bs.tab', function (event) {

            localStorage.setItem('activeTab', event.target.getAttribute('data-bs-target'));
        });
    });
    const activeTab = localStorage.getItem('activeTab');
    if (activeTab) {
        const someTab = document.querySelector(`button[data-bs-target="${activeTab}"]`);
        if (someTab) {
            const tab = new bootstrap.Tab(someTab);
            tab.show();
        }
    }

});

async function initDatabase() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('JobTrackerDB', 1);

        request.onerror = event => {
            console.error('Database error:', event.target.error);
            reject(event.target.error);
        };

        request.onupgradeneeded = event => {
            const db = event.target.result;

            if (!db.objectStoreNames.contains('Status')) {
                const statusStore = db.createObjectStore('Status', { keyPath: 'ID' });
                const statusData = [
                    { ID: 1, Status: 'Sent Request' },
                    { ID: 2, Status: 'In Progress' },
                    { ID: 3, Status: 'Interview' },
                    { ID: 4, Status: 'Rejected' },
                    { ID: 5, Status: 'Success' }
                ];
                statusData.forEach(data => statusStore.add(data));
            }

            if (!db.objectStoreNames.contains('Jobs')) {
                const jobsStore = db.createObjectStore('Jobs', { keyPath: 'ID', autoIncrement: true });
                jobsStore.createIndex('CreateDate', 'CreateDate', { unique: false });
                jobsStore.createIndex('Company', 'Company', { unique: false });
                jobsStore.createIndex('Link', 'Link', { unique: false });
            }

            if (!db.objectStoreNames.contains('JobsMeta')) {
                const metaStore = db.createObjectStore('JobsMeta', { keyPath: 'ID', autoIncrement: true });
                metaStore.createIndex('JobId', 'JobId', { unique: false });
            }
        };

        request.onsuccess = event => {
            resolve(event.target.result);
        };
    });
}

async function searchJobs() {
    const searchTerm = document.getElementById('search-input').value.trim();
    const db = await getDatabase();
    const transaction = db.transaction(['Jobs', 'Status'], 'readonly');
    const jobsStore = transaction.objectStore('Jobs');
    const statusStore = transaction.objectStore('Status');

    let results = [];
    const request = jobsStore.openCursor();

    request.onsuccess = event => {
        const cursor = event.target.result;
        if (cursor) {
            const job = cursor.value;
            if (job.Company.toLowerCase().includes(searchTerm.toLowerCase()) ||
                job.Link.toLowerCase().includes(searchTerm.toLowerCase())) {
                results.push(job);
            }
            cursor.continue();
        } else {
            displayResults(results);
        }
    };
}

async function displayResults(jobs) {
    const db = await getDatabase();
    const statusStore = db.transaction('Status', 'readonly').objectStore('Status');
    const statusMap = new Map();

    const statusRequest = statusStore.openCursor();
    statusRequest.onsuccess = event => {
        const cursor = event.target.result;
        if (cursor) {
            statusMap.set(cursor.value.ID, cursor.value.Status);
            cursor.continue();
        } else {
            renderResultsTable(jobs, statusMap);
        }
    };
}

function renderResultsTable(jobs, statusMap) {
    const resultsDiv = document.getElementById('search-results');
    jobs.sort((a, b) => new Date(b.CreateDate) - new Date(a.CreateDate));
    jobs = jobs.slice(0, 10);

    let html = '<table><tr><th>Date</th><th>Company</th><th>Position</th><th>Status</th></tr>';

    jobs.forEach(job => {
        html += `
            <tr>
                <td>${new Date(job.CreateDate).toLocaleDateString()}</td>
                <td>${job.Company}</td>
                <td>${job.JobPosition}</td>
                <td>
                    <select class="status-select form-select" data-jobid="${job.ID}">
                        ${Array.from(statusMap.entries()).map(([id, status]) =>
            `<option value="${id}" ${job.Status === id ? 'selected' : ''}>${status}</option>`
        ).join('')}
                    </select>
                </td>
            </tr>
        `;
    });

    html += '</table>';
    resultsDiv.innerHTML = html;

    document.querySelectorAll('.status-select').forEach(select => {
        select.addEventListener('change', async function () {
            await updateJobStatus(this.dataset.jobid, parseInt(this.value));
        });
    });
}

async function updateJobStatus(jobId, statusId) {
    const db = await getDatabase();
    const transaction = db.transaction('Jobs', 'readwrite');
    const store = transaction.objectStore('Jobs');
    const request = store.get(parseInt(jobId));

    request.onsuccess = event => {
        const job = event.target.result;
        job.Status = statusId;
        store.put(job);
    };
}

async function addJob() {
    const company = document.getElementById('company').value.trim();
    const jobPosition = document.getElementById('jobPosition').value.trim();
    const link = document.getElementById('link').value.trim();

    if (!company || !jobPosition || !link) {
        alert('Please fill all fields');
        return;
    }

    const db = await getDatabase();
    const transaction = db.transaction('Jobs', 'readwrite');
    const store = transaction.objectStore('Jobs');

    const job = {
        CreateDate: new Date().toISOString(),
        Company: company,
        JobPosition: jobPosition,
        Link: link,
        Status: 1 // Default status
    };

    const request = store.add(job);

    request.onsuccess = () => {
        alert('Job added successfully!');
        document.getElementById('company').value = '';
        document.getElementById('jobPosition').value = '';
        document.getElementById('link').value = '';
        const activeTab = localStorage.getItem('activeTab');
        localStorage.clear();
        localStorage.setItem('activeTab', activeTab);
    };

    request.onerror = event => {
        console.error('Error adding job:', event.target.error);
        alert('Error adding job');
    };
}

function getDatabase() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('JobTrackerDB', 1);
        request.onsuccess = event => resolve(event.target.result);
        request.onerror = event => reject(event.target.error);
    });
}

/**
    Save InputFields current values to local storage
    @param {string} fieldId - The ID of the input field to save 
*/

function saveInputField(fieldId) {
    const value = document.getElementById(fieldId).value;
    localStorage.setItem(fieldId, value);
}

/**
    Load InputFields values from local storage
    @param {string} fieldId - The ID of the input field to load 
*/
function loadInputField(fieldId) {
    const value = localStorage.getItem(fieldId);
    if (value) {
        document.getElementById(fieldId).value = value;
    }
}


/***
    Get InputFields values from Selected Tab
*/

function getActiveTabUrl() {
    return new Promise((resolve, reject) => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs && tabs[0]) {
                console.log('Active Tab URL:', tabs[0]);
                resolve(tabs[0].url);
            } else {
                reject(new Error('Couldn\'t get Tab URL'));
            }
        });
    });
}

async function fillLinkField() {
    await getActiveTabUrl().then(url => {
        document.getElementById('link').value = url;
        saveInputField('link');
    }).catch(err => console.error(err));
}


async function getSelectedText() {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

        const results = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            function: getSelectionText
        });

        return results[0].result;
    } catch (error) {
        console.error('Error:', error);
        return null;
    }
}

function getSelectionText() {
    return window.getSelection().toString().trim();
}