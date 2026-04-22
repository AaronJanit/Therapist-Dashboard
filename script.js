// --- DATA MANAGEMENT (LOCAL STORAGE) ---
// --- DATA MANAGEMENT (SQL) ---

let db = null;
let clientsData = [];
let notesData = [];
let scheduleData = [];
let currentUserCache = null;

async function initDatabase() {
    if (db) return;
    const SQL = await window.initSqlJs({ locateFile: file => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/${file}` });
    const dbData = localStorage.getItem('carespace_db');
    let needsReset = false;
    
    if (dbData) {
        try {
            db = new SQL.Database(new Uint8Array(JSON.parse(dbData)));
            console.log('Database restored from cache');

            // Check if users table has the required columns and migrate if needed
            const pragmaResult = db.exec("PRAGMA table_info(users)");
            if (pragmaResult.length && pragmaResult[0].values) {
                const existingColumns = pragmaResult[0].values.map(col => col[1]);
                const requiredUserColumns = [
                    'therapistId',
                    'bank_name',
                    'bank_account_name',
                    'bank_sort_code',
                    'bank_account_number',
                    'paypal_url',
                    'default_payment_text'
                ];

                requiredUserColumns.forEach(function(column) {
                    if (!existingColumns.includes(column)) {
                        db.run(`ALTER TABLE users ADD COLUMN ${column} TEXT`);
                        console.log('Added missing user column:', column);
                        existingColumns.push(column);
                    }
                });

                const hasTherapistId = existingColumns.includes('therapistId');
                console.log('Cached schema has therapistId:', hasTherapistId);
                if (!hasTherapistId) {
                    needsReset = true;
                }

                if (!needsReset) {
                    const updatedData = db.export();
                    localStorage.setItem('carespace_db', JSON.stringify(Array.from(updatedData)));
                }
            }
        } catch (err) {
            console.error('Error with cached database:', err);
            needsReset = true;
        }
    } else {
        needsReset = true;
    }
    
    if (needsReset || !db) {
        console.log('Loading fresh schema from users.sql');
        db = new SQL.Database();
        const response = await fetch('users.sql');
        const sqlText = await response.text();
        db.run(sqlText);
        const data = db.export();
        localStorage.setItem('carespace_db', JSON.stringify(Array.from(data)));
        console.log('Fresh database initialized');
    }
}

function queryAll(sql, params = []) {
    const stmt = db.prepare(sql);
    stmt.bind(params);
    const rows = [];
    while (stmt.step()) {
        rows.push(stmt.getAsObject());
    }
    stmt.free();
    return rows;
}

function querySingle(sql, params = []) {
    const stmt = db.prepare(sql);
    stmt.bind(params);
    const row = stmt.step() ? stmt.getAsObject() : null;
    stmt.free();
    return row;
}

async function getTableData(table) {
    await initDatabase();
    const currentUser = await getCurrentUser();
    const therapistId = currentUser ? currentUser.therapistId : null;
    
    if ((table === 'clients' || table === 'notes' || table === 'schedule') && therapistId) {
        const rows = queryAll(`SELECT * FROM ${table} WHERE therapistId = ?`, [therapistId]);
        return rows;
    } else if (table === 'users') {
        return queryAll(`SELECT * FROM users`);
    } else {
        return [];
    }
}

async function setTableData(table, data) {
    await initDatabase();
    db.run(`DELETE FROM ${table}`);
    if (data.length) {
        const columns = Object.keys(data[0]);
        const placeholders = columns.map(() => '?').join(',');
        const stmt = db.prepare(`INSERT INTO ${table} (${columns.join(',')}) VALUES (${placeholders})`);
        data.forEach(row => {
            stmt.run(columns.map(col => row[col]));
        });
        stmt.free();
    }
    const dbData = db.export();
    localStorage.setItem('carespace_db', JSON.stringify(Array.from(dbData)));
}

async function getAllUsers() {
    await initDatabase();
    const result = db.exec(`SELECT * FROM users`);
    if (!result.length) return [];
    const columns = result[0].columns;
    return result[0].values.map(row => {
        const obj = {};
        columns.forEach((col, i) => obj[col] = row[i]);
        return obj;
    });
}

async function getCurrentUser() {
    const username = localStorage.getItem('loggedInUser');
    if (!username) {
        currentUserCache = null;
        return null;
    }

    if (currentUserCache && currentUserCache.username === username) {
        return currentUserCache;
    }

    await initDatabase();

    const user = querySingle(`SELECT * FROM users WHERE username = ?`, [username]);
    if (!user) {
        currentUserCache = null;
        return null;
    }

    currentUserCache = user;
    return user;
}

function generateTherapistId() {
    return 'therapist-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
}

const STORAGE_KEYS = {
    clients: 'clients',
    notes: 'notes',
    schedule: 'schedule'
};

// Initial Dummy Data if empty
function buildDefaultScheduleForToday() {
    const today = localDateString();
    const tomorrow = localDateString(new Date(Date.now() + 86400000));
    return [
        { id: 's1', date: today, time: '09:00', clientId: 'c1', status: 'confirmed' },
        { id: 's2', date: today, time: '14:00', clientId: 'c2', status: 'confirmed' },
        { id: 's3', date: tomorrow, time: '10:00', clientId: 'c3', status: 'confirmed' }
    ];
}

function buildDefaultNotesForToday() {
    const today = localDateString();
    const prior = localDateString(new Date(Date.now() - 5 * 86400000));
    return [
        { id: 'n1', clientId: 'c1', date: today, content: 'Discussed grief cycles. Client exhibited good insight. Assigned journaling homework.' },
        { id: 'n2', clientId: 'c2', date: prior, content: 'Evaluated medication efficacy. Patient reports 20% reduction in panic attacks.' }
    ];
}

function buildDefaultClientsWithRelativeVisits() {
    const today = localDateString();
    const fewDaysAgo = localDateString(new Date(Date.now() - 3 * 86400000));
    return [
        {
            id: 'c1',
            name: 'Elena Rodriguez',
            email: 'elena.r@example.com',
            phone: '(555) 201-4421',
            dateOfBirth: '1988-06-14',
            emergencyContact: 'Jordan Rodriguez — (555) 201-7700',
            issue: 'Grief Counseling',
            lastVisit: today,
            status: 'Active'
        },
        {
            id: 'c2',
            name: 'Marcus Chen',
            email: 'marcus.c@example.com',
            phone: '(555) 310-8892',
            dateOfBirth: '1992-11-02',
            emergencyContact: 'Wei Chen — (555) 310-1100',
            issue: 'Medication Management',
            lastVisit: fewDaysAgo,
            status: 'Active'
        },
        {
            id: 'c3',
            name: 'Sarah Jenkins',
            email: 'sarah.j@example.com',
            phone: '(555) 447-2210',
            dateOfBirth: '1990-04-21',
            emergencyContact: 'Alex Jenkins — (555) 447-0091',
            issue: 'Anxiety',
            lastVisit: fewDaysAgo,
            status: 'Inactive'
        }
    ];
}

// Helper to load or set data
function getData(key) {
    if (key === 'clients') return clientsData;
    if (key === 'notes') return notesData;
    if (key === 'schedule') return scheduleData;
    return null;
}

function setData(key, data) {
    if (key === 'clients') clientsData = data;
    else if (key === 'notes') notesData = data;
    else scheduleData = data;
    setTableData(key, data);
}

async function loadData() {
    clientsData = await getTableData('clients');
    notesData = await getTableData('notes');
    scheduleData = await getTableData('schedule');
}

/** Calendar "today" and schedule filters must use local date, not UTC from toISOString(). */
function localDateString(date) {
    const d = date instanceof Date ? date : new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function getSundayWeekStart(ref) {
    const d = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());
    d.setDate(d.getDate() - d.getDay());
    return d;
}

function formatWeekRangeLabel(weekStart) {
    const end = new Date(weekStart);
    end.setDate(weekStart.getDate() + 6);
    const opts = { weekday: 'short', month: 'short', day: 'numeric' };
    return weekStart.toLocaleDateString('en-US', opts) + ' – ' + end.toLocaleDateString('en-US', opts) + ', ' + end.getFullYear();
}

function formatScheduleHourDisplay(timeKey) {
    const [hourStr, minute] = timeKey.split(':');
    let hour = parseInt(hourStr, 10);
    if (Number.isNaN(hour)) return timeKey;
    const period = hour < 12 ? 'AM' : 'PM';
    const displayHour = hour % 12 === 0 ? 12 : hour % 12;
    return `${displayHour}${minute === '00' ? '' : ':' + minute} ${period}`;
}

function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/** Lowercase trimmed query from a search input, or null if empty. */
function getSearchNeedle(inputId) {
    const el = document.getElementById(inputId);
    if (!el || !String(el.value).trim()) return null;
    return String(el.value).trim().toLowerCase();
}

function clientMatchesSearch(client, needle) {
    if (!needle) return true;
    const parts = [
        client.name,
        client.email,
        client.issue,
        client.phone,
        client.status,
        client.emergencyContact,
        client.dateOfBirth,
        client.lastVisit,
        client.id
    ].filter(function(p) { return p != null && String(p).trim() !== ''; });
    const hay = parts.join(' ').toLowerCase();
    return hay.indexOf(needle) !== -1;
}

function noteContentPlain(content) {
    const d = document.createElement('div');
    d.innerHTML = content || '';
    return (d.textContent || '').toLowerCase();
}

function noteMatchesSearch(note, clients, needle) {
    if (!needle) return true;
    const client = clients.find(function(c) { return c.id === note.clientId; });
    const clientHay = client ? [client.name, client.email].join(' ').toLowerCase() : '';
    const text = (note.date + ' ' + noteContentPlain(note.content) + ' ' + clientHay).toLowerCase();
    return text.indexOf(needle) !== -1;
}

let editingClientId = null;

function ensureCareSpaceData() {
    // Data loaded in loadData
}

// Initialize App (dashboard only)
async function initApp() {
    if (!localStorage.getItem('loggedInUser')) {
        window.location.href = 'login.html';
        return;
    }
    await initUserArea();
    await loadData();
    const currentUser = await getCurrentUser();
    if (currentUser && currentUser.role === 'Admin') {
        const adminLink = document.getElementById('admin-link');
        if (adminLink) adminLink.style.display = 'block';
    }
    renderAll();
    bindDashboardSearchIfPresent();
}

async function initSchedulePage() {
    if (!localStorage.getItem('loggedInUser')) {
        window.location.href = 'login.html';
        return;
    }
    await initUserArea();
    await loadData();
    loadScheduleViewPreferences();
    updateScheduleToggleUI();
    const currentUser = await getCurrentUser();
    if (currentUser && currentUser.role === 'Admin') {
        const adminLink = document.getElementById('admin-link');
        if (adminLink) adminLink.style.display = 'block';
    }
    renderAll();
    if (!window.scheduleCurrentTimeLineTimer) {
        window.scheduleCurrentTimeLineTimer = setInterval(updateScheduleCurrentTimeLine, 60000);
    }
}

async function initUserArea() {
    const loggedInUser = localStorage.getItem('loggedInUser');
    if (!loggedInUser) {
        return;
    }

    const user = await getCurrentUser();
    if (!user) {
        localStorage.removeItem('loggedInUser');
        window.location.href = 'login.html';
        return;
    }

    const fullName = user.full_name || 'Dr. Therapist';
    const userRole = user.role || '';

    const userNameEl = document.getElementById('user-name') || document.querySelector('.user-area h4');
    const avatarEl = document.getElementById('user-avatar') || document.querySelector('.user-area .avatar');
    const roleEl = document.getElementById('user-role') || document.querySelector('.user-area p');
    const logoutBtn = document.getElementById('logout-btn');

    if (userNameEl) {
        userNameEl.textContent = fullName;
    }
    if (roleEl) {
        roleEl.textContent = userRole;
    }
    if (avatarEl) {
        const initials = fullName.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
        avatarEl.textContent = initials;
    }
    if (logoutBtn) {
        logoutBtn.addEventListener('click', function() {
            localStorage.removeItem('loggedInUser');
            currentUserCache = null;
            window.location.href = 'login.html';
        });
    }
}

function bindDashboardSearchIfPresent() {
    const el = document.getElementById('dashboard-search-input');
    if (!el || el.dataset.searchBound) return;
    el.dataset.searchBound = '1';
    el.addEventListener('input', function() {
        onDashboardSearchInput();
    });
}

function onDashboardSearchInput() {
    if (!document.getElementById('dashboard-today-list')) return;
    const clients = getData(STORAGE_KEYS.clients) || [];
    const schedule = getData(STORAGE_KEYS.schedule) || [];
    const notes = getData(STORAGE_KEYS.notes) || [];
    const today = localDateString();
    const todaysSessions = schedule.filter(function(s) { return s.date === today; });
    renderDashboardToday(todaysSessions, clients);
    if (document.getElementById('calendar-container')) {
        renderCalendar();
    }
    updateDashboardSearchPanel(clients, notes);
}

function updateDashboardSearchPanel(clients, notes) {
    const panel = document.getElementById('dashboard-search-panel');
    if (!panel) return;
    const needle = getSearchNeedle('dashboard-search-input');
    if (!needle) {
        panel.classList.add('hidden');
        panel.innerHTML = '';
        return;
    }
    panel.classList.remove('hidden');
    const matchedClients = clients.filter(function(c) { return clientMatchesSearch(c, needle); }).slice(0, 10);
    const matchedNotes = [];
    (notes || []).forEach(function(n) {
        if (noteMatchesSearch(n, clients, needle)) matchedNotes.push(n);
    });
    matchedNotes.sort(function(a, b) { return new Date(b.date) - new Date(a.date); });
    const topNotes = matchedNotes.slice(0, 8);

    let html = '';
    if (!matchedClients.length && !topNotes.length) {
        html = '<p class="search-panel-empty">No clients or notes matched. Try another term.</p>';
    } else {
        if (matchedClients.length) {
            html += '<div class="search-panel-title">Clients</div><ul>';
            matchedClients.forEach(function(c) {
                html += '<li><a href="clients.html?id=' + encodeURIComponent(c.id) + '">' + escapeHtml(c.name) + '</a>' +
                    '<span class="search-meta"> · ' + escapeHtml(c.email || '') + '</span></li>';
            });
            html += '</ul>';
        }
        if (topNotes.length) {
            html += '<div class="search-panel-title">Notes</div><ul>';
            topNotes.forEach(function(n) {
                const cl = clients.find(function(c) { return c.id === n.clientId; });
                const preview = notePreviewPlain(n.content);
                html += '<li><a href="notes.html?client=' + encodeURIComponent(n.clientId) + '">' +
                    escapeHtml(cl ? cl.name : 'Unknown') + '</a> · ' + escapeHtml(n.date) +
                    '<span class="search-meta"> — ' + escapeHtml(preview.slice(0, 80)) + (preview.length > 80 ? '…' : '') + '</span></li>';
            });
            html += '</ul>';
        }
    }
    panel.innerHTML = html;
}

// Global Render Function (dashboard elements guarded for notes.html / partial pages)
function renderAll() {
    const clients = getData(STORAGE_KEYS.clients) || [];
    const schedule = getData(STORAGE_KEYS.schedule) || [];
    const notes = getData(STORAGE_KEYS.notes) || [];

    const today = localDateString();
    const todaysSessions = schedule.filter(s => s.date === today);
    const pendingNotesCount = todaysSessions.filter(
        s => !notes.some(n => n.clientId === s.clientId && n.date === today)
    ).length;

    const setText = (id, text) => {
        const el = document.getElementById(id);
        if (el) el.innerText = text;
    };

    setText('stat-active-clients', String(clients.filter(c => c.status === 'Active').length));
    setText('stat-sessions-today', String(todaysSessions.length));
    setText('stat-unwritten-notes', String(pendingNotesCount));

    if (document.getElementById('dashboard-today-list')) {
        renderDashboardToday(todaysSessions, clients);
    }
    if (document.getElementById('calendar-container')) {
        renderCalendar();
    }
    if (document.getElementById('client-table-body')) {
        renderClientTable(clients);
    }
    if (document.getElementById('schedule-grid')) {
        renderScheduleGrid(schedule, clients);
    }
    if (document.getElementById('notes-container')) {
        renderNotesGrid(notes, clients);
    }
    if (document.getElementById('dashboard-search-panel')) {
        updateDashboardSearchPanel(clients, notes);
    }
    if (document.getElementById('next-session-card')) {
        renderNextSession(schedule, clients);
    }
}

// --- RENDERERS ---

// Dashboard: Next Session
function renderNextSession(schedule, clients) {
    // Clear any existing interval for next session countdown
    if (window.nextSessionTimer) {
        clearInterval(window.nextSessionTimer);
        window.nextSessionTimer = null;
    }

    const clientEl = document.getElementById('next-session-client');
    const countdownEl = document.getElementById('next-session-countdown');

    if (!clientEl || !countdownEl) {
        return;
    }

    const now = new Date();
    const upcoming = schedule
        .map(s => {
            const sessionDateTime = new Date(s.date + 'T' + s.time);
            return { ...s, sessionDateTime };
        })
        .filter(s => s.sessionDateTime > now)
        .sort((a, b) => a.sessionDateTime - b.sessionDateTime);

    if (!upcoming.length) {
        clientEl.innerText = 'No upcoming sessions';
        countdownEl.innerText = '';
        return;
    }

    const next = upcoming[0];
    const client = clients.find(c => c.id === next.clientId);
    clientEl.innerText = client ? client.name : 'Unknown Client';

    function updateCountdown() {
        const diff = next.sessionDateTime - new Date();
        if (diff <= 0) {
            countdownEl.innerText = 'Now';
            // If the session has started, we might want to re-render to see if there's a next one
            // But for simplicity, we'll just show 'Now' and let the next render (from data change) update it.
            return;
        }
        const days = Math.floor(diff / 86400000);
        const hours = Math.floor((diff % 86400000) / 3600000);
        const mins = Math.floor((diff % 3600000) / 60000);
        let text = '';
        if (days > 0) text += days + 'd ';
        if (hours > 0 || days > 0) text += hours + 'h ';
        text += mins + 'm';
        countdownEl.innerText = text;
    }
    updateCountdown();
    // Update the countdown every minute
    window.nextSessionTimer = setInterval(updateCountdown, 60000);
}

    const next = upcoming[0];
    const client = clients.find(c => c.id === next.clientId);
    clientEl.innerText = client ? client.name : 'Unknown Client';

    function updateCountdown() {
        const diff = next.sessionDateTime - new Date();
        if (diff <= 0) {
            countdownEl.innerText = 'Now';
            return;
        }
        const days = Math.floor(diff / 86400000);
        const hours = Math.floor((diff % 86400000) / 3600000);
        const mins = Math.floor((diff % 3600000) / 60000);
        let text = '';
        if (days > 0) text += days + 'd ';
        if (hours > 0 || days > 0) text += hours + 'h ';
        text += mins + 'm';
        countdownEl.innerText = text;
    }
    updateCountdown();
    if (!window.nextSessionTimer) {
        window.nextSessionTimer = setInterval(updateCountdown, 60000);
    }
}

// Dashboard: Today's List
function renderDashboardToday(scheduleArray, clients) {
    const container = document.getElementById('dashboard-today-list');
    if (!container) return;
    container.innerHTML = '';

    const needle = getSearchNeedle('dashboard-search-input');
    let displaySessions = scheduleArray;
    if (needle) {
        displaySessions = scheduleArray.filter(function(slot) {
            const c = clients.find(function(x) { return x.id === slot.clientId; });
            if (!c) {
                return (String(slot.time) + ' ' + (slot.status || '')).toLowerCase().indexOf(needle) !== -1;
            }
            return clientMatchesSearch(c, needle);
        });
    }

    if (scheduleArray.length === 0) {
        container.innerHTML = '<div class="empty-box" style="padding: 30px; border: none; background: #f5f5f5;"><i class="fas fa-sun" style="font-size: 24px; color: #777; display: block; margin-bottom: 10px;"></i><p>No sessions scheduled for today.</p></div>';
        return;
    }

    if (needle && displaySessions.length === 0) {
        container.innerHTML = '<div class="empty-box" style="padding: 30px; border: none; background: #f5f5f5;"><i class="fas fa-search" style="font-size: 24px; color: #777; display: block; margin-bottom: 10px;"></i><p>No sessions today match your search.</p></div>';
        return;
    }

    displaySessions.forEach(slot => {
        const client = clients.find(c => c.id === slot.clientId);
        const clientName = client ? client.name : 'Unknown Client';
        
        const statusClass = slot.status === 'confirmed' ? 'status-confirmed' : 'status-new';
        const statusText = slot.status === 'confirmed' ? 'Confirmed' : 'New Intake';

        const html = `
            <div class="schedule-item">
                <div class="schedule-info">
                    <h4>${slot.time} - ${clientName}</h4>
                    <p>${client ? client.issue : 'General Checkup'} • ${slot.status === 'confirmed' ? 'In-Person' : 'Assessment'}</p>
                </div>
                <span class="status-badge ${statusClass}">${statusText}</span>
            </div>
        `;
        container.innerHTML += html;
    });
}

// Dashboard: Calendar
let currentMonth = new Date().getMonth();
let currentYear = new Date().getFullYear();
let scheduleWeekStart = getSundayWeekStart(new Date());
let scheduleShowNightShift = false;
let scheduleShowFullDay = false;

function loadScheduleViewPreferences() {
    scheduleShowNightShift = localStorage.getItem('scheduleShowNightShift') === 'true';
    scheduleShowFullDay = localStorage.getItem('scheduleShowFullDay') === 'true';
}

function saveScheduleViewPreferences() {
    localStorage.setItem('scheduleShowNightShift', String(scheduleShowNightShift));
    localStorage.setItem('scheduleShowFullDay', String(scheduleShowFullDay));
}

function getScheduleHours() {
    if (scheduleShowFullDay) {
        return Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0') + ':00');
    }
    const baseHours = ['09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00'];
    if (scheduleShowNightShift) {
        return baseHours.concat(['17:00','18:00','19:00','20:00','21:00','22:00','23:00']);
    }
    return baseHours;
}

function normalizeScheduleTime(timeKey) {
    if (!timeKey) return '';
    const parts = timeKey.split(':');
    if (parts.length !== 2) return timeKey;
    let hour = parseInt(parts[0], 10);
    const minute = parts[1] || '00';
    if (Number.isNaN(hour)) return timeKey;
    if (hour >= 1 && hour <= 4 && minute === '00') {
        return String(hour + 12).padStart(2, '0') + ':00';
    }
    return String(hour).padStart(2, '0') + ':' + minute;
}

function setScheduleViewMode(mode, value) {
    if (mode === 'nightShift') {
        scheduleShowNightShift = value;
    } else if (mode === 'fullDay') {
        scheduleShowFullDay = value;
        if (scheduleShowFullDay) {
            scheduleShowNightShift = false;
        }
    }
    saveScheduleViewPreferences();
    updateScheduleToggleUI();
    renderAll();
}

function handleScheduleViewToggle(mode, checked) {
    setScheduleViewMode(mode, checked);
}

function updateScheduleToggleUI() {
    const nightShiftCheckbox = document.getElementById('toggle-night-shift');
    const fullDayCheckbox = document.getElementById('toggle-full-day');
    if (nightShiftCheckbox) {
        nightShiftCheckbox.checked = scheduleShowNightShift;
        nightShiftCheckbox.disabled = scheduleShowFullDay;
    }
    if (fullDayCheckbox) {
        fullDayCheckbox.checked = scheduleShowFullDay;
    }
}

function changeScheduleWeek(delta) {
    if (delta === 0) {
        scheduleWeekStart = getSundayWeekStart(new Date());
    } else {
        const d = new Date(scheduleWeekStart);
        d.setDate(scheduleWeekStart.getDate() + delta * 7);
        scheduleWeekStart = getSundayWeekStart(d);
    }
    renderAll();
}

function changeMonth(direction) {
    currentMonth += direction;
    if (currentMonth > 11) { currentMonth = 0; currentYear++; }
    if (currentMonth < 0) { currentMonth = 11; currentYear--; }
    renderCalendar();
}

function renderCalendar() {
    const container = document.getElementById('calendar-container');
    container.innerHTML = '';
    
    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    document.getElementById('cal-header-text').innerText = `${monthNames[currentMonth]} ${currentYear}`;

    // Days headers
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    days.forEach(d => container.innerHTML += `<div class="cal-label">${d}</div>`);

    const firstDay = new Date(currentYear, currentMonth, 1).getDay();
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    
    // Empty slots for start
    for (let i = 0; i < firstDay; i++) container.innerHTML += `<div class="day-num" style="cursor:default; opacity:0.5"></div>`;

    const schedule = getData(STORAGE_KEYS.schedule) || [];
    const clients = getData(STORAGE_KEYS.clients) || [];
    const needle = getSearchNeedle('dashboard-search-input');
    const today = new Date().getDate();
    const currentMonthIndex = currentMonth; // 0-11
    const currentYearVal = currentYear;

    for (let d = 1; d <= daysInMonth; d++) {
        // Check if this date has appointments
        let hasAppt = false;
        let apptClient = '';
        
        // Filter schedule for current month/year
        const dayStr = `${currentYearVal}-${String(currentMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        
        const daySchedule = schedule.filter(s => s.date === dayStr);
        if (daySchedule.length > 0) {
            hasAppt = true;
            const client = daySchedule[0].clientId;
            const clientObj = clients.find(c => c.id === client);
            apptClient = clientObj ? clientObj.name.split(' ')[0] : 'Client';
        }

        let searchHit = false;
        let searchMiss = false;
        if (needle && daySchedule.length > 0) {
            searchHit = daySchedule.some(function(s) {
                const co = clients.find(function(c) { return c.id === s.clientId; });
                return co && clientMatchesSearch(co, needle);
            });
            searchMiss = !searchHit;
        }

        let classes = 'day-num';
        if (d === today && currentMonth === new Date().getMonth() && currentYear === new Date().getFullYear()) classes += ' today';
        if (hasAppt) classes += ' booked';
        if (needle && daySchedule.length > 0) {
            if (searchHit) classes += ' cal-search-hit';
            else if (searchMiss) classes += ' cal-search-miss';
        }

        const html = `<div class="${classes}" onclick="openCalendarDay('${dayStr}')">${d}</div>`;
        container.innerHTML += html;
    }
}

function openCalendarDay(dateStr) {
    openModal('session-modal', { preserveSessionDate: true });
    document.getElementById('s_date').value = dateStr;
}

// Client Table (clients.html list view)
function renderClientTable(clients) {
    const tbody = document.getElementById('client-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (clients.length === 0) {
        const needle = getSearchNeedle('clients-search-input');
        const msg = needle
            ? 'No clients match your search.'
            : 'No clients found. Add one to get started.';
        tbody.innerHTML = '<tr><td colspan="5" class="empty-box" style="text-align:center; padding: 40px;">' + escapeHtml(msg) + '</td></tr>';
        return;
    }

    clients.forEach(client => {
        const statusClass = client.status === 'Active' ? 'status-active' : 'status-inactive';
        const avatarColors = ['#111111', '#333333', '#555555', '#777777', '#999999'];
        const colorIndex = client.name.length % 5;
        const avatarColor = avatarColors[colorIndex];
        const initials = client.name.split(' ').map(n => n[0]).join('').substring(0, 2);

        tbody.innerHTML += `
            <tr>
                <td>
                    <div class="client-row">
                        <div class="client-avatar" style="background-color: ${avatarColor}">${initials}</div>
                        <div>
                            <strong><a class="client-table-name-link" href="clients.html?id=${encodeURIComponent(client.id)}">${escapeHtml(client.name)}</a></strong><br>
                            <span style="font-size: 12px; color: #777;">${escapeHtml(client.email)}</span>
                        </div>
                    </div>
                </td>
                <td><span class="status-badge ${statusClass}">${escapeHtml(client.status)}</span></td>
                <td>${escapeHtml(client.lastVisit || 'Never')}</td>
                <td>${escapeHtml(client.issue)}</td>
                <td>
                    <a class="action-btn btn-edit" href="clients.html?id=${encodeURIComponent(client.id)}" title="View profile"><i class="fas fa-user"></i></a>
                    <button type="button" class="action-btn btn-edit" onclick="editClient('${client.id}')" title="Edit"><i class="fas fa-pen"></i></button>
                    <button type="button" class="action-btn btn-delete" onclick="deleteClient('${client.id}')" title="Delete"><i class="fas fa-trash"></i></button>
                </td>
            </tr>
        `;
    });
}

// Schedule: week calendar (Sun–Sat × hourly slots)
function renderScheduleGrid(schedule, clients) {
    schedule = schedule || [];
    clients = clients || [];
    const container = document.getElementById('schedule-grid');
    const rangeEl = document.getElementById('schedule-week-range');
    if (!container) return;

    const weekDays = [];
    for (let i = 0; i < 7; i++) {
        const d = new Date(scheduleWeekStart);
        d.setDate(scheduleWeekStart.getDate() + i);
        weekDays.push(d);
    }

    if (rangeEl) rangeEl.textContent = formatWeekRangeLabel(scheduleWeekStart);

    const hours = getScheduleHours();
    const todayStr = localDateString();
    let html = '<div class="schedule-corner" aria-hidden="true"></div>';

    weekDays.forEach((d) => {
        const ds = localDateString(d);
        const isToday = ds === todayStr;
        const dayName = d.toLocaleDateString('en-US', { weekday: 'short' });
        const dayNum = d.getDate();
        html += `<div class="schedule-day-head${isToday ? ' is-today' : ''}">
            <div class="schedule-day-name">${dayName}</div>
            <div class="schedule-day-num">${dayNum}</div>
        </div>`;
    });

    hours.forEach((timeKey) => {
        html += `<div class="schedule-time-gutter">${formatScheduleHourDisplay(timeKey)}</div>`;
        weekDays.forEach((d) => {
            const ds = localDateString(d);
            const isToday = ds === todayStr;
            const slotData = schedule.find(s => s.date === ds && (s.time === timeKey || normalizeScheduleTime(s.time) === timeKey));
            const colClass = isToday ? ' is-today' : '';

            if (slotData) {
                const client = clients.find(c => c.id === slotData.clientId);
                const name = escapeHtml(client ? client.name : 'Unknown');
                const meta = slotData.status === 'confirmed' ? 'Confirmed' : 'New';
                html += `<div class="schedule-cell schedule-cell--busy${colClass}">
                    <div class="schedule-appt">
                        <span class="schedule-appt-name">${name}</span>
                        <span class="schedule-appt-meta">${meta}</span>
                        <button type="button" class="schedule-appt-cancel" onclick="deleteSession('${slotData.id}')" title="Cancel session" aria-label="Cancel session"><i class="fas fa-times"></i></button>
                    </div>
                </div>`;
            } else {
                html += `<div class="schedule-cell schedule-cell--free${colClass}" onclick="loadModalWithSlot('${ds}','${timeKey}')" title="Book ${formatScheduleHourDisplay(timeKey)}"><span aria-hidden="true">+</span></div>`;
            }
        });
    });

    html += '<div id="current-time-line" class="current-time-line" aria-hidden="true"></div>';
    container.innerHTML = html;
    updateScheduleCurrentTimeLine();
}

function getScheduleTimeMinutes(timeKey) {
    const parts = timeKey.split(':');
    if (parts.length !== 2) return 0;
    const hour = parseInt(parts[0], 10);
    const minute = parseInt(parts[1], 10);
    return (Number.isNaN(hour) ? 0 : hour) * 60 + (Number.isNaN(minute) ? 0 : minute);
}

function updateScheduleCurrentTimeLine() {
    const container = document.getElementById('schedule-grid');
    const line = document.getElementById('current-time-line');
    if (!container || !line) return;

    const todayStr = localDateString();
    const now = new Date();
    const currentDateStr = localDateString(now);
    const hours = getScheduleHours();
    const startMinutes = getScheduleTimeMinutes(hours[0]);
    const endMinutes = getScheduleTimeMinutes(hours[hours.length - 1]) + 60;
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const visibleToday = currentDateStr === todayStr;
    const dayHeader = container.querySelector('.schedule-day-head.is-today');
    const firstRow = container.querySelector('.schedule-time-gutter');

    if (!visibleToday || !dayHeader || !firstRow || currentMinutes < startMinutes || currentMinutes > endMinutes) {
        line.style.display = 'none';
        return;
    }

    const totalDayHeight = firstRow.getBoundingClientRect().height * container.querySelectorAll('.schedule-time-gutter').length;
    const progress = (currentMinutes - startMinutes) / (endMinutes - startMinutes);
    const topOffset = firstRow.offsetTop + Math.min(Math.max(progress, 0), 1) * totalDayHeight;

    line.style.display = 'block';
    line.style.top = `${topOffset}px`;
}

// Notes Grid
function renderNotesGrid(notes, clients) {
    const container = document.getElementById('notes-container');
    container.innerHTML = '';
    
    if (notes.length === 0) {
        container.innerHTML = '<div class="empty-box"><i class="fas fa-file-word"></i><h3>No notes yet</h3><p>Session notes will appear here.</p></div>';
        return;
    }

    const sortedNotes = [...notes].sort((a, b) => new Date(b.date) - new Date(a.date));

    sortedNotes.forEach(note => {
        const client = clients.find(c => c.id === note.clientId);
        const clientName = client ? client.name : 'Unknown Client';
        
        const html = `
            <div class="note-card">
                <div class="note-header">
                    <span class="note-client">${clientName}</span>
                    <span class="note-date">${new Date(note.date).toDateString()}</span>
                </div>
                <div class="note-content">${note.content}</div>
                <div class="note-footer">
                    <button class="btn-text" onclick="alert('Print functionality coming soon')"><i class="fas fa-print"></i> Print</button>
                    <button class="btn-text" onclick="deleteNote('${note.id}')"><i class="fas fa-trash"></i> Delete</button>
                </div>
            </div>
        `;
        container.innerHTML += html;
    });
}

// --- HANDLERS (Actions) ---

function switchTab(tabId, btnElement) {
    document.querySelectorAll('.page-section').forEach(sec => sec.classList.remove('active'));
    document.getElementById(tabId).classList.add('active');
    
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    if(btnElement) btnElement.classList.add('active');
}

function goToScheduleTab() {
    window.location.href = 'schedule.html';
}

// Modal Logic
let currentModalId = '';
function openModal(modalId, options) {
    options = options || {};
    currentModalId = modalId;
    document.getElementById(modalId).classList.add('active');
    
    // Pre-populate forms based on type
    if (modalId === 'client-modal') {
        if (!options.skipClientFormReset) {
            editingClientId = null;
            document.getElementById('client-form').reset();
            document.getElementById('client-modal-title').innerHTML = '<i class="fas fa-user-plus" style="color:var(--primary)"></i> Add New Client';
            document.getElementById('client-form-submit').textContent = 'Save Client';
            const sg = document.getElementById('client-status-group');
            if (sg) sg.hidden = true;
        }
    } else if (modalId === 'note-modal') {
        populateSelectOptions('n_client_id', STORAGE_KEYS.clients, 'name', 'id');
        document.getElementById('n_date').value = localDateString();
    } else if (modalId === 'session-modal') {
        populateSelectOptions('s_client_id', STORAGE_KEYS.clients, 'name', 'id');
        populateTimeSelect('s_time');
        if (!options.preserveSessionDate) {
            document.getElementById('s_date').value = localDateString();
        }
    }
}

function closeModals() {
    document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active'));
}

window.onclick = function(event) {
    if (event.target.classList.contains('modal-overlay')) {
        closeModals();
    }
}

// Form Population Helper
function populateSelectOptions(selectId, storageKey, labelKey, valueKey) {
    const data = getData(storageKey) || [];
    const select = document.getElementById(selectId);
    select.innerHTML = '';

    if (data.length === 0) {
        const opt = document.createElement('option');
        opt.value = '';
        opt.text = 'No clients yet — add a client first';
        select.appendChild(opt);
        return;
    }

    data.forEach(item => {
        const option = document.createElement('option');
        option.value = item[valueKey];
        option.text = item[labelKey];
        select.appendChild(option);
    });
}

function populateTimeSelect(selectId) {
    const select = document.getElementById(selectId);
    const times = getScheduleHours();
    select.innerHTML = '';
    times.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t;
        opt.text = formatScheduleHourDisplay(t);
        select.appendChild(opt);
    });
}

function loadModalWithSlot(dateStr, time) {
    openModal('session-modal', { preserveSessionDate: true });
    document.getElementById('s_date').value = dateStr;
    document.getElementById('s_time').value = time;
}

function loadModalWithTime(time) {
    loadModalWithSlot(localDateString(), time);
}

// --- SUBMIT LOGIC ---

async function handleAddClient(e) {
    e.preventDefault();
    const name = document.getElementById('c_name').value.trim();
    const email = document.getElementById('c_email').value.trim();
    const issue = document.getElementById('c_issue').value;
    const phoneEl = document.getElementById('c_phone');
    const dobEl = document.getElementById('c_dob');
    const emEl = document.getElementById('c_emergency');
    const phone = phoneEl ? phoneEl.value.trim() : '';
    const dateOfBirth = dobEl && dobEl.value ? dobEl.value : '';
    const emergencyContact = emEl ? emEl.value.trim() : '';
    const statusGroup = document.getElementById('client-status-group');
    const statusSelect = document.getElementById('c_status');
    const status = (statusGroup && !statusGroup.hidden && statusSelect)
        ? statusSelect.value
        : 'Active';
    const currentUser = await getCurrentUser();
    const therapistId = currentUser ? currentUser.therapistId : null;
    const clients = getData(STORAGE_KEYS.clients) || [];

    if (!therapistId) {
        alert('Unable to determine user session. Please log in again.');
        window.location.href = 'login.html';
        return;
    }

    if (editingClientId) {
        const idx = clients.findIndex(c => c.id === editingClientId);
        if (idx !== -1) {
            clients[idx] = {
                ...clients[idx],
                name,
                email,
                issue,
                phone,
                dateOfBirth,
                emergencyContact,
                status
            };
            setData(STORAGE_KEYS.clients, clients);
        }
        editingClientId = null;
    } else {
        const newClient = {
            id: 'c' + Date.now(),
            name,
            email,
            phone,
            therapistId,
            dateOfBirth,
            emergencyContact,
            issue,
            lastVisit: null,
            status: 'Active'
        };
        clients.unshift(newClient);
        setData(STORAGE_KEYS.clients, clients);
    }

    closeModals();
    renderAll();
    refreshClientsPage();
}

function editClient(id) {
    const clients = getData(STORAGE_KEYS.clients) || [];
    const client = clients.find(c => c.id === id);
    if (!client) return;

    editingClientId = id;
    openModal('client-modal', { skipClientFormReset: true });

    document.getElementById('client-modal-title').innerHTML = '<i class="fas fa-pen" style="color:var(--primary)"></i> Edit Client';
    document.getElementById('client-form-submit').textContent = 'Update Client';
    document.getElementById('c_name').value = client.name || '';
    document.getElementById('c_email').value = client.email || '';
    const phoneEl = document.getElementById('c_phone');
    if (phoneEl) phoneEl.value = client.phone || '';
    const dobEl = document.getElementById('c_dob');
    if (dobEl) dobEl.value = client.dateOfBirth || '';
    const emEl = document.getElementById('c_emergency');
    if (emEl) emEl.value = client.emergencyContact || '';

    const issueSelect = document.getElementById('c_issue');
    const optionValues = Array.from(issueSelect.options).map(o => o.value);
    if (!optionValues.includes(client.issue)) {
        const opt = document.createElement('option');
        opt.value = client.issue;
        opt.text = client.issue;
        issueSelect.appendChild(opt);
    }
    issueSelect.value = client.issue;

    const statusGroup = document.getElementById('client-status-group');
    const statusSelect = document.getElementById('c_status');
    if (statusGroup) statusGroup.hidden = false;
    if (statusSelect) statusSelect.value = client.status === 'Inactive' ? 'Inactive' : 'Active';
}

async function handleAddNote(e) {
    e.preventDefault();
    const clientId = document.getElementById('n_client_id').value;
    const date = document.getElementById('n_date').value;
    const content = document.getElementById('n_content').value;
    const currentUser = await getCurrentUser();
    const therapistId = currentUser ? currentUser.therapistId : null;

    if(!clientId || !content) { alert("Please select a client and write notes"); return; }
    if (!therapistId) { alert('Session expired, please log in again.'); window.location.href = 'login.html'; return; }

    const newNote = { id: 'n' + Date.now(), clientId, therapistId, date, content };
    
    const notes = getData(STORAGE_KEYS.notes) || [];
    notes.unshift(newNote);
    setData(STORAGE_KEYS.notes, notes);

    closeModals();
    renderAll();
}

async function handleAddSession(e) {
    e.preventDefault();
    const date = document.getElementById('s_date').value;
    const time = document.getElementById('s_time').value;
    const clientId = document.getElementById('s_client_id').value;
    const currentUser = await getCurrentUser();
    const therapistId = currentUser ? currentUser.therapistId : null;

    if (!clientId) {
        alert('Please add a client before booking a session.');
        return;
    }

    // Check conflict
    const schedule = getData(STORAGE_KEYS.schedule) || [];
    const clients = getData(STORAGE_KEYS.clients) || [];
    const conflict = schedule.find(s => s.date === date && s.time === time && s.therapistId === therapistId);
    if (conflict) {
        const who = clients.find(c => c.id === conflict.clientId);
        alert('This slot is already booked' + (who ? ' for ' + who.name + '.' : '.'));
        return;
    }

    if (!therapistId) { alert('Session expired, please log in again.'); window.location.href = 'login.html'; return; }
    const newSession = { id: 's' + Date.now(), date, time, clientId, therapistId, status: 'confirmed' };
    schedule.push(newSession);
    setData(STORAGE_KEYS.schedule, schedule);

    closeModals();
    renderAll();
}

// --- DELETE LOGIC ---

function deleteClient(id) {
    if(confirm("Are you sure you want to delete this client record? This cannot be undone.")) {
        let clients = getData(STORAGE_KEYS.clients) || [];
        clients = clients.filter(c => c.id !== id);
        setData(STORAGE_KEYS.clients, clients);

        let schedule = getData(STORAGE_KEYS.schedule) || [];
        schedule = schedule.filter(s => s.clientId !== id);
        setData(STORAGE_KEYS.schedule, schedule);

        let notes = getData(STORAGE_KEYS.notes) || [];
        notes = notes.filter(n => n.clientId !== id);
        setData(STORAGE_KEYS.notes, notes);

        renderAll();
        if (document.getElementById('clients-app-main')) {
            const q = new URLSearchParams(location.search).get('id');
            if (q === id) {
                window.location.href = 'clients.html';
                return;
            }
            refreshClientsPage();
        }
    }
}

function deleteNote(id) {
    let notes = getData(STORAGE_KEYS.notes) || [];
    notes = notes.filter(n => n.id !== id);
    setData(STORAGE_KEYS.notes, notes);
    if (document.getElementById('dashboard')) {
        renderAll();
    } else if (document.getElementById('notes-app-main')) {
        if (notesPageEditingNoteId === id) {
            newNotesPageNote();
        } else {
            renderNotesTimeline(notesPageSelectedClientId);
        }
    }
}

function deleteSession(id) {
    if(confirm("Cancel this appointment?")) {
        let schedule = getData(STORAGE_KEYS.schedule) || [];
        schedule = schedule.filter(s => s.id !== id);
        setData(STORAGE_KEYS.schedule, schedule);
        renderAll();
    }
}

// --- NOTES PAGE (notes.html) ---
let notesPageSelectedClientId = null;
let notesPageEditingNoteId = null;
let notesSpeechRecognition = null;
let notesDictationActive = false;
let notesDictationInterim = '';

function applyDashboardTabFromUrl() {
    const tab = new URLSearchParams(window.location.search).get('tab');
    if (!tab || tab === 'dashboard') return;
    if (tab === 'clients') {
        window.location.replace('clients.html');
        return;
    }
    if (tab !== 'schedule') return;
    const btn = Array.from(document.querySelectorAll('.nav-btn')).find(b => {
        const oc = b.getAttribute('onclick') || '';
        return oc.includes("'schedule'");
    });
    switchTab('schedule', btn || null);
}

function rteCommand(cmd, val) {
    const ed = document.getElementById('note-editor-body');
    if (!ed) return;
    ed.focus();
    try {
        document.execCommand(cmd, false, val != null ? val : null);
    } catch (e) { /* deprecated API; ignore */ }
}

function setEditorHtml(el, content) {
    if (!el) return;
    if (!content || !String(content).trim()) {
        el.innerHTML = '';
        return;
    }
    const s = String(content).trim();
    if (s.startsWith('<')) {
        el.innerHTML = content;
    } else {
        el.innerHTML = '<p>' + escapeHtml(content).replace(/\n/g, '</p><p>') + '</p>';
    }
}

function notePreviewPlain(htmlOrText) {
    const div = document.createElement('div');
    div.innerHTML = htmlOrText || '';
    const t = (div.textContent || '').trim();
    return t.length > 180 ? t.slice(0, 177) + '…' : t;
}

function htmlToPlainText(html) {
    const div = document.createElement('div');
    div.innerHTML = html || '';
    return (div.innerText || '').trim();
}

function sanitizeFileName(name) {
    return String(name || 'file')
        .replace(/[^a-z0-9_\-\.]/gi, '_')
        .replace(/_+/g, '_')
        .replace(/^_+|_+$/g, '');
}

async function downloadNotesZip() {
    if (!notesPageSelectedClientId) {
        alert('Select a client first.');
        return;
    }
    const clients = getData(STORAGE_KEYS.clients) || [];
    const client = clients.find(function(c) { return c.id === notesPageSelectedClientId; });
    const notes = (getData(STORAGE_KEYS.notes) || []).filter(function(n) { return n.clientId === notesPageSelectedClientId; });
    if (!notes.length) {
        alert('There are no notes to download for this client.');
        return;
    }
    const zip = new JSZip();
    notes.slice().sort(function(a, b) { return new Date(a.date) - new Date(b.date); }).forEach(function(note, index) {
        const datePart = note.date || 'unknown-date';
        const fileName = 'note-' + datePart + '-' + String(index + 1).padStart(2, '0') + '.txt';
        const content = htmlToPlainText(note.content) || '(No text content)';
        zip.file(fileName, content);
    });
    const downloadName = sanitizeFileName(client ? client.name : 'client-notes') + '-notes.zip';
    try {
        const blob = await zip.generateAsync({ type: 'blob' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = downloadName;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    } catch (err) {
        console.error('Failed to build ZIP file', err);
        alert('Unable to create the ZIP file. Please try again.');
    }
}

// --- CLIENTS PAGE (clients.html) ---

function detailFieldDisplay(val) {
    if (val == null || String(val).trim() === '') return '—';
    return String(val);
}

function formatClientDetailDate(iso) {
    if (!iso) return '—';
    try {
        return new Date(iso + 'T12:00:00').toLocaleDateString('en-US', {
            weekday: 'short',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    } catch (err) {
        return String(iso);
    }
}

function refreshClientsPage() {
    if (!document.getElementById('clients-app-main')) return;
    const id = new URLSearchParams(location.search).get('id');
    if (id) {
        renderClientDetailView(id);
    } else {
        renderClientsListView();
    }
}

function renderClientsListView() {
    const listEl = document.getElementById('clients-list-view');
    const detEl = document.getElementById('clients-detail-view');
    if (!listEl || !detEl) return;
    listEl.hidden = false;
    detEl.hidden = true;
    let clients = getData(STORAGE_KEYS.clients) || [];
    const needle = getSearchNeedle('clients-search-input');
    if (needle) {
        clients = clients.filter(function(c) { return clientMatchesSearch(c, needle); });
    }
    renderClientTable(clients);
}

function renderClientDetailView(clientId) {
    const listEl = document.getElementById('clients-list-view');
    const detEl = document.getElementById('clients-detail-view');
    const clients = getData(STORAGE_KEYS.clients) || [];
    const client = clients.find(c => c.id === clientId);
    if (!listEl || !detEl) return;

    if (!client) {
        listEl.hidden = false;
        detEl.hidden = true;
        renderClientTable(clients);
        alert('Client not found.');
        if (history.replaceState) {
            history.replaceState({}, '', 'clients.html');
        }
        return;
    }

    listEl.hidden = true;
    detEl.hidden = false;

    const bc = document.getElementById('client-detail-breadcrumb');
    if (bc) {
        bc.innerHTML = '<a href="clients.html" class="breadcrumb-link">Clients</a><span class="breadcrumb-sep" aria-hidden="true">/</span><span class="breadcrumb-current">' + escapeHtml(client.name) + '</span>';
    }

    const title = document.getElementById('client-detail-title');
    const sub = document.getElementById('client-detail-subtitle');
    if (title) title.textContent = client.name;
    if (sub) {
        sub.textContent = (client.status === 'Active' ? 'Active client' : 'Inactive client') +
            ' · ' + (client.issue || 'Clinical record');
    }

    const schedule = getData(STORAGE_KEYS.schedule) || [];
    const notes = getData(STORAGE_KEYS.notes) || [];
    const sessionCount = schedule.filter(s => s.clientId === clientId).length;
    const noteCount = notes.filter(n => n.clientId === clientId).length;

    const avatarColors = ['#111111', '#333333', '#555555', '#777777', '#999999'];
    const colorIndex = (client.name || 'x').length % 5;
    const avatarColor = avatarColors[colorIndex];
    const initials = (client.name || '?').split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();

    const hero = document.getElementById('client-detail-hero');
    if (hero) {
        hero.innerHTML =
            '<div class="client-detail-avatar" style="background-color:' + avatarColor + '">' + escapeHtml(initials) + '</div>' +
            '<div class="client-detail-hero-text"><h3>' + escapeHtml(client.name) + '</h3><p>' + escapeHtml(client.email || '') + '</p></div>';
    }

    const dl = document.getElementById('client-detail-fields');
    if (dl) {
        const rows = [
            ['Full name', client.name],
            ['Email', client.email],
            ['Phone', detailFieldDisplay(client.phone)],
            ['Date of birth', client.dateOfBirth ? formatClientDetailDate(client.dateOfBirth) : '—'],
            ['Emergency contact', detailFieldDisplay(client.emergencyContact)],
            ['Primary issue / focus', client.issue],
            ['Clinical status', client.status],
            ['Last documented visit', client.lastVisit ? formatClientDetailDate(client.lastVisit) : 'Never'],
            ['Scheduled sessions (total)', String(sessionCount)],
            ['Clinical notes on file', String(noteCount)],
            ['Record ID', client.id]
        ];
        dl.innerHTML = rows.map(function(row, i) {
            const ddClass = i === rows.length - 1 ? ' class="mono"' : '';
            const ddVal = row[1] == null ? '—' : String(row[1]);
            return '<dt>' + escapeHtml(row[0]) + '</dt><dd' + ddClass + '>' + escapeHtml(ddVal) + '</dd>';
        }).join('');
    }

    const notesLink = document.getElementById('client-detail-notes-link');
    if (notesLink) {
        notesLink.href = 'notes.html?client=' + encodeURIComponent(clientId);
    }

    const editBtn = document.getElementById('client-detail-edit-btn');
    if (editBtn) {
        editBtn.onclick = function() { editClient(clientId); };
    }

    const delBtn = document.getElementById('client-detail-delete-btn');
    if (delBtn) {
        delBtn.onclick = function() { deleteClient(clientId); };
    }
}

async function initClientsPage() {
    if (!localStorage.getItem('loggedInUser')) {
        window.location.href = 'login.html';
        return;
    }
    await initUserArea();
    loadData().then(() => {
        refreshClientsPage();
        bindClientsSearchIfPresent();
    });
}

function bindClientsSearchIfPresent() {
    const el = document.getElementById('clients-search-input');
    if (!el || el.dataset.searchBound) return;
    el.dataset.searchBound = '1';
    el.addEventListener('input', function() {
        if (!document.getElementById('clients-list-view') || document.getElementById('clients-list-view').hidden) return;
        renderClientsListView();
    });
}

async function initNotesSpeechRecognition() {
    const button = document.getElementById('notes-btn-dictate');
    const status = document.getElementById('dictate-status');
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        if (button) {
            button.disabled = true;
            button.title = 'Speech dictation is not supported in this browser.';
        }
        if (status) {
            status.textContent = 'Voice dictation unavailable in this browser.';
        }
        return;
    }

    notesSpeechRecognition = new SpeechRecognition();
    notesSpeechRecognition.lang = 'en-US';
    notesSpeechRecognition.interimResults = true;
    notesSpeechRecognition.continuous = true;
    notesSpeechRecognition.maxAlternatives = 1;

    notesSpeechRecognition.addEventListener('result', function(event) {
        let transcript = '';
        for (let i = event.resultIndex; i < event.results.length; i += 1) {
            const result = event.results[i];
            if (result.isFinal) {
                transcript += result[0].transcript;
            } else {
                notesDictationInterim = result[0].transcript;
            }
        }
        if (transcript) {
            appendDictationText(transcript + ' ');
            notesDictationInterim = '';
        }
        updateDictationStatus('Listening...');
    });

    notesSpeechRecognition.addEventListener('end', function() {
        if (notesDictationActive) {
            try {
                notesSpeechRecognition.start();
                updateDictationStatus('Listening...');
            } catch (err) {
                notesDictationActive = false;
                updateDictationButton();
                updateDictationStatus('Dictation stopped. Tap the microphone to restart.');
            }
        }
    });

    notesSpeechRecognition.addEventListener('error', function(event) {
        notesDictationActive = false;
        updateDictationButton();
        updateDictationStatus('Dictation error: ' + (event.error || 'unknown issue'));
    });

    updateDictationStatus('Tap the microphone to start dictation.');
}

function updateDictationButton() {
    const button = document.getElementById('notes-btn-dictate');
    if (!button) return;
    if (notesDictationActive) {
        button.classList.add('active');
        button.title = 'Stop dictation';
    } else {
        button.classList.remove('active');
        button.title = 'Start dictation';
    }
}

function updateDictationStatus(message) {
    const status = document.getElementById('dictate-status');
    if (status) status.textContent = message;
}

function appendDictationText(text) {
    const editor = document.getElementById('note-editor-body');
    if (!editor) return;
    editor.focus();
    const sel = window.getSelection();
    if (sel && sel.rangeCount) {
        const range = sel.getRangeAt(0);
        if (!editor.contains(range.commonAncestorContainer)) {
            editor.focus();
        }
        range.deleteContents();
        const node = document.createTextNode(text);
        range.insertNode(node);
        range.setStartAfter(node);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
    } else {
        editor.appendChild(document.createTextNode(text));
    }
}

function startDictation() {
    if (!notesSpeechRecognition) return;
    notesDictationActive = true;
    updateDictationButton();
    try {
        notesSpeechRecognition.start();
        updateDictationStatus('Listening... Speak now.');
    } catch (err) {
        notesDictationActive = false;
        updateDictationButton();
        updateDictationStatus('Unable to start dictation. Try again.');
    }
}

function stopDictation() {
    if (!notesSpeechRecognition) return;
    notesDictationActive = false;
    updateDictationButton();
    notesSpeechRecognition.stop();
    updateDictationStatus('Dictation stopped.');
}

function toggleDictation() {
    if (!notesSpeechRecognition) {
        initNotesSpeechRecognition();
        if (!notesSpeechRecognition) return;
    }
    if (notesDictationActive) {
        stopDictation();
    } else {
        startDictation();
    }
}

async function initNotesPage() {
    if (!localStorage.getItem('loggedInUser')) {
        window.location.href = 'login.html';
        return;
    }
    await initUserArea();
    loadData().then(() => {
        const clients = getData(STORAGE_KEYS.clients) || [];
        const pre = new URLSearchParams(location.search).get('client');
        if (pre && clients.some(c => c.id === pre)) {
            selectNotesClient(pre);
        } else if (clients.length) {
            selectNotesClient(clients[0].id);
        } else {
            selectNotesClient(null);
        }
        bindNotesSearchIfPresent();
        initNotesSpeechRecognition();
    });
}

function initLogin() {
    console.log('initLogin called');
    const loginError = document.getElementById('login-error');
    const loginForm = document.getElementById('login-form');
    console.log('loginForm found:', !!loginForm, 'loginError found:', !!loginError);
    if (!loginForm) return;

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        console.log('Login form submitted');
        try {
            if (loginError) {
                loginError.style.display = 'none';
            }

            await initDatabase().catch((err) => {
                console.error('Database init error:', err);
                if (loginError) {
                    loginError.style.display = 'block';
                    loginError.textContent = 'Unable to initialize authentication database.';
                }
            });
            if (!db) {
                console.log('DB is still null after init');
                return;
            }

            const username = document.getElementById('username').value.trim();
            const password = document.getElementById('password').value;
            console.log('Username/password entered:', username ? 'yes' : 'no');
            
            if (!username || !password) {
                if (loginError) {
                    loginError.style.display = 'block';
                    loginError.textContent = 'Please enter both username and password';
                }
                return;
            }

            const user = querySingle('SELECT * FROM users WHERE username = ? AND password = ?', [username, password]);
            console.log('Query returned user:', !!user);
            
            if (user) {
                localStorage.setItem('loggedInUser', username);
                currentUserCache = user;
                console.log('Login successful');
                window.location.href = 'dashboard.html';
            } else if (loginError) {
                loginError.style.display = 'block';
                loginError.textContent = 'Invalid username or password';
            }
        } catch (err) {
            console.error('Login error:', err);
            if (loginError) {
                loginError.style.display = 'block';
                loginError.textContent = 'An error occurred during login';
            }
        }
    });
}

function initSignup() {
    const signupError = document.getElementById('signup-error');
    const signupForm = document.getElementById('signup-form');
    if (!signupForm) return;

    signupForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (signupError) {
            signupError.style.display = 'none';
        }

        await initDatabase().catch((err) => {
            if (signupError) {
                signupError.style.display = 'block';
                signupError.textContent = 'Unable to initialize authentication database.';
            }
            console.error(err);
        });
        if (!db) return;

        const fullName = document.getElementById('signup-full-name').value.trim();
        const email = document.getElementById('signup-email').value.trim();
        const username = document.getElementById('signup-username').value.trim();
        const password = document.getElementById('signup-password').value;
        const confirmPassword = document.getElementById('signup-confirm-password').value;
        const role = document.getElementById('signup-role').value;

        if (!fullName || !email || !username || !password || !confirmPassword) {
            if (signupError) {
                signupError.style.display = 'block';
                signupError.textContent = 'Please complete all fields';
            }
            return;
        }

        if (password !== confirmPassword) {
            if (signupError) {
                signupError.style.display = 'block';
                signupError.textContent = 'Passwords do not match';
            }
            return;
        }

        if (password.length < 6) {
            if (signupError) {
                signupError.style.display = 'block';
                signupError.textContent = 'Password must be at least 6 characters';
            }
            return;
        }

        // Check if username already exists
        const existingUser = querySingle(`SELECT * FROM users WHERE username = ?`, [username]);
        if (existingUser) {
            if (signupError) {
                signupError.style.display = 'block';
                signupError.textContent = 'Username already exists';
            }
            return;
        }

        // Check if email already exists
        const existingEmail = querySingle(`SELECT * FROM users WHERE email = ?`, [email]);
        if (existingEmail) {
            if (signupError) {
                signupError.style.display = 'block';
                signupError.textContent = 'Email already exists';
            }
            return;
        }

        // Generate unique therapistId
        const therapistId = generateTherapistId();

        // Insert new user
        const stmt = db.prepare('INSERT INTO users (therapistId, username, password, full_name, email, role) VALUES (?, ?, ?, ?, ?, ?)');
        stmt.run([therapistId, username, password, fullName, email, role]);
        stmt.free();

        const dbData = db.export();
        localStorage.setItem('carespace_db', JSON.stringify(Array.from(dbData)));

        localStorage.setItem('loggedInUser', username);
        currentUserCache = {
            therapistId,
            username,
            password,
            full_name: fullName,
            email,
            role
        };

        window.location.href = 'dashboard.html';
    });
}

function initAdmin() {
    initDatabase().then(() => {
        loadUsersTable();
        
        document.getElementById('add-user-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const fullName = document.getElementById('add-full-name').value.trim();
            const email = document.getElementById('add-email').value.trim();
            const username = document.getElementById('add-username').value.trim();
            const password = document.getElementById('add-password').value;
            const role = document.getElementById('add-role').value;
            
            if (password.length < 6) {
                document.getElementById('add-user-error').style.display = 'block';
                document.getElementById('add-user-error').textContent = 'Password must be at least 6 characters';
                return;
            }
            
            // Check if username already exists
            const existingUser = querySingle(`SELECT * FROM users WHERE username = ?`, [username]);
            if (existingUser) {
                document.getElementById('add-user-error').style.display = 'block';
                document.getElementById('add-user-error').textContent = 'Username already exists';
                return;
            }
            
            // Check if email already exists
            const existingEmail = querySingle(`SELECT * FROM users WHERE email = ?`, [email]);
            if (existingEmail) {
                document.getElementById('add-user-error').style.display = 'block';
                document.getElementById('add-user-error').textContent = 'Email already exists';
                return;
            }
            
            // Generate unique therapistId
            const therapistId = generateTherapistId();
            
            // Insert new user
            const stmt = db.prepare('INSERT INTO users (therapistId, username, password, full_name, email, role) VALUES (?, ?, ?, ?, ?, ?)');
            stmt.run([therapistId, username, password, fullName, email, role]);
            stmt.free();
            
            const dbData = db.export();
            localStorage.setItem('carespace_db', JSON.stringify(Array.from(dbData)));
            
            // Clear form
            document.getElementById('add-user-form').reset();
            document.getElementById('add-user-error').style.display = 'none';
            
            // Reload table
            loadUsersTable();
        });
    });
}

async function loadUsersTable() {
    const users = await getAllUsers();
    const tbody = document.getElementById('users-tbody');
    tbody.innerHTML = '';
    users.forEach(user => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${user.id}</td>
            <td>${user.therapistId}</td>
            <td>${user.username}</td>
            <td>${user.full_name}</td>
            <td>${user.email}</td>
            <td>${user.role}</td>
        `;
        tbody.appendChild(row);
    });
}

function bindNotesSearchIfPresent() {
    const el = document.getElementById('notes-search-input');
    if (!el || el.dataset.searchBound) return;
    el.dataset.searchBound = '1';
    el.addEventListener('input', function() {
        renderNotesClientList();
        renderNotesTimeline(notesPageSelectedClientId);
    });
}

function renderNotesClientList() {
    const ul = document.getElementById('notes-client-list');
    if (!ul) return;
    const allClients = getData(STORAGE_KEYS.clients) || [];
    const needle = getSearchNeedle('notes-search-input');
    let clients = allClients;
    if (needle) {
        clients = allClients.filter(function(c) { return clientMatchesSearch(c, needle); });
    }
    ul.innerHTML = '';
    if (!allClients.length) {
        ul.innerHTML = '<li style="padding:12px 18px;color:#999;font-size:13px;">No clients yet. Add one from the dashboard.</li>';
        return;
    }
    if (!clients.length) {
        ul.innerHTML = '<li style="padding:12px 18px;color:#999;font-size:13px;">No clients match your search.</li>';
        return;
    }
    clients.forEach(c => {
        const li = document.createElement('li');
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'notes-client-item' + (notesPageSelectedClientId === c.id ? ' is-selected' : '');
        btn.textContent = c.name;
        btn.dataset.clientId = c.id;
        btn.onclick = function() { selectNotesClient(c.id); };
        li.appendChild(btn);
        ul.appendChild(li);
    });
}

function selectNotesClient(clientId) {
    notesPageSelectedClientId = clientId;
    notesPageEditingNoteId = null;
    renderNotesClientList();
    const clients = getData(STORAGE_KEYS.clients) || [];
    const client = clients.find(function(c) { return c.id === clientId; });
    const label = document.getElementById('notes-editor-client-label');
    if (label) {
        label.textContent = client ? 'Note — ' + client.name : 'Note';
    }
    const hint = document.getElementById('notes-timeline-hint');
    if (hint) {
        hint.style.display = clientId ? 'none' : '';
    }
    newNotesPageNote();
}

async function newNotesPageNote() {
    notesPageEditingNoteId = null;
    const dt = document.getElementById('note-editor-date');
    const ed = document.getElementById('note-editor-body');
    if (dt) dt.value = localDateString();
    if (ed) {
        const client = (getData(STORAGE_KEYS.clients) || []).find(function(c) { return c.id === notesPageSelectedClientId; });
        ed.innerHTML = buildNotesEditorDefaultContent(client);
    }
    renderNotesTimeline(notesPageSelectedClientId);
}

function buildNotesEditorDefaultContent(client) {
    if (!client) return '';
    const notesForClient = (getData(STORAGE_KEYS.notes) || []).filter(function(n) { return n.clientId === client.id; });
    const sessionNumber = notesForClient.length + 1;
    const clientInfo = [];
    clientInfo.push('<p><strong>Client:</strong> ' + escapeHtml(client.name) + '</p>');
    clientInfo.push('<p><strong>Session:</strong> ' + escapeHtml(String(sessionNumber)) + '</p>');
    if (client.issue) {
        clientInfo.push('<p><strong>Presenting issue:</strong> ' + escapeHtml(client.issue) + '</p>');
    }
    clientInfo.push('<p><strong>Session date:</strong> ' + escapeHtml(localDateString()) + '</p>');
    clientInfo.push('<p>&nbsp;</p>');
    return clientInfo.join('');
}

function renderNotesTimeline(clientId) {
    const container = document.getElementById('notes-timeline');
    if (!container) return;
    container.innerHTML = '';
    if (!clientId) {
        container.innerHTML = '<p class="notes-timeline-hint">Add a client from the dashboard to keep notes.</p>';
        return;
    }
    const allNotes = (getData(STORAGE_KEYS.notes) || []).filter(function(n) { return n.clientId === clientId; });
    if (!allNotes.length) {
        container.innerHTML = '<p class="notes-timeline-hint">No notes yet for this client. Write one in the editor and save.</p>';
        return;
    }
    const needle = getSearchNeedle('notes-search-input');
    const clients = getData(STORAGE_KEYS.clients) || [];
    let sorted = allNotes.slice().sort(function(a, b) { return new Date(b.date) - new Date(a.date); });
    if (needle) {
        sorted = sorted.filter(function(n) { return noteMatchesSearch(n, clients, needle); });
    }
    if (!sorted.length) {
        container.innerHTML = '<p class="notes-timeline-hint">No notes match your search for this client.</p>';
        return;
    }
    sorted.forEach(function(note) {
        const active = note.id === notesPageEditingNoteId;
        const wrap = document.createElement('div');
        wrap.className = 'notes-timeline-item' + (active ? ' is-active' : '');
        const dateStr = new Date(note.date + 'T12:00:00').toLocaleDateString('en-US', {
            weekday: 'short', year: 'numeric', month: 'short', day: 'numeric'
        });
        wrap.innerHTML =
            '<div class="notes-timeline-dot"></div>' +
            '<div class="notes-timeline-card" role="button" tabindex="0">' +
            '<div class="notes-timeline-date">' + escapeHtml(dateStr) + '</div>' +
            '<div class="notes-timeline-preview">' + escapeHtml(notePreviewPlain(note.content)) + '</div>' +
            '<div class="notes-timeline-actions">' +
            '<button type="button" class="btn-text" data-edit="' + escapeHtml(note.id) + '"><i class="fas fa-pen"></i> Edit</button>' +
            '<button type="button" class="btn-text" data-del="' + escapeHtml(note.id) + '"><i class="fas fa-trash"></i> Delete</button>' +
            '</div></div>';
        const card = wrap.querySelector('.notes-timeline-card');
        function openEdit() { openNoteInEditor(note.id); }
        card.addEventListener('click', function(e) {
            if (e.target.closest('[data-del]')) return;
            if (e.target.closest('[data-edit]')) {
                openEdit();
                return;
            }
            openEdit();
        });
        wrap.querySelector('[data-edit]').addEventListener('click', function(e) {
            e.stopPropagation();
            openEdit();
        });
        wrap.querySelector('[data-del]').addEventListener('click', function(e) {
            e.stopPropagation();
            if (confirm('Delete this note permanently?')) {
                deleteNote(note.id);
            }
        });
        container.appendChild(wrap);
    });
}

function openNoteInEditor(noteId) {
    const notes = getData(STORAGE_KEYS.notes) || [];
    const note = notes.find(function(n) { return n.id === noteId; });
    if (!note) return;
    notesPageEditingNoteId = noteId;
    const dateEl = document.getElementById('note-editor-date');
    const bodyEl = document.getElementById('note-editor-body');
    if (dateEl) dateEl.value = note.date;
    setEditorHtml(bodyEl, note.content);
    renderNotesTimeline(notesPageSelectedClientId);
}

async function saveNotesPageNote() {
    if (!notesPageSelectedClientId) {
        alert('Select a client first.');
        return;
    }
    const dateEl = document.getElementById('note-editor-date');
    const bodyEl = document.getElementById('note-editor-body');
    const currentUser = await getCurrentUser();
    const therapistId = currentUser ? currentUser.therapistId : null;
    if (!dateEl || !bodyEl) return;
    const date = dateEl.value;
    const html = bodyEl.innerHTML.trim();
    const plain = (bodyEl.textContent || '').trim();
    if (!date) {
        alert('Choose a session date.');
        return;
    }
    if (!plain) {
        alert('Write something in the note body.');
        return;
    }
    let notes = getData(STORAGE_KEYS.notes) || [];
    if (notesPageEditingNoteId) {
        const idx = notes.findIndex(function(n) { return n.id === notesPageEditingNoteId; });
        if (idx !== -1) {
            notes[idx] = Object.assign({}, notes[idx], {
                clientId: notesPageSelectedClientId,
                therapistId: therapistId,
                date: date,
                content: html
            });
        }
    } else {
        notes.unshift({
            id: 'n' + Date.now(),
            clientId: notesPageSelectedClientId,
            therapistId: therapistId,
            date: date,
            content: html
        });
    }
    setData(STORAGE_KEYS.notes, notes);
    notesPageEditingNoteId = null;
    bodyEl.innerHTML = '';
    dateEl.value = localDateString();
    renderNotesTimeline(notesPageSelectedClientId);
}

// Run after DOM is ready (script may load in <head> with or without defer).
async function bootCareSpace() {
    console.log('bootCareSpace started');
    if (document.getElementById('dashboard')) {
        console.log('Dashboard detected');
        await initApp();
        applyDashboardTabFromUrl();
    } else if (document.getElementById('clients-app-main')) {
        console.log('Clients page detected');
        initClientsPage();
    } else if (document.getElementById('notes-app-main')) {
        console.log('Notes page detected');
        initNotesPage();
    } else if (document.getElementById('signup-form')) {
        console.log('Signup form detected');
        initSignup();
    } else if (document.getElementById('login-form')) {
        console.log('Login form detected');
        initLogin();
    } else if (document.getElementById('add-user-form')) {
        console.log('Admin form detected');
        initAdmin();
    } else if (document.getElementById('schedule')) {
        console.log('Schedule detected');
        await initSchedulePage();
    } else {
        console.log('No recognized page elements found');
    }
}

if (document.readyState === 'loading') {
    console.log('DOM still loading...');
    document.addEventListener('DOMContentLoaded', bootCareSpace);
} else {
    console.log('DOM already loaded');
    bootCareSpace();
}

async function initInvoicesPage() {
    if (!localStorage.getItem('loggedInUser')) {
        window.location.href = 'login.html';
        return;
    }
    await initUserArea();
    await loadData();
    const currentUser = await getCurrentUser();
    if (currentUser && currentUser.role === 'Admin') {
        const adminLink = document.getElementById('admin-link');
        if (adminLink) adminLink.style.display = 'block';
    }
    renderInvoiceClientList(getData(STORAGE_KEYS.clients) || []);
    setDefaultInvoiceFields();
    await loadInvoicePaymentSettings();
    updateInvoicePreview();
}

function renderInvoiceClientList(clients) {
    const select = document.getElementById('invoice-client');
    if (!select) return;
    select.innerHTML = '<option value="">— Select a client —</option>';
    if (!clients.length) {
        select.innerHTML = '<option value="">No clients available yet</option>';
        return;
    }
    clients.forEach(function(client) {
        const option = document.createElement('option');
        option.value = client.id;
        option.textContent = client.name + (client.email ? ' — ' + client.email : '');
        select.appendChild(option);
    });
}

function setDefaultInvoiceFields() {
    const dateInput = document.getElementById('invoice-date');
    if (dateInput && !dateInput.value) {
        dateInput.value = localDateString();
    }
    const dueInput = document.getElementById('invoice-due-days');
    if (dueInput && !dueInput.value) {
        dueInput.value = '14';
    }
    const standardLayout = document.getElementById('layout-standard');
    if (standardLayout) {
        standardLayout.checked = true;
    }
}

async function loadInvoicePaymentSettings() {
    const user = await getCurrentUser();
    if (!user) return;

    const bankName = document.getElementById('payment-bank-name');
    const bankAccountName = document.getElementById('payment-bank-account-name');
    const bankSort = document.getElementById('payment-bank-sort-code');
    const bankAccountNumber = document.getElementById('payment-bank-account-number');
    const paypalUrl = document.getElementById('payment-paypal-url');
    const defaultText = document.getElementById('payment-default-text');
    const customPayment = document.getElementById('invoice-payment-custom');

    if (bankName) bankName.value = user.bank_name || '';
    if (bankAccountName) bankAccountName.value = user.bank_account_name || '';
    if (bankSort) bankSort.value = user.bank_sort_code || '';
    if (bankAccountNumber) bankAccountNumber.value = user.bank_account_number || '';
    if (paypalUrl) paypalUrl.value = user.paypal_url || '';
    if (defaultText) defaultText.value = user.default_payment_text || '';
    if (customPayment && !customPayment.value.trim()) {
        customPayment.value = user.default_payment_text || '';
    }

    updateInvoicePaymentOptionLabels(user);

    const saveBtn = document.getElementById('save-payment-settings');
    if (saveBtn) {
        saveBtn.addEventListener('click', saveCurrentUserPaymentSettings);
    }
}

async function saveCurrentUserPaymentSettings() {
    const user = await getCurrentUser();
    if (!user) return;

    const bankName = document.getElementById('payment-bank-name')?.value.trim() || null;
    const bankAccountName = document.getElementById('payment-bank-account-name')?.value.trim() || null;
    const bankSort = document.getElementById('payment-bank-sort-code')?.value.trim() || null;
    const bankAccountNumber = document.getElementById('payment-bank-account-number')?.value.trim() || null;
    const paypalUrl = document.getElementById('payment-paypal-url')?.value.trim() || null;
    const defaultText = document.getElementById('payment-default-text')?.value.trim() || null;

    const stmt = db.prepare('UPDATE users SET bank_name=?, bank_account_name=?, bank_sort_code=?, bank_account_number=?, paypal_url=?, default_payment_text=? WHERE therapistId = ?');
    stmt.run([bankName, bankAccountName, bankSort, bankAccountNumber, paypalUrl, defaultText, user.therapistId]);
    stmt.free();

    currentUserCache = Object.assign({}, user, {
        bank_name: bankName,
        bank_account_name: bankAccountName,
        bank_sort_code: bankSort,
        bank_account_number: bankAccountNumber,
        paypal_url: paypalUrl,
        default_payment_text: defaultText
    });

    const dbData = db.export();
    localStorage.setItem('carespace_db', JSON.stringify(Array.from(dbData)));

    updateInvoicePaymentOptionLabels(currentUserCache);
    updateInvoicePreview();

    const status = document.getElementById('payment-settings-status');
    if (status) {
        status.textContent = 'Payment settings saved.';
    }
}

function updateInvoicePaymentOptionLabels(user) {
    const bankInput = document.querySelector('#invoice-payments input[value="bank"]');
    const paypalInput = document.querySelector('#invoice-payments input[value="paypal"]');

    if (bankInput) {
        const bankParts = [];
        if (user.bank_name) bankParts.push(user.bank_name);
        if (user.bank_account_name) bankParts.push('Account name ' + user.bank_account_name);
        if (user.bank_sort_code) bankParts.push('sort code ' + user.bank_sort_code);
        if (user.bank_account_number) bankParts.push('account ' + user.bank_account_number);
        bankInput.dataset.label = bankParts.length
            ? 'Bank transfer to ' + bankParts.join(', ')
            : 'Bank transfer to sort code 20-00-00, account 12345678';
    }
    if (paypalInput) {
        paypalInput.dataset.label = user.paypal_url
            ? 'PayPal payment available at ' + user.paypal_url
            : 'PayPal payment available at paypal.me/YourPractice';
    }
}

function getInvoiceData() {
    const clients = getData(STORAGE_KEYS.clients) || [];
    const clientId = document.getElementById('invoice-client')?.value || '';
    const client = clients.find(function(c) { return c.id === clientId; }) || null;
    const date = document.getElementById('invoice-date')?.value || localDateString();
    const dueDays = Number(document.getElementById('invoice-due-days')?.value || 14);
    const service = document.getElementById('invoice-service')?.value.trim() || 'Therapy session';
    const quantity = Number(document.getElementById('invoice-quantity')?.value || 1);
    const rate = Number(document.getElementById('invoice-rate')?.value || 0);
    const notes = document.getElementById('invoice-notes')?.value.trim() || '';
    const layout = document.querySelector('input[name="invoice-layout"]:checked')?.value || 'standard';
    const paymentOptions = [];
    document.querySelectorAll('#invoice-payments input[type="checkbox"]').forEach(function(input) {
        if (input.checked) {
            const label = input.dataset.label || input.value;
            paymentOptions.push(label);
        }
    });
    const customPayment = document.getElementById('invoice-payment-custom')?.value.trim();
    if (customPayment) {
        paymentOptions.push(customPayment);
    }
    const defaultPaymentText = currentUserCache?.default_payment_text || '';
    return { client, date, dueDays, service, quantity, rate, notes, layout, paymentOptions, defaultPaymentText };
}

function formatCurrency(value) {
    const amount = Number(value);
    if (Number.isNaN(amount)) return '£0.00';
    return '£' + amount.toFixed(2);
}

function buildInvoiceBody(data) {
    const therapistName = window.currentUserCache?.full_name || 'Dr. Therapist';
    const practiceName = window.currentUserCache?.bank_name || '';
    const clientName = data.client ? data.client.name : '[Client Name]';
    const invoiceNumber = (data.date || localDateString()).replace(/-/g, '') + (data.client ? ('-' + data.client.id.slice(-3).toUpperCase()) : '');
    const dueDate = new Date(data.date || localDateString());
    dueDate.setDate(dueDate.getDate() + data.dueDays);
    const dueDateLabel = localDateString(dueDate);
    const total = data.rate * data.quantity;
    const paymentLines = data.paymentOptions.length
        ? data.paymentOptions.map(function(item) { return '• ' + item; }).join('\n')
        : (data.defaultPaymentText ? data.defaultPaymentText : '• Bank transfer to sort code 20-00-00, account 12345678');

    let greeting = 'Hello ' + clientName + ',';
    let intro = 'Please find the invoice details below for our recent session.';
    if (data.layout === 'friendly') {
        greeting = 'Hi ' + clientName + ',';
        intro = 'I hope you are well. Here is the invoice for your recent session.';
    } else if (data.layout === 'formal') {
        greeting = 'Dear ' + clientName + ',';
        intro = 'Please find the invoice for your recent session below. Payment is due by ' + dueDateLabel + '.';
    }

    const signOff = practiceName ? `${therapistName}\n${practiceName}` : therapistName;

    return `${greeting}\n\n${intro}\n\nInvoice number: INV-${invoiceNumber}\nInvoice date: ${data.date}\nDue date: ${dueDateLabel}\n\nService: ${data.service}\nQuantity: ${data.quantity}\nRate: ${formatCurrency(data.rate)}\nTotal due: ${formatCurrency(total)}\n\nPayment options:\n${paymentLines}\n\n${data.notes ? 'Additional notes:\n' + data.notes + '\n\n' : ''}If you have any questions or require a receipt, please reply to this message.\n\nWarm regards,\n${signOff}\n`;
}

function updateInvoicePreview() {
    const data = getInvoiceData();
    const subjectEl = document.getElementById('invoice-subject');
    const previewEl = document.getElementById('invoice-preview');
    const statusEl = document.getElementById('copy-status');
    if (!subjectEl || !previewEl) return;

    if (!data.client) {
        subjectEl.value = 'Invoice from CareSpace Therapy';
        previewEl.value = 'Select a client to build the email content.';
        if (statusEl) statusEl.textContent = 'Choose a client to generate preview.';
        return;
    }

    const total = formatCurrency(data.rate * data.quantity);
    subjectEl.value = `Invoice for ${data.client.name} — ${total}`;
    previewEl.value = buildInvoiceBody(data);
    if (statusEl) statusEl.textContent = 'Preview updated.';
}

async function copyInvoiceToClipboard() {
    const previewEl = document.getElementById('invoice-preview');
    const statusEl = document.getElementById('copy-status');
    if (!previewEl) return;
    const text = previewEl.value || previewEl.textContent || previewEl.innerText || '';
    try {
        await navigator.clipboard.writeText(text);
        if (statusEl) statusEl.textContent = 'Email copied to clipboard.';
    } catch (err) {
        console.error('Clipboard copy failed:', err);
        if (statusEl) statusEl.textContent = 'Copy failed — use manual copy.';
        alert('Unable to copy automatically. Please select the email content and copy it manually.');
    }
}

// Expose utility for clearing stale cache
window.clearAuthCache = function() {
    localStorage.removeItem('carespace_db');
    localStorage.removeItem('loggedInUser');
    console.log('Auth cache cleared. Reload the page to reinitialize.');
};
console.log('Tip: Run clearAuthCache() in console to clear database cache');