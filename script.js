// --- CONFIGURATION ---
const SUPABASE_URL = 'https://tokedafadxogunwwetef.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRva2VkYWZhZHhvZ3Vud3dldGVmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU0Mzc4NTUsImV4cCI6MjA4MTAxMzg1NX0.HBS6hfKXt2g3oplwYoCg2t7qjqFyDMJvEmtlvgJSb3c';
const client = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// --- STATE ---
let transactions = [];
let currentPage = 0;
let isAdminMode = false;
let selectedType = 'income';
let displayedBalance = 0;
// NEW: Filter State
let currentFilter = 'all'; 

document.addEventListener('DOMContentLoaded', () => {
    fetchTransactions();
    setupRealtime(); 
    checkLoginSession();
    
    const dateInput = document.getElementById('tDate');
    if(dateInput) dateInput.valueAsDate = new Date();
});

// --- DATA FETCHING (Now with Filters!) ---
async function fetchTransactions(isLoadMore = false) {
    if (!isLoadMore) { 
        currentPage = 0; 
        document.getElementById('transList').innerHTML = ""; 
    }

    const from = currentPage * 10;
    const to = from + 9;

    // Start building the query
    let query = client
        .from('transactions')
        .select('*', { count: 'exact' })
        .order('date', { ascending: false })
        .order('id', { ascending: false });

    // APPLY FILTER LOGIC
    if (currentFilter === 'month') {
        const date = new Date();
        const firstDay = new Date(date.getFullYear(), date.getMonth(), 1).toISOString();
        query = query.gte('date', firstDay);
    } 
    else if (currentFilter === 'week') {
        const date = new Date();
        // Calculate start of the week (Sunday)
        const day = date.getDay();
        const diff = date.getDate() - day;
        const firstDay = new Date(date.setDate(diff)).toISOString();
        query = query.gte('date', firstDay);
    }

    // Apply range for pagination
    const { data, error, count } = await query.range(from, to);

    if (error) {
        console.error("Supabase Error:", error);
        return showToast("Error loading data");
    }

    transactions = isLoadMore ? [...transactions, ...data] : data;
    data.forEach(t => renderCard(t));
    
    // Always calculate TOTAL balance regardless of filter
    calculateBalance();
    
    if(document.getElementById('transCount')) {
        document.getElementById('transCount').innerText = `${count} records`;
    }
    
    const loadBtn = document.getElementById('loadMoreBtn');
    if(loadBtn) {
        loadBtn.style.display = (to >= count - 1) ? 'none' : 'block';
    }
}

// --- FILTER UI FUNCTIONS ---
function toggleFilterMenu() {
    const menu = document.getElementById('filterMenu');
    menu.classList.toggle('hidden');
}

function applyFilter(type) {
    currentFilter = type;
    
    // Update visual "Active" state of chips
    document.querySelectorAll('.filter-chip').forEach(btn => btn.classList.remove('active'));
    document.getElementById(`filter-${type}`).classList.add('active');
    
    // Refresh the list with the new filter
    fetchTransactions(false);
}

// --- STANDARD FUNCTIONS ---
function renderCard(t) {
    const list = document.getElementById('transList');
    const isIncome = t.type === 'income';
    const amountFmt = parseFloat(t.amount).toLocaleString('en-PH', { minimumFractionDigits: 2 });
    
    const card = document.createElement('div');
    card.className = 'trans-card';
    card.innerHTML = `
        <div class="t-left">
            <span class="t-id">#${t.id}</span>
            <span class="t-desc">${t.description}</span>
            <span class="t-date">${new Date(t.date).toLocaleDateString()}</span>
        </div>
        <div class="t-right" style="display:flex; align-items:center;">
            <span class="t-amount ${isIncome ? 'income' : 'expense'}">
                ${isIncome ? '+' : '-'}₱${amountFmt}
            </span>
            <button class="edit-icon" onclick="openEditModal(${t.id})">✎</button>
        </div>
    `;
    list.appendChild(card);
}

async function submitTransaction() {
    const id = document.getElementById('editId').value;
    const date = document.getElementById('tDate').value;
    const desc = document.getElementById('tDesc').value;
    const amount = document.getElementById('tAmount').value;
    const password = document.getElementById('adminPass').value; 

    if (!desc || !amount) return showToast("Please fill all fields");
    if (!password) return showToast("Please login again to save");

    const payload = { 
        id: id ? id : undefined, 
        date, 
        description: desc, 
        type: selectedType, 
        amount 
    };
    const action = id ? 'update' : 'create';

    try {
        const res = await fetch('/api/transaction', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action, payload, password })
        });
        const result = await res.json();
        if (result.success) {
            showToast("Success! Waiting for update...");
            closeModal('transModal');
        } else {
            showToast("Error: " + (result.message || result.error));
        }
    } catch (e) {
        showToast("Server Connection Failed");
    }
}

async function deleteTransaction() {
    const id = document.getElementById('editId').value;
    const password = document.getElementById('adminPass').value;
    if(!confirm("Are you sure?")) return;
    if (!password) return showToast("Please login again");

    try {
        const res = await fetch('/api/transaction', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'delete', payload: { id }, password })
        });
        const result = await res.json();
        if (result.success) {
            showToast("Deleted. Waiting for update...");
            closeModal('transModal');
        } else {
            showToast("Error deleting");
        }
    } catch (e) { showToast("Server Error"); }
}

function setupRealtime() {
    const channel = client.channel('public:transactions')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, () => {
        fetchTransactions(); 
    })
    .subscribe();
}

async function calculateBalance() {
    // Balance always calculates based on TOTAL history, ignoring filters
    const { data } = await client.from('transactions').select('amount, type');
    let total = 0;
    if(data) {
        data.forEach(t => {
            if(t.type === 'income') total += parseFloat(t.amount);
            else total -= parseFloat(t.amount);
        });
    }
    animateValue(displayedBalance, total, 2000); 
    displayedBalance = total;
}

function animateValue(start, end, duration) {
    if (start === end) return;
    const element = document.getElementById("displayBalance");
    let startTime = null;
    function step(timestamp) {
        if (!startTime) startTime = timestamp;
        const progress = Math.min((timestamp - startTime) / duration, 1);
        const easeOut = 1 - Math.pow(1 - progress, 3);
        const current = start + (end - start) * easeOut;
        element.innerHTML = current.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        if (progress < 1) window.requestAnimationFrame(step);
        else element.innerHTML = end.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    window.requestAnimationFrame(step);
}

function toggleAdminMode() {
    isAdminMode = !isAdminMode;
    const btn = document.getElementById('adminToggleBtn');
    const list = document.getElementById('transList');
    const controls = document.getElementById('adminControls');
    
    if (isAdminMode) {
        btn.innerText = "Admin Mode: ON";
        btn.style.color = "#22c55e";
        list.classList.add('admin-mode');
        if(controls) controls.classList.remove('hidden');
    } else {
        btn.innerText = "Admin Mode: OFF";
        btn.style.color = "#eab308";
        list.classList.remove('admin-mode');
        if(controls) controls.classList.add('hidden');
    }
}

async function downloadBackup() {
    if(!confirm("Download backup?")) return;
    const { data, error } = await client.from('transactions').select('*').order('id', { ascending: true });
    if (error) return showToast("Backup failed.");

    let csvContent = "ID,Date,Description,Type,Amount,Created At\n";
    data.forEach(row => {
        const cleanDesc = row.description ? row.description.replace(/"/g, '""') : ""; 
        csvContent += `${row.id},${row.date},"${cleanDesc}",${row.type},${row.amount},${row.created_at}\n`;
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `SHS_Treasury_Backup_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    showToast("Backup Downloaded! 📂");
}

function openTransactionModal() {
    document.getElementById('modalTitle').innerText = "New Transaction";
    document.getElementById('editId').value = "";
    document.getElementById('tDesc').value = "";
    document.getElementById('tAmount').value = "";
    document.getElementById('deleteBtn').classList.add('hidden');
    setTransType('income');
    document.getElementById('transModal').style.display = 'flex';
}

function openEditModal(id) {
    const t = transactions.find(x => x.id === id);
    if(!t) return;
    document.getElementById('modalTitle').innerText = `Edit Transaction #${id}`;
    document.getElementById('editId').value = id;
    document.getElementById('tDate').value = t.date;
    document.getElementById('tDesc').value = t.description;
    document.getElementById('tAmount').value = t.amount;
    document.getElementById('deleteBtn').classList.remove('hidden');
    setTransType(t.type);
    document.getElementById('transModal').style.display = 'flex';
}

function setTransType(type) {
    selectedType = type;
    document.getElementById('btnIncome').className = `type-btn ${type === 'income' ? 'active' : ''}`;
    document.getElementById('btnExpense').className = `type-btn ${type === 'expense' ? 'active' : ''}`;
}

async function attemptLogin() {
    const u = document.getElementById('adminUser').value;
    const p = document.getElementById('adminPass').value;
    try {
        const res = await fetch('/api/auth', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ user: u, pass: p })
        });
        const data = await res.json();
        if(data.success) {
            localStorage.setItem('sc_admin', 'true');
            checkLoginSession();
            closeModal('loginModal');
            showToast("Welcome Treasurer");
            if(!isAdminMode) toggleAdminMode();
        } else {
            showToast("Wrong password");
        }
    } catch(e) { showToast("Server Error"); }
}

function handleLogout() {
    localStorage.removeItem('sc_admin');
    checkLoginSession();
    if(isAdminMode) toggleAdminMode();
    document.getElementById('adminPass').value = ""; 
    showToast("Logged out");
}

function checkLoginSession() {
    const isLogged = localStorage.getItem('sc_admin') === 'true';
    if(isLogged) {
        document.getElementById('loginBtn').classList.add('hidden');
        document.getElementById('logoutBtn').classList.remove('hidden');
        document.getElementById('adminToggleBtn').classList.remove('hidden');
    } else {
        document.getElementById('loginBtn').classList.remove('hidden');
        document.getElementById('logoutBtn').classList.add('hidden');
        document.getElementById('adminToggleBtn').classList.add('hidden');
    }
}

function switchTab(id) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
    document.getElementById(id).classList.remove('hidden');
    document.querySelectorAll('.nav-btn').forEach(el => el.classList.remove('active'));
    if(id === 'home') document.querySelector('button[onclick="switchTab(\'home\')"]')?.classList.add('active');
    if(id === 'be-heard') document.querySelector('button[onclick="switchTab(\'be-heard\')"]')?.classList.add('active');
}

function openLogin() { document.getElementById('loginModal').style.display = 'flex'; }
function closeModal(id) { document.getElementById(id).style.display = 'none'; }
function loadMore() { currentPage++; fetchTransactions(true); }
function showToast(msg) {
    const t = document.getElementById('toast');
    if(t) { t.innerText = msg; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 3000); }
}
