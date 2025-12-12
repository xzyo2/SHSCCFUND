// --- CONFIGURATION ---
const SUPABASE_URL = 'https://tokedafadxogunwwetef.supabase.co'; // hello there user
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRva2VkYWZhZHhvZ3Vud3dldGVmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU0Mzc4NTUsImV4cCI6MjA4MTAxMzg1NX0.HBS6hfKXt2g3oplwYoCg2t7qjqFyDMJvEmtlvgJSb3c';
const client = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);


// --- STATE ---
let transactions = [];
let currentPage = 0;
let isAdminMode = false;
let selectedType = 'income';
let displayedBalance = 0;
let currentFilter = 'all'; 

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
    document.body.classList.toggle('dark-mode');
    document.body.classList.toggle('light-mode');
    updateSortIcon();
}

function updateSortIcon() {
    const icon = document.getElementById('sortIcon');
    const isDark = document.body.classList.contains('dark-mode');
    // Ensure you have these images in your img/ folder!
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

    let query = client.from('transactions')
        .select('*', { count: 'exact' })
        .order('date', { ascending: false })
        .order('id', { ascending: false });

    if (currentFilter === 'month') {
        const date = new Date();
        const firstDay = new Date(date.getFullYear(), date.getMonth(), 1).toISOString();
        query = query.gte('date', firstDay);
    } else if (currentFilter === 'week') {
        const date = new Date();
        const diff = date.getDate() - date.getDay();
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

// --- RENDER CARD ---
function renderCard(t) {
    const list = document.getElementById('transList');
    const isIncome = t.type === 'income';
    const amountFmt = parseFloat(t.amount).toLocaleString('en-PH', { minimumFractionDigits: 2 });

    // 1. Receipt Badge
    let receiptBadge = '';
    if (t.receipt_url) {
        receiptBadge = `<a href="${t.receipt_url}" target="_blank" class="receipt-badge">VIEW RECEIPT</a>`;
    }

    // 2. Warning Text
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
                ${isIncome ? '+' : '-'}₱${amountFmt}
            </span>
            <button class="edit-icon" onclick="openEditModal(${t.id})">✎</button>
        </div>
    `;
    list.appendChild(card);
}

// --- SUBMIT TRANSACTION ---
async function submitTransaction() {
    const id = document.getElementById('editId').value;
    const date = document.getElementById('tDate').value;
    const desc = document.getElementById('tDesc').value;
    const amount = document.getElementById('tAmount').value;
    const password = document.getElementById('adminPass').value; 
    
    // File Handling
    const fileInput = document.getElementById('tReceipt');
    const file = fileInput.files[0];

    if (!desc || !amount) return showToast("Please fill all fields");
    if (!password) return showToast("Please login again to save");

    showToast("Processing...");

    let finalReceiptUrl = null;

    // Upload Image if present
    if (file) {
        const fileName = `${Date.now()}_${file.name.replace(/\s/g, '_')}`;
        const { error: uploadError } = await client.storage.from('receipts').upload(fileName, file);
        
        if (uploadError) {
            console.error(uploadError);
            return showToast("Image upload failed");
        }
        
        const { data: urlData } = client.storage.from('receipts').getPublicUrl(fileName);
        finalReceiptUrl = urlData.publicUrl;
    }

    // Payload
    const payload = { 
        id: id ? id : undefined, 
        date, 
        description: desc, 
        type: selectedType, 
        amount,
        ...(finalReceiptUrl && { receipt_url: finalReceiptUrl }) 
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
            showToast("Success

