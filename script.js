// --- CONFIGURATION ---
const SUPABASE_URL = 'https://tokedafadxogunwwetef.supabase.co'; 
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRva2VkYWZhZHhvZ3Vud3dldGVmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU0Mzc4NTUsImV4cCI6MjA4MTAxMzg1NX0.HBS6hfKXt2g3oplwYoCg2t7qjqFyDMJvEmtlvgJSb3c';

// Initialize Supabase
const client = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// --- STATE ---
let transactions = [];
let currentPage = 0;
let isAdminMode = false;
let selectedType = 'income';
let displayedBalance = 0;
let currentFilter = 'all'; 

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    fetchTransactions();
    setupRealtime(); 
    checkLoginSession();
    updateSortIcon();
    
    const dateInput = document.getElementById('tDate');
    if(dateInput) dateInput.valueAsDate = new Date();
});

// --- THEME ---
function toggleTheme() {
    const body = document.body;
    if (body.classList.contains('dark-mode')) {
        body.classList.remove('dark-mode');
        body.classList.add('light-mode');
    } else {
        body.classList.remove('light-mode');
        body.classList.add('dark-mode');
    }
    updateSortIcon();
}

function updateSortIcon() {
    const icon = document.getElementById('sortIcon');
    const isDark = document.body.classList.contains('dark-mode');
    if (icon) {
        icon.src = isDark ? "img/sortdm.png" : "img/sortwm.png";
    }
}

// --- DATA FETCHING ---
async function fetchTransactions(isLoadMore = false) {
    if (!isLoadMore) { 
        currentPage = 0; 
        document.getElementById('transList').innerHTML = ""; 
    }

    const from = currentPage * 10;
    const to = from + 9;

    let query = client
        .from('transactions')
        .select('*', { count: 'exact' })
        .order('date', { ascending: false })
        .order('id', { ascending: false });

    if (currentFilter === 'month') {
        const date = new Date();
        const firstDay = new Date(date.getFullYear(), date.getMonth(), 1).toISOString();
        query = query.gte('date', firstDay);
    } 
    else if (currentFilter === 'week') {
        const date = new Date();
        const day = date.getDay();
        const diff = date.getDate() - day;
        const firstDay = new Date(date.setDate(diff)).toISOString();
        query = query.gte('date', firstDay);
    }

    const { data, error, count } = await query.range(from, to);

    if (error) {
        console.error("Supabase Error:", error);
        return showToast("Error loading data");
    }

    transactions = isLoadMore ? [...transactions, ...data] : data;
    data.forEach(t => renderCard(t));
    calculateBalance();
    
    if(document.getElementById('transCount')) {
        document.getElementById('transCount').innerText = `${count} records`;
    }
    
    const loadBtn = document.getElementById('loadMoreBtn');
    if(loadBtn) {
        loadBtn.style.display = (to >= count - 1) ? 'none' : 'block';
    }
}

function loadMore() {
    currentPage++;
    fetchTransactions(true);
}

// --- RENDER CARD ---
function renderCard(t) {
    const list = document.getElementById('transList');
    const isIncome = t.type === 'income';
    const amountFmt = parseFloat(t.amount).toLocaleString('en-PH', { minimumFractionDigits: 2 });

    let receiptBadge = '';
    if (t.receipt_url) {
        receiptBadge = `<button onclick="viewReceipt('${t.receipt_url}')" class="receipt-badge">VIEW RECEIPT</button>`;
    }

    let warningText = '';
    if (!t.receipt_url) {
        warningText = `<small class="no-receipt-text">Note: No receipt image attached. (Transaction verified manually)</small>`;
    }

    const card = document.createElement('div');
    card.className = 'trans-card';
    card.innerHTML = `
        <div class="t-left">
            <span class="t-id">#${t.id}</span>
            <div>
                <span class="t-desc">${t.description}</span>
                ${receiptBadge}
            </div>
            ${warningText}
            <span class="t-date">${new Date(t.date).toLocaleDateString()}</span>
        </div>
        <div class="t-right">
            <span class="t-amount ${isIncome ? 'income' : 'expense'}">
                ${isIncome ? '+' : '-'} &#8369;${amountFmt}
            </span>
            <button class="edit-icon" onclick="openEditModal(${t.id})">✎</button>
        </div>
    `;
    list.appendChild(card);
}

// --- VIEW RECEIPT IN MODAL ---
function viewReceipt(url) {
    const modal = document.getElementById('imageModal');
    const img = document.getElementById('fullReceiptImg');
    
    img.src = url;
    modal.style.display = 'flex';
}

// --- SUBMIT TRANSACTION ---
async function submitTransaction() {
    const btn = document.getElementById('saveTxBtn');
    const id = document.getElementById('editId').value;
    const date = document.getElementById('tDate').value;
    const desc = document.getElementById('tDesc').value;
    const amount = document.getElementById('tAmount').value;
    const password = document.getElementById('adminPass').value; 
    const fileInput = document.getElementById('tReceipt');
    const file = fileInput ? fileInput.files[0] : null;

    if (!desc || !amount) return showToast("Please fill all fields");
    if (!password) return showToast("Please login again to save");

    btn.disabled = true;
    btn.innerText = "Processing...";

    try {
        let finalReceiptUrl = null;

        if (file) {
            const cleanName = file.name.replace(/[^a-zA-Z0-9.]/g, '_');
            const fileName = `${Date.now()}_${cleanName}`;
            
            const { error: uploadError } = await client.storage.from('receipts').upload(fileName, file);
            
            if (uploadError) {
                console.error("Upload Error:", uploadError);
                showToast("Image upload failed.");
                throw new Error("Upload failed"); 
            }
            
            const { data: urlData } = client.storage.from('receipts').getPublicUrl(fileName);
            finalReceiptUrl = urlData.publicUrl;
        }

        const payload = { 
            id: id ? id : undefined, 
            date, 
            description: desc, 
            type: selectedType, 
            amount
        };

        if (finalReceiptUrl) {
            payload.receipt_url = finalReceiptUrl;
        }

        const action = id ? 'update' : 'create';

        const res = await fetch('/api/transaction', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action, payload, password })
        });

        const result = await res.json();

        if (result.success) {
            showToast("Success! Waiting for update...");
            closeModal('transModal');
            clearFileSelection(null); 
        } else {
            showToast("Error: " + (result.message || result.error));
        }

    } catch (e) {
        console.error(e);
        showToast("Server Connection Failed");
    } finally {
        btn.disabled = false;
        btn.innerText = "Save Transaction";
    }
}

// --- CLEAR FILE HELPER ---
function clearFileSelection(e) {
    if(e) {
        e.preventDefault();
        e.stopImmediatePropagation();
    }
    
    const fileInput = document.getElementById('tReceipt');
    const fileNameDisplay = document.getElementById('fileName');
    const clearBtn = document.getElementById('clearFileBtn');
    
    if(fileInput) fileInput.value = ""; 
    if(fileNameDisplay) fileNameDisplay.innerText = "Tap to upload image...";
    if(clearBtn) clearBtn.classList.add('hidden'); 
}

// --- FILE LISTENER ---
const receiptInput = document.getElementById('tReceipt');
if (receiptInput) {
    receiptInput.addEventListener('change', function(){
        const fileNameDisplay = document.getElementById('fileName');
        const clearBtn = document.getElementById('clearFileBtn');

        if(this.files && this.files[0]) {
            fileNameDisplay.innerText = this.files[0].name;
            clearBtn.classList.remove('hidden'); 
        }
    });
}

// --- DELETE TRANSACTION (UPDATED WITH IMAGE DELETION) ---
async function deleteTransaction() {
    const id = document.getElementById('editId').value;
    const password = document.getElementById('adminPass').value;
    
    if(!confirm("Are you sure you want to delete this transaction?")) return;
    if (!password) return showToast("Please login again");

    // 1. Grab transaction details BEFORE deletion to get the image URL
    const transaction = transactions.find(t => t.id === parseInt(id));
    const receiptUrl = transaction ? transaction.receipt_url : null;

    try {
        const res = await fetch('/api/transaction', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'delete', payload: { id }, password })
        });
        
        const result = await res.json();
        
        if (result.success) {
            // 2. If successfully deleted from DB, now delete image from Storage
            if (receiptUrl) {
                // Extracts "filename.jpg" from ".../receipts/filename.jpg"
                const filePath = receiptUrl.split('/receipts/')[1]; 
                
                if (filePath) {
                    const { error: storageError } = await client
                        .storage
                        .from('receipts')
                        .remove([filePath]);
                    
                    if(storageError) console.error("Error deleting image:", storageError);
                    else console.log("Image deleted successfully");
                }
            }

            showToast("Deleted successfully.");
            closeModal('transModal');
        } else {
            showToast("Error deleting: " + (result.message || "Unknown error"));
        }
    } catch (e) { 
        console.error(e);
        showToast("Server Error"); 
    }
}

// --- REALTIME ---
function setupRealtime() {
    client.channel('public:transactions')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, () => {
        fetchTransactions(); 
    })
    .subscribe();
}

// --- BALANCE ---
async function calculateBalance() {
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
    if (!element) return;
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

// --- UI UTILS ---
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

    let csvContent = "ID,Date,Description,Type,Amount,ReceiptURL,Created At\n";
    data.forEach(row => {
        const cleanDesc = row.description ? row.description.replace(/"/g, '""') : ""; 
        const rUrl = row.receipt_url || '';
        csvContent += `${row.id},${row.date},"${cleanDesc}",${row.type},${row.amount},${rUrl},${row.created_at}\n`;
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
    
    clearFileSelection(null); 

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
    
    // UI logic: If existing receipt, show "Replace...", otherwise "Upload"
    if(document.getElementById('fileName')) {
        document.getElementById('fileName').innerText = t.receipt_url ? "Replace existing image..." : "Tap to upload image...";
        document.getElementById('clearFileBtn').classList.add('hidden'); 
    }

    document.getElementById('deleteBtn').classList.remove('hidden');
    setTransType(t.type);
    document.getElementById('transModal').style.display = 'flex';
}

function setTransType(type) {
    selectedType = type;
    document.getElementById('btnIncome').className = `type-btn ${type === 'income' ? 'active' : ''}`;
    document.getElementById('btnExpense').className = `type-btn ${type === 'expense' ? 'active' : ''}`;
}

// --- AUTH ---
function toggleFilterMenu() {
    document.getElementById('filterMenu').classList.toggle('hidden');
}

function applyFilter(type) {
    currentFilter = type;
    document.querySelectorAll('.filter-chip').forEach(btn => btn.classList.remove('active'));
    document.getElementById(`filter-${type}`).classList.add('active');
    fetchTransactions(false);
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

// --- TABS & HELPER FUNCTIONS ---

function switchTab(id) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
    
    const selectedTab = document.getElementById(id);
    if(selectedTab) selectedTab.classList.remove('hidden');
    
    document.querySelectorAll('.nav-btn, .desktop-nav-btn').forEach(el => el.classList.remove('active'));
    
    const activeButtons = document.querySelectorAll(`button[onclick="switchTab('${id}')"]`);
    activeButtons.forEach(btn => btn.classList.add('active'));
}

function openLogin() {
    const modal = document.getElementById('loginModal');
    if(modal) modal.style.display = 'flex';
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if(modal) modal.style.display = 'none';
}

// --- CUSTOM TOAST NOTIFICATION ---
function showToast(message) {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.style.position = 'fixed';
        container.style.bottom = '20px';
        container.style.left = '50%';
        container.style.transform = 'translateX(-50%)';
        container.style.zIndex = '9999';
        container.style.display = 'flex';
        container.style.flexDirection = 'column';
        container.style.gap = '10px';
        container.style.pointerEvents = 'none';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.innerText = message;
    
    toast.style.background = 'rgba(30, 30, 30, 0.9)';
    toast.style.color = '#fff';
    toast.style.padding = '12px 24px';
    toast.style.borderRadius = '25px';
    toast.style.fontFamily = 'sans-serif';
    toast.style.fontSize = '14px';
    toast.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
    toast.style.backdropFilter = 'blur(4px)';
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = 'all 0.3s ease';

    container.appendChild(toast);

    requestAnimationFrame(() => {
        toast.style.opacity = '1';
        toast.style.transform = 'translateY(0)';
    });

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(10px)';
        setTimeout(() => {
            toast.remove();
        }, 300);
    }, 3000);
}
