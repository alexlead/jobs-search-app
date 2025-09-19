let currentPage = 1;
const pageSize = 50;
let filteredJobs = [];
let selectedJobs = new Set();

async function initDatabase() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('JobTrackerDB', 1);

        request.onerror = event => reject(event.target.error);

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

        request.onsuccess = event => resolve(event.target.result);
    });
}

function getDatabase() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('JobTrackerDB', 1);
        request.onsuccess = event => resolve(event.target.result);
        request.onerror = event => reject(event.target.error);
    });
}

async function loadJobs() {
    const db = await getDatabase();
    const transaction = db.transaction('Jobs', 'readonly');
    const store = transaction.objectStore('Jobs');
    const index = store.index('CreateDate');

    filteredJobs = [];
    const request = index.openCursor(null, 'prev');

    request.onsuccess = event => {
        const cursor = event.target.result;
        if (cursor) {
            filteredJobs.push(cursor.value);
            cursor.continue();
        } else {
            currentPage = 1;
            renderJobs();
        }
    };
}

async function applyFilter() {
    const dateFrom = document.getElementById('date-from').value;
    const dateTo = document.getElementById('date-to').value;

    const db = await getDatabase();
    const transaction = db.transaction('Jobs', 'readonly');
    const store = transaction.objectStore('Jobs');
    const index = store.index('CreateDate');

    let range;
    if (dateFrom && dateTo) {
        range = IDBKeyRange.bound(
            new Date(dateFrom + 'T00:00:00').toISOString(),
            new Date(dateTo + 'T23:59:59').toISOString()
        );
    } else if (dateFrom) {
        range = IDBKeyRange.lowerBound(new Date(dateFrom + 'T00:00:00').toISOString());
    } else if (dateTo) {
        range = IDBKeyRange.upperBound(new Date(dateTo + 'T23:59:59').toISOString());
    }

    filteredJobs = [];
    const request = range ? index.openCursor(range, 'prev') : store.openCursor();

    request.onsuccess = event => {
        const cursor = event.target.result;
        if (cursor) {
            filteredJobs.push(cursor.value);
            cursor.continue();
        } else {
            currentPage = 1;
            renderJobs();
        }
    };
}

function clearFilter() {
    document.getElementById('date-from').value = '';
    document.getElementById('date-to').value = '';
    filteredJobs = [];
    loadJobs();
}

function renderJobs() {
    const start = (currentPage - 1) * pageSize;
    const end = start + pageSize;
    const pageJobs = filteredJobs.slice(start, end);
    const totalPages = Math.ceil(filteredJobs.length / pageSize);

    document.getElementById('page-info').textContent = `Page ${currentPage} of ${totalPages}`;
    document.getElementById('prev-page').disabled = currentPage === 1;
    document.getElementById('next-page').disabled = currentPage === totalPages || totalPages === 0;

    const tbody = document.getElementById('jobs-body');
    tbody.innerHTML = '';

    if (pageJobs.length === 0) {
        const row = tbody.insertRow();
        row.innerHTML = '<td colspan="6" style="text-align: center;">No jobs found</td>';
        return;
    }

    const dbRequest = indexedDB.open('JobTrackerDB', 1);
    dbRequest.onsuccess = async event => {
        const db = event.target.result;
        const statusTransaction = db.transaction('Status', 'readonly');
        const statusStore = statusTransaction.objectStore('Status');
        const statusMap = new Map();

        const statusCursor = statusStore.openCursor();
        statusCursor.onsuccess = e => {
            const cursor = e.target.result;
            if (cursor) {
                statusMap.set(cursor.value.ID, cursor.value.Status);
                cursor.continue();
            } else {
                pageJobs.forEach(job => {
                    const row = tbody.insertRow();
                    row.innerHTML = `
                        <td><input type="checkbox" class="job-checkbox" data-id="${job.ID}"></td>
                        <td class="cursor-pointer" data-job-id="${job.ID}">${job.ID}</td>
                        <td>${new Date(job.CreateDate).toLocaleDateString()}</td>
                        <td class="cursor-pointer" data-job-id="${job.ID}">${job.Company}</td>
                        <td class="cursor-pointer" data-job-id="${job.ID}">${job.JobPosition}</td>
                        <td><a href="${job.Link}" class="short-text" target="_blank">${job.Link}</a></td>
                        <td>${statusMap.get(job.Status) || 'Unknown'}</td>
                    `;
                });

                document.querySelectorAll('[data-job-id]').forEach(function (cell) {
                    cell.addEventListener('click', function () {
                        openJobDetails(this.getAttribute('data-job-id'));
                    })

                })
                document.querySelectorAll('.job-checkbox').forEach(checkbox => {
                    checkbox.addEventListener('change', function () {
                        const jobId = parseInt(this.dataset.id);
                        if (this.checked) {
                            selectedJobs.add(jobId);
                        } else {
                            selectedJobs.delete(jobId);
                        }
                        updateSelectAllCheckbox();
                    });
                });

                updateSelectAllCheckbox();
            }
        };
    };
}


async function openJobDetails(jobId) {

    const modal = new bootstrap.Modal(document.getElementById('jobDetails'));
    console.log(jobId);

    try {
        const job = await getJobById(+ jobId);
        if (job) {
            // console.log('Job:', job.job);
            // console.log('Meta:', job.meta);
            document.getElementById('detail-id').textContent = job.job.ID;
            document.getElementById('detail-create-date').textContent = new Date(job.job.CreateDate).toLocaleString();
            document.getElementById('detail-company').textContent = job.job.Company;
            document.getElementById('detail-position').textContent = job.job.JobPosition;
            document.getElementById('detail-link').innerHTML = `<a href="${job.job.Link}" target="_blank">${job.job.Link}</a>`;
            document.getElementById('detail-status').textContent = job.job.Status;
            modal.show();
        }
    } catch (error) {
        console.error('Error:', error);
    }



}

function toggleSelectAll() {
    const selectAll = document.getElementById('select-all').checked;
    document.querySelectorAll('.job-checkbox').forEach(checkbox => {
        checkbox.checked = selectAll;
        const jobId = parseInt(checkbox.dataset.id);
        if (selectAll) {
            selectedJobs.add(jobId);
        } else {
            selectedJobs.delete(jobId);
        }
    });
}

function updateSelectAllCheckbox() {
    const checkboxes = document.querySelectorAll('.job-checkbox');
    const selectAll = document.getElementById('select-all');
    selectAll.checked = checkboxes.length > 0 && selectedJobs.size === checkboxes.length;
}

async function deleteSelected() {
    if (selectedJobs.size === 0) {
        alert('Please select jobs to delete');
        return;
    }

    if (!confirm(`Are you sure you want to delete ${selectedJobs.size} job(s)?`)) {
        return;
    }

    const db = await getDatabase();
    const jobsTransaction = db.transaction(['Jobs', 'JobsMeta'], 'readwrite');
    const jobsStore = jobsTransaction.objectStore('Jobs');
    const metaStore = jobsTransaction.objectStore('JobsMeta');

    const metaIndex = metaStore.index('JobId');
    for (const jobId of selectedJobs) {
        jobsStore.delete(jobId);

        const metaRequest = metaIndex.openCursor(IDBKeyRange.only(jobId));
        metaRequest.onsuccess = event => {
            const cursor = event.target.result;
            if (cursor) {
                metaStore.delete(cursor.primaryKey);
                cursor.continue();
            }
        };
    }

    jobsTransaction.oncomplete = () => {
        alert('Selected jobs deleted successfully');
        selectedJobs.clear();
        loadJobs();
    };
}

async function exportToCSV() {
    try {
        const db = await getDatabase();
        const transaction = db.transaction(['Jobs', 'Status'], 'readonly');
        const jobsStore = transaction.objectStore('Jobs');
        const statusStore = transaction.objectStore('Status');

        const statusMap = new Map();
        const statusRequest = statusStore.openCursor();

        statusRequest.onsuccess = event => {
            const cursor = event.target.result;
            if (cursor) {
                statusMap.set(cursor.value.ID, cursor.value.Status);
                cursor.continue();
            } else {
                const jobsRequest = jobsStore.getAll();

                jobsRequest.onsuccess = event => {
                    const jobs = event.target.result;
                    const csvContent = convertToCSV(jobs, statusMap);
                    downloadCSV(csvContent);
                };

                jobsRequest.onerror = event => {
                    console.error('Error getting jobs:', event.target.error);
                    alert('Error exporting data');
                };
            }
        };

    } catch (error) {
        console.error('Export error:', error);
        alert('Error exporting data');
    }
}

function convertToCSV(jobs, statusMap) {
    const headers = ['ID', 'CreateDate', 'Company', 'JobPosition', 'Link', 'Status'];
    const rows = jobs.map(job => {
        const statusText = statusMap.get(job.Status) || 'Unknown';
        return [
            job.ID || '',
            job.CreateDate || '',
            escapeCSVField(job.Company || ''),
            escapeCSVField(job.JobPosition || ''),
            escapeCSVField(job.Link || ''),
            escapeCSVField(statusText)
        ];
    });

    rows.unshift(headers);

    return rows.map(row => row.join(',')).join('\n');
}

function escapeCSVField(field) {
    if (field.includes(',') || field.includes('"') || field.includes('\n')) {
        return `"${field.replace(/"/g, '""')}"`;
    }
    return field;
}

function downloadCSV(csvContent) {
    const currentDate = new Date().toISOString().split('T')[0];
    const filename = `job_search_${currentDate}.csv`;

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);

    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function triggerImport() {
    document.getElementById('import-file').click();
}

async function importFromCSV(event) {
    const file = event.target.files[0];
    if (!file) return;

    if (!confirm('Are you sure you want to import data from CSV? Existing data with same IDs will be updated.')) {
        event.target.value = '';
        return;
    }

    try {
        const text = await readFileAsText(file);
        const jobs = parseCSV(text);

        if (jobs.length === 0) {
            alert('No valid data found in CSV file');
            return;
        }

        await processImport(jobs);
        alert(`Successfully imported ${jobs.length} records`);
        loadJobs();

    } catch (error) {
        console.error('Import error:', error);
        alert('Error importing data: ' + error.message);
    } finally {
        event.target.value = '';
    }
}

function readFileAsText(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = event => resolve(event.target.result);
        reader.onerror = error => reject(error);
        reader.readAsText(file);
    });
}

function parseCSV(csvText) {
    const lines = csvText.split('\n').filter(line => line.trim());
    if (lines.length < 2) return [];

    const headers = lines[0].split(',').map(header => header.trim());
    const expectedHeaders = ['ID', 'CreateDate', 'Company', 'JobPosition', 'Link', 'Status'];

    if (!expectedHeaders.every(header => headers.includes(header))) {
        throw new Error('Invalid CSV format. Expected headers: ID, CreateDate, Company, JobPosition, Link, Status');
    }

    const jobs = [];

    for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        if (!line.trim()) continue;

        const values = parseCSVLine(line);
        if (values.length !== headers.length) continue;

        const job = {};
        headers.forEach((header, index) => {
            job[header] = values[index].trim();
        });

        if (!job.Company || !job.JobPosition) {
            console.warn('Skipping invalid row:', job);
            continue;
        }

        jobs.push(job);
    }

    return jobs;
}

function parseCSVLine(line) {
    const values = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const char = line[i];

        if (char === '"') {
            inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
            values.push(current);
            current = '';
        } else {
            current += char;
        }
    }

    values.push(current);
    return values.map(value => value.replace(/^"|"$/g, '').replace(/""/g, '"'));
}

async function processImport(jobs) {
    const db = await getDatabase();
    const statusMap = await getStatusMap(db);
    const reverseStatusMap = new Map();

    for (const [id, text] of statusMap.entries()) {
        reverseStatusMap.set(text.toLowerCase(), id);
    }

    const transaction = db.transaction(['Jobs'], 'readwrite');
    const store = transaction.objectStore('Jobs');

    const operations = [];

    for (const csvJob of jobs) {
        let jobData = {
            Company: csvJob.Company,
            JobPosition: csvJob.JobPosition,
            Link: csvJob.Link || ''
        };

        if (csvJob.CreateDate) {
            jobData.CreateDate = new Date(csvJob.CreateDate).toISOString();
        } else {
            jobData.CreateDate = new Date().toISOString();
        }

        if (csvJob.Status && reverseStatusMap.has(csvJob.Status.toLowerCase())) {
            jobData.Status = reverseStatusMap.get(csvJob.Status.toLowerCase());
        } else {
            jobData.Status = 1;
        }

        if (csvJob.ID && !isNaN(parseInt(csvJob.ID))) {
            const operation = new Promise((resolve, reject) => {
                const getRequest = store.get(parseInt(csvJob.ID));

                getRequest.onsuccess = (event) => {
                    const existingJob = event.target.result;
                    if (existingJob) {
                        jobData.ID = parseInt(csvJob.ID);
                        const putRequest = store.put(jobData);
                        putRequest.onsuccess = resolve;
                        putRequest.onerror = reject;
                    } else {
                        const addRequest = store.add(jobData);
                        addRequest.onsuccess = resolve;
                        addRequest.onerror = reject;
                    }
                };

                getRequest.onerror = reject;
            });

            operations.push(operation);
        } else {
            const operation = new Promise((resolve, reject) => {
                const addRequest = store.add(jobData);
                addRequest.onsuccess = resolve;
                addRequest.onerror = reject;
            });

            operations.push(operation);
        }
    }

    await Promise.all(operations);
}
async function getStatusMap(db) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['Status'], 'readonly');
        const store = transaction.objectStore('Status');
        const statusMap = new Map();

        const request = store.openCursor();
        request.onsuccess = event => {
            const cursor = event.target.result;
            if (cursor) {
                statusMap.set(cursor.value.ID, cursor.value.Status);
                cursor.continue();
            } else {
                resolve(statusMap);
            }
        };

        request.onerror = event => reject(event.target.error);
    });
}

async function getJobById(jobId) {
    const db = await initDatabase();

    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['Jobs', 'JobsMeta'], 'readonly');
        const jobsStore = transaction.objectStore('Jobs');
        const metaStore = transaction.objectStore('JobsMeta');
        const metaIndex = metaStore.index('JobId');

        const jobRequest = jobsStore.get(jobId);
        const metaRequest = metaIndex.getAll(jobId);

        let job = null;
        let meta = [];
        let requestsCompleted = 0;

        function checkCompletion() {
            requestsCompleted++;
            if (requestsCompleted === 2) {
                if (job) {
                    resolve({ job, meta });
                } else {
                    reject(new Error('Job not found'));
                }
            }
        }

        jobRequest.onsuccess = event => {
            job = event.target.result;
            checkCompletion();
        };

        jobRequest.onerror = event => {
            reject(event.target.error);
        };

        metaRequest.onsuccess = event => {
            meta = event.target.result || [];
            checkCompletion();
        };

        metaRequest.onerror = event => {
            reject(event.target.error);
        };
    });

}

async function clearAllData() {
    if (!confirm('Are you sure you want to clear ALL data? This action cannot be undone.')) {
        return;
    }

    const request = indexedDB.deleteDatabase('JobTrackerDB');

    request.onsuccess = () => {
        alert('All data cleared successfully');
        initDatabase().then(() => loadJobs());
    };

    request.onerror = () => {
        alert('Error clearing data');
    };
}

function changePage(direction) {
    const totalPages = Math.ceil(filteredJobs.length / pageSize);
    const newPage = currentPage + direction;

    if (newPage >= 1 && newPage <= totalPages) {
        currentPage = newPage;
        renderJobs();
    }
}

document.addEventListener('DOMContentLoaded', async function () {
    await initDatabase();
    loadJobs();

    document.getElementById('filter-btn').addEventListener('click', applyFilter);
    document.getElementById('clear-filter').addEventListener('click', clearFilter);
    document.getElementById('select-all').addEventListener('change', toggleSelectAll);
    document.getElementById('delete-btn').addEventListener('click', deleteSelected);
    document.getElementById('export-btn').addEventListener('click', exportToCSV);
    document.getElementById('import-btn').addEventListener('click', triggerImport);
    document.getElementById('import-file').addEventListener('change', importFromCSV);
    document.getElementById('clear-all-btn').addEventListener('click', clearAllData);
    document.getElementById('prev-page').addEventListener('click', () => changePage(-1));
    document.getElementById('next-page').addEventListener('click', () => changePage(1));
});