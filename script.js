// --- CONFIGURATION ---
const SUPABASE_URL = 'https://tokedafadxogunwwetef.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRva2VkYWZhZHhvZ3Vud3dldGVmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU0Mzc4NTUsImV4cCI6MjA4MTAxMzg1NX0.HBS6hfKXt2g3oplwYoCg2t7qjqFyDMJvEmtlvgJSb3c';
const client = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// --- STATE VARIABLES ---
let transactions = [];
let currentPage = 0;
let isAdminMode = false;
let selectedType = 'income'; // For the modal form

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    fetchTransactions();
    setupRealtime();
    checkLoginSession();
    
    // Set default date to today for new entries
    const dateInput = document.getElementById('tDate');
    if(dateInput) dateInput.valueAsDate = new Date();
});

// --- DATA FETCHING (READ ONLY) ---
async function fetchTransactions(isLoadMore = false) {
    if (!isLoadMore) { 
        currentPage = 0; 
        document.getElementById('transList').innerHTML = ""; 
    }

    const from = currentPage * 10;
    const to = from + 9;

    // Fetch data from Supabase (Public Read Access)
    const { data, error, count } = await client
        .from('transactions')
        .select('*', { count: 'exact' })
        .order('date', { ascending: false })
        .order('id', { ascending: false }) // Secondary sort by ID so newest is top
        .range(from, to);

    if (error) {
        console.error("Supabase Error:", error);
        return showToast("Error loading data");
    }

    // Append new data or replace existing
    transactions = isLoadMore ? [...transactions, ...data] : data;
    
    // Render the cards
    data.forEach(t => renderCard(t));
    
    // Update the Balance Board
    calculateBalance();
    
    // Update UI counters
    if(document.getElementById('transCount')) {
        document.getElementById('transCount').innerText = `${count} records`;
    }
    
    // Handle "Load More" button visibility
    const loadBtn = document.getElementById('loadMoreBtn');
    if(loadBtn) {
        loadBtn.style.display = (to >= count - 1) ? 'none' : 'block';
    }
}

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

// --- SECURE DB ACTIONS (WRITE via SERVER) ---

async function submitTransaction() {
    const id = document.getElementById('editId').value;
    const date = document.getElementById('tDate').value;
    const desc = document.getElementById('tDesc').value;
    const amount = document.getElementById('tAmount').value;
    // We need the password currently in the login box to authorize the write
    const password = document.getElementById('adminPass').value; 

    if (!desc || !amount) return showToast("Please fill all fields");
    if (!password) return showToast("Please login again to save (Security Check)");

    const payload = { 
        id: id ? id : undefined, // Only send ID if editing
        date, 
        description: desc, 
        type: selectedType, 
        amount 
    };

    const action = id ? 'update' : 'create';

    try {
        // Send data to Vercel Server (Hidden API) instead of direct Supabase
        const res = await fetch('/api/transaction', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action, payload, password })
        });

        const result = await res.json();

        if (result.success) {
            showToast("Success!");
            closeModal('transModal');
            // The Realtime listener will auto-refresh the list
        } else {
            showToast("Error: " + (result.message || result.error));
        }
    } catch (e) {
        console.error(e);
        showToast("Server Connection Failed");
    }
}

async function deleteTransaction() {
    const id = document.getElementById('editId').value;
    const password = document.getElementById('adminPass').value;

    if(!confirm("Are you sure you want to delete this?")) return;
    if (!password) return showToast("Please login again (Security Check)");

    try {
        const res = await fetch('/api/transaction', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'delete', payload: { id }, password })
        });

        const result = await res.json();
        if (result.success) {
            showToast("Deleted.");
            closeModal('transModal');
            // Realtime listener will handle refresh
        } else {
            showToast("Error deleting: " + result.message);
        }
    } catch (e) {
        showToast("Server Connection Failed");
    }
}

// --- ADMIN & UI LOGIC ---

function toggleAdminMode() {
    isAdminMode = !isAdminMode;
    const btn = document.getElementById('adminToggleBtn');
    const list = document.getElementById('transList');
    const addBtn = document.getElementById('addTransBtn');
    
    if (isAdminMode) {
        btn.innerText = "Admin Mode: ON";
        btn.style.color = "#22c55e";
        list.classList.add('admin-mode');
        addBtn.classList.remove('hidden');
    } else {
        btn.innerText = "Admin Mode: OFF";
        btn.style.color = "#eab308";
        list.classList.remove('admin-mode');
        addBtn.classList.add('hidden');
    }
}

function openTransactionModal() {
    // Reset form for "Add" mode
    document.getElementById('modalTitle').innerText = "New Transaction";
    document.getElementById('editId').value = "";
    document.getElementById('tDesc').value = "";
    document.getElementById('tAmount').value = "";
    document.getElementById('deleteBtn').classList.add('hidden');
    setTransType('income');
    document.getElementById('transModal').style.display = 'flex';
}

function openEditModal(id) {
    // Find data locally first to fill the form
    const t = transactions.find(x => x.id === id);
    if(!t) return;

    // Fill form for "Edit" mode
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
        // Authenticate via Vercel Server
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
            
            // Auto-enable admin mode on login
            if(!isAdminMode) toggleAdminMode();
        } else {
            showToast("Wrong password");
        }
    } catch(e) { showToast("Server Error"); }
}

function handleLogout() {
    localStorage.removeItem('sc_admin');
    checkLoginSession();
    if(isAdminMode) toggleAdminMode(); // Turn off edit buttons
    
    // Clear the password field so they have to re-type it to edit next time
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

// --- UTILS ---

async function calculateBalance() {
    // Fetch SUM of all transactions for accurate balance
    // Note: In a huge app, you'd use a database function (RPC) for this.
    const { data } = await client.from('transactions').select('amount, type');
    let total = 0;
    if(data) {
        data.forEach(t => {
            if(t.type === 'income') total += parseFloat(t.amount);
            else total -= parseFloat(t.amount);
        });
    }
    document.getElementById('displayBalance').innerText = total.toLocaleString('en-PH', { minimumFractionDigits: 2 });
}

function setupRealtime() {
    // This listens for ANY change in the DB and refreshes the list automatically
    client.channel('custom-all-channel')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, (payload) => {
        console.log('Change received!', payload);
        fetchTransactions();
    })
    .subscribe();
}

function switchTab(id) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    
    const target = document.getElementById(id);
    if(target) {
        target.classList.remove('hidden');
        target.classList.add('active');
    }
    
    document.querySelectorAll('.nav-btn').forEach(el => el.classList.remove('active'));
    
    // Simple logic to highlight the correct nav button
    if(id === 'home') {
        const btn = document.querySelector('button[onclick="switchTab(\'home\')"]');
        if(btn) btn.classList.add('active');
    }
    if(id === 'be-heard') {
        const btn = document.querySelector('button[onclick="switchTab(\'be-heard\')"]');
        if(btn) btn.classList.add('active');
    }
}

function openLogin() { document.getElementById('loginModal').style.display = 'flex'; }
function closeModal(id) { document.getElementById(id).style.display = 'none'; }
function loadMore() { currentPage++; fetchTransactions(true); }

function showToast(msg) {
    const t = document.getElementById('toast');
    if(t) {
        t.innerText = msg;
        t.classList.add('show');
        setTimeout(() => t.classList.remove('show'), 3000);
    }
}
