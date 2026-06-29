/* ============================================
   FinTrack Pro - Application Logic
   ============================================ */

const app = {
  // ---- State ----
  transactions: [],
  chartInstance: null,
  categoryChartInstance: null,
  editingId: null,
  confirmCallback: null,
  isLoggedIn: false,

  prefs: {
    name: '',
    currency: 'USD',
    isDark: false
  },

  currencySymbols: { USD: '$', EUR: '€', GBP: '£', INR: '₹' },

  categories: {
    Expense: ['Food & Dining', 'Shopping', 'Recharge & Bills', 'Petrol & Auto', 'Utilities', 'Entertainment', 'Other'],
    Income: ['Salary', 'Freelance', 'Investments', 'Gift', 'Other']
  },


  /* =============================================
     Initialization & Auth
     ============================================= */

  init() {
    this.loadData();
    this.applyTheme();

    this.isLoggedIn = localStorage.getItem('fin_isLoggedIn') === 'true';

    if (this.isLoggedIn) {
      this.bootApp();
    } else {
      this.showLogin();
    }

    this.bindKeyboardShortcuts();
  },

  bootApp() {
    document.querySelector('.sidebar').classList.add('visible');
    document.querySelector('.topbar').classList.add('visible');
    document.querySelector('.main-content').classList.add('app-mode');

    document.getElementById('pref-theme').checked = this.prefs.isDark;
    document.getElementById('pref-name').value = this.prefs.name;
    document.getElementById('pref-currency').value = this.prefs.currency;

    this.updateProfileUI();
    this.updateCategoryOptions();
    this.masterRefresh();
    this.showPage('dashboard');
  },

  showLogin() {
    document.querySelector('.sidebar').classList.remove('visible');
    document.querySelector('.topbar').classList.remove('visible');
    document.querySelector('.main-content').classList.remove('app-mode');

    document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active'));
    document.getElementById('view-login').classList.add('active');
    document.getElementById('login-username').value = this.prefs.name || '';
  },

  login(e) {
    e.preventDefault();
    const username = document.getElementById('login-username').value.trim();
    if (!username) return;

    this.prefs.name = username;
    this.savePreferences();

    this.isLoggedIn = true;
    localStorage.setItem('fin_isLoggedIn', 'true');

    document.getElementById('login-password').value = '';
    this.bootApp();
    this.toast('Welcome back, ' + username + '!', 'success');
  },

  logout() {
    this.isLoggedIn = false;
    localStorage.setItem('fin_isLoggedIn', 'false');
    this.showLogin();
    this.toast('Logged out successfully.', 'info');
  },


  /* =============================================
     Data Persistence
     ============================================= */

  loadData() {
    try {
      const storedTx = localStorage.getItem('fin_transactions');
      if (storedTx) this.transactions = JSON.parse(storedTx);

      const storedPrefs = localStorage.getItem('fin_prefs');
      if (storedPrefs) this.prefs = { ...this.prefs, ...JSON.parse(storedPrefs) };
    } catch (e) {
      console.error('Failed to load data:', e);
      localStorage.removeItem('fin_transactions');
      localStorage.removeItem('fin_prefs');
    }
  },

  persistData() {
    localStorage.setItem('fin_transactions', JSON.stringify(this.transactions));
  },

  savePreferences() {
    localStorage.setItem('fin_prefs', JSON.stringify(this.prefs));
  },


  /* =============================================
     Navigation
     ============================================= */

  showPage(pageId) {
    document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));

    document.getElementById(`view-${pageId}`).classList.add('active');
    document.getElementById(`nav-${pageId}`).classList.add('active');

    // Re-render charts when switching to dashboard (fixes canvas sizing)
    if (pageId === 'dashboard') {
      setTimeout(() => {
        this.renderChart();
        this.renderCategoryChart();
      }, 50);
    }
  },


  /* =============================================
     Profile & Theme
     ============================================= */

  saveProfile(e) {
    e.preventDefault();
    this.prefs.name = document.getElementById('pref-name').value.trim() || 'User';
    this.prefs.currency = document.getElementById('pref-currency').value;
    this.savePreferences();
    this.updateProfileUI();
    this.masterRefresh();
    this.toast('Profile saved successfully.', 'success');
  },

  updateProfileUI() {
    const initials = (this.prefs.name || 'U').substring(0, 2).toLowerCase();
    document.getElementById('user-initials').innerText = initials;
  },

  toggleTheme() {
    this.prefs.isDark = document.getElementById('pref-theme').checked;
    this.savePreferences();
    this.applyTheme();
  },

  applyTheme() {
    if (this.prefs.isDark) {
      document.body.classList.add('dark');
    } else {
      document.body.classList.remove('dark');
    }
    // Re-render charts to pick up new theme colors
    if (this.chartInstance) this.renderChart();
    if (this.categoryChartInstance) this.renderCategoryChart();
  },


  /* =============================================
     Formatting Utilities
     ============================================= */

  formatMoney(amount) {
    const symbol = this.currencySymbols[this.prefs.currency] || '$';
    const abs = Math.abs(amount);
    const formatted = symbol + abs.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return amount < 0 ? '-' + formatted : formatted;
  },

  formatDate(dateString) {
    // Parse as local date to avoid timezone shift
    const parts = dateString.split('-');
    const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    const options = { year: 'numeric', month: 'short', day: 'numeric' };
    return d.toLocaleDateString(undefined, options);
  },

  escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  },


  /* =============================================
     Transaction CRUD
     ============================================= */

  saveTransaction(e) {
    e.preventDefault();

    const type = document.getElementById('tx-type').value;
    const amountStr = document.getElementById('tx-amount').value;
    const desc = document.getElementById('tx-desc').value.trim();
    const date = document.getElementById('tx-date').value;
    const category = document.getElementById('tx-category').value;

    if (!type || !amountStr || !desc || !date || !category) {
      this.toast('Please fill in all fields.', 'error');
      return;
    }

    const amount = parseFloat(amountStr);

    if (this.editingId) {
      // ---- Update existing transaction ----
      const idx = this.transactions.findIndex(t => t.id === this.editingId);
      if (idx !== -1) {
        this.transactions[idx] = { id: this.editingId, type, amount, desc, date, category };
      }
      this.toast('Transaction updated successfully.', 'success');
    } else {
      // ---- Create new transaction ----
      const tx = {
        id: Date.now().toString(),
        type, amount, desc, date, category
      };
      this.transactions.push(tx);
      this.toast('Transaction added successfully.', 'success');
    }

    this.transactions.sort((a, b) => new Date(b.date) - new Date(a.date));
    this.persistData();
    this.closeModal();
    this.masterRefresh();
  },

  editTransaction(id) {
    const tx = this.transactions.find(t => t.id === id);
    if (!tx) return;

    this.editingId = id;
    document.getElementById('modal-title').textContent = 'Edit Transaction';
    document.getElementById('modal-submit-btn').textContent = 'Update Transaction';
    document.getElementById('tx-type').value = tx.type;
    this.updateCategoryOptions();
    document.getElementById('tx-category').value = tx.category;
    document.getElementById('tx-desc').value = tx.desc;
    document.getElementById('tx-amount').value = tx.amount;
    document.getElementById('tx-date').value = tx.date;

    document.getElementById('add-modal').classList.add('active');
  },

  deleteTransaction(id) {
    this.showConfirm(
      'Delete Transaction',
      'Are you sure you want to delete this transaction? This cannot be undone.',
      () => {
        this.transactions = this.transactions.filter(t => t.id !== id);
        this.persistData();
        this.masterRefresh();
        this.toast('Transaction deleted.', 'info');
      }
    );
  },


  /* =============================================
     Modal Management
     ============================================= */

  openModal() {
    this.editingId = null;
    document.getElementById('modal-title').textContent = 'Add Transaction';
    document.getElementById('modal-submit-btn').textContent = 'Save Transaction';
    document.getElementById('add-form').reset();
    document.getElementById('tx-date').value = new Date().toISOString().split('T')[0];
    this.updateCategoryOptions();
    document.getElementById('add-modal').classList.add('active');
  },

  closeModal() {
    const modal = document.getElementById('add-modal');
    if (!modal.classList.contains('active')) return;
    modal.classList.remove('active');
    document.getElementById('add-form').reset();
    this.editingId = null;
  },

  handleModalClick(e) {
    if (e.target.id === 'add-modal') {
      this.closeModal();
    }
  },

  updateCategoryOptions() {
    const type = document.getElementById('tx-type').value;
    const catSelect = document.getElementById('tx-category');
    catSelect.innerHTML = '<option value="" disabled selected>Select a category</option>';

    this.categories[type].forEach(cat => {
      const opt = document.createElement('option');
      opt.value = cat;
      opt.textContent = cat;
      catSelect.appendChild(opt);
    });
  },


  /* =============================================
     Stats Cards
     ============================================= */

  updateCards() {
    let income = 0;
    let expense = 0;

    this.transactions.forEach(t => {
      if (t.type === 'Income') income += t.amount;
      else expense += t.amount;
    });

    const balance = income - expense;

    const balanceEl = document.getElementById('stat-balance');
    balanceEl.innerText = this.formatMoney(balance);
    balanceEl.className = balance >= 0 ? 'card-value color-up' : 'card-value color-down';

    // Show income and expense breakdown
    const incExpEl = document.getElementById('stat-inc-exp');
    incExpEl.innerHTML = `<span class="color-up">+${this.formatMoney(income)}</span> <span style="color:var(--text-secondary);font-size:16px;">/</span> <span class="color-down">-${this.formatMoney(expense)}</span>`;
    incExpEl.className = 'card-value';

    document.getElementById('stat-count').innerText = this.transactions.length;

    // This month spending
    const now = new Date();
    const thisMonthExpense = this.transactions
      .filter(t => {
        const parts = t.date.split('-');
        const month = parseInt(parts[1]) - 1;
        const year = parseInt(parts[0]);
        return t.type === 'Expense' && month === now.getMonth() && year === now.getFullYear();
      })
      .reduce((sum, t) => sum + t.amount, 0);

    const monthEl = document.getElementById('stat-monthly');
    monthEl.innerText = this.formatMoney(thisMonthExpense);
    monthEl.className = thisMonthExpense > 0 ? 'card-value color-down' : 'card-value';
  },


  /* =============================================
     Table Rendering
     ============================================= */

  renderTable() {
    const tbody = document.getElementById('tx-tbody');
    const emptyState = document.getElementById('tx-empty');
    tbody.innerHTML = '';

    const filterType = document.getElementById('filter-select').value;
    const searchTerm = document.getElementById('search-input').value.toLowerCase();
    const dateFrom = document.getElementById('date-from').value;
    const dateTo = document.getElementById('date-to').value;

    const filtered = this.transactions.filter(t => {
      const matchesType = filterType === 'All' || t.type === filterType;
      const matchesSearch = t.desc.toLowerCase().includes(searchTerm) || t.category.toLowerCase().includes(searchTerm);

      let matchesDate = true;
      if (dateFrom) matchesDate = matchesDate && t.date >= dateFrom;
      if (dateTo) matchesDate = matchesDate && t.date <= dateTo;

      return matchesType && matchesSearch && matchesDate;
    });

    if (filtered.length === 0) {
      emptyState.style.display = 'block';
      tbody.parentElement.style.display = 'none';
    } else {
      emptyState.style.display = 'none';
      tbody.parentElement.style.display = 'table';

      filtered.forEach(t => {
        const isIncome = t.type === 'Income';
        const sign = isIncome ? '+' : '-';
        const colorClass = isIncome ? 'color-up' : 'color-down';
        const safeDesc = this.escapeHtml(t.desc);
        const safeCat = this.escapeHtml(t.category);

        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${this.formatDate(t.date)}</td>
          <td>${safeDesc}</td>
          <td><span class="badge">${safeCat}</span></td>
          <td class="td-right ${colorClass}" style="font-weight: 600;">
            ${sign}${this.formatMoney(t.amount)}
          </td>
          <td class="td-right">
            <div class="action-cell">
              <button class="btn-action btn-edit" title="Edit" onclick="app.editTransaction('${t.id}')">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
              </button>
              <button class="btn-action" title="Delete" onclick="app.deleteTransaction('${t.id}')">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"></path><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
              </button>
            </div>
          </td>
        `;
        tbody.appendChild(tr);
      });
    }
  },

  clearFilters() {
    document.getElementById('search-input').value = '';
    document.getElementById('filter-select').value = 'All';
    document.getElementById('date-from').value = '';
    document.getElementById('date-to').value = '';
    this.renderTable();
    this.toast('Filters cleared.', 'info');
  },


  /* =============================================
     Charts
     ============================================= */

  renderChart() {
    const canvas = document.getElementById('flowChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (this.chartInstance) this.chartInstance.destroy();

    const monthlyData = {};
    const chronosTx = [...this.transactions].sort((a, b) => new Date(a.date) - new Date(b.date));

    chronosTx.forEach(t => {
      const d = new Date(t.date);
      const monthYear = d.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
      if (!monthlyData[monthYear]) monthlyData[monthYear] = { income: 0, expense: 0 };

      if (t.type === 'Income') monthlyData[monthYear].income += t.amount;
      else monthlyData[monthYear].expense += t.amount;
    });

    const labels = Object.keys(monthlyData);
    const incomeData = labels.map(l => monthlyData[l].income);
    const expenseData = labels.map(l => monthlyData[l].expense);

    const style = getComputedStyle(document.body);
    const textColor = style.getPropertyValue('--text-secondary').trim();
    const gridColor = style.getPropertyValue('--border-color').trim();
    const successColor = style.getPropertyValue('--success').trim();
    const dangerColor = style.getPropertyValue('--danger').trim();

    this.chartInstance = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels.length ? labels : ['No Data'],
        datasets: [
          {
            label: 'Income',
            data: incomeData.length ? incomeData : [0],
            backgroundColor: successColor,
            borderRadius: 4
          },
          {
            label: 'Expense',
            data: expenseData.length ? expenseData : [0],
            backgroundColor: dangerColor,
            borderRadius: 4
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            labels: { color: textColor, font: { family: 'Inter' } }
          },
          tooltip: {
            callbacks: {
              label: (context) => `${context.dataset.label}: ${this.formatMoney(context.raw)}`
            }
          }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: textColor, font: { family: 'Inter' } }
          },
          y: {
            grid: { color: gridColor },
            ticks: {
              color: textColor, font: { family: 'Inter' },
              callback: (val) => this.formatMoney(val)
            },
            beginAtZero: true
          }
        }
      }
    });
  },

  renderCategoryChart() {
    const canvas = document.getElementById('categoryChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (this.categoryChartInstance) this.categoryChartInstance.destroy();

    const categoryTotals = {};
    this.transactions
      .filter(t => t.type === 'Expense')
      .forEach(t => {
        categoryTotals[t.category] = (categoryTotals[t.category] || 0) + t.amount;
      });

    let labels = Object.keys(categoryTotals);
    let data = Object.values(categoryTotals);

    const isEmpty = labels.length === 0;
    if (isEmpty) {
      labels = ['No Expenses'];
      data = [1];
    }

    const chartColors = [
      '#4338ca', '#dc2626', '#f59e0b', '#16a34a',
      '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'
    ];

    const style = getComputedStyle(document.body);
    const textColor = style.getPropertyValue('--text-secondary').trim();

    this.categoryChartInstance = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{
          data,
          backgroundColor: isEmpty
            ? ['rgba(113,113,122,0.2)']
            : chartColors.slice(0, labels.length),
          borderWidth: 0,
          hoverOffset: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '65%',
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              color: textColor,
              font: { family: 'Inter', size: 11 },
              padding: 12,
              usePointStyle: true,
              pointStyle: 'circle'
            }
          },
          tooltip: {
            enabled: !isEmpty,
            callbacks: {
              label: (context) => {
                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                const pct = ((context.raw / total) * 100).toFixed(1);
                return `${context.label}: ${this.formatMoney(context.raw)} (${pct}%)`;
              }
            }
          }
        }
      }
    });
  },


  /* =============================================
     Toast Notifications
     ============================================= */

  toast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    const icons = {
      success: '✓',
      error: '✕',
      warning: '⚠',
      info: 'ℹ'
    };

    toast.innerHTML = `
      <span class="toast-icon">${icons[type] || icons.info}</span>
      <span class="toast-message">${message}</span>
    `;

    container.appendChild(toast);

    // Trigger slide-in animation
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        toast.classList.add('show');
      });
    });

    // Auto dismiss
    setTimeout(() => {
      toast.classList.remove('show');
      toast.addEventListener('transitionend', () => toast.remove(), { once: true });
    }, 3500);
  },


  /* =============================================
     Confirm Dialog
     ============================================= */

  showConfirm(title, message, callback) {
    this.confirmCallback = callback;
    document.getElementById('confirm-title').textContent = title;
    document.getElementById('confirm-message').textContent = message;
    document.getElementById('confirm-dialog').classList.add('active');
  },

  executeConfirm() {
    if (this.confirmCallback) {
      this.confirmCallback();
      this.confirmCallback = null;
    }
    document.getElementById('confirm-dialog').classList.remove('active');
  },

  cancelConfirm() {
    this.confirmCallback = null;
    document.getElementById('confirm-dialog').classList.remove('active');
  },

  handleConfirmClick(e) {
    if (e.target.id === 'confirm-dialog') {
      this.cancelConfirm();
    }
  },


  /* =============================================
     Reset Data
     ============================================= */

  confirmReset() {
    this.showConfirm(
      'Reset All Data',
      'Are you sure you want to wipe all transaction data? This action cannot be undone.',
      () => {
        this.transactions = [];
        this.persistData();
        this.masterRefresh();
        this.toast('All data has been reset.', 'info');
      }
    );
  },


  /* =============================================
     CSV Export
     ============================================= */

  exportCSV() {
    if (this.transactions.length === 0) {
      this.toast('No transactions to export.', 'warning');
      return;
    }

    const headers = ['Date', 'Type', 'Description', 'Category', 'Amount'];
    const rows = this.transactions.map(t => [
      t.date,
      t.type,
      `"${t.desc.replace(/"/g, '""')}"`,
      t.category,
      t.amount.toFixed(2)
    ]);

    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    this.downloadFile(csv, 'fintrack_transactions.csv', 'text/csv');
    this.toast('Transactions exported as CSV.', 'success');
  },


  /* =============================================
     JSON Backup / Restore
     ============================================= */

  exportJSON() {
    const data = {
      version: 1,
      exportDate: new Date().toISOString(),
      transactions: this.transactions,
      prefs: this.prefs
    };

    const json = JSON.stringify(data, null, 2);
    this.downloadFile(json, 'fintrack_backup.json', 'application/json');
    this.toast('Backup created successfully.', 'success');
  },

  triggerImport() {
    document.getElementById('import-file').click();
  },

  importJSON(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target.result);

        if (!data.transactions || !Array.isArray(data.transactions)) {
          this.toast('Invalid backup file format.', 'error');
          return;
        }

        this.showConfirm(
          'Restore Backup',
          `This will replace all current data with ${data.transactions.length} transaction(s) from the backup. Continue?`,
          () => {
            this.transactions = data.transactions;
            if (data.prefs) {
              this.prefs = { ...this.prefs, ...data.prefs };
              this.savePreferences();
              this.applyTheme();
              document.getElementById('pref-theme').checked = this.prefs.isDark;
              document.getElementById('pref-name').value = this.prefs.name;
              document.getElementById('pref-currency').value = this.prefs.currency;
              this.updateProfileUI();
            }
            this.persistData();
            this.masterRefresh();
            this.toast('Data restored from backup!', 'success');
          }
        );
      } catch (err) {
        this.toast('Failed to parse backup file.', 'error');
      }
    };
    reader.readAsText(file);
    e.target.value = ''; // Reset so same file can be re-selected
  },


  /* =============================================
     Utility
     ============================================= */

  downloadFile(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },


  /* =============================================
     Keyboard Shortcuts
     ============================================= */

  bindKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      // Ctrl/Cmd + N → New Transaction
      if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
        e.preventDefault();
        if (this.isLoggedIn) this.openModal();
      }
      // Escape → Close open modals (check if any are active first)
      if (e.key === 'Escape') {
        if (document.getElementById('confirm-dialog').classList.contains('active')) {
          this.cancelConfirm();
        } else if (document.getElementById('add-modal').classList.contains('active')) {
          this.closeModal();
        }
      }
    });
  },


  /* =============================================
     Master Refresh
     ============================================= */

  masterRefresh() {
    this.updateCards();
    this.renderTable();
    this.renderChart();
    this.renderCategoryChart();
  }
};


// ---- Boot ----
window.addEventListener('DOMContentLoaded', () => {
  app.init();
});
