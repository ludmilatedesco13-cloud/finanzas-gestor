// Estado y comportamiento de la interfaz de FinanzApp.
const state = {
    user: null,
    transactions: [],
    budgets: [],
    debts: [],
    goals: [],
    categories: [],
    loadSequence: 0,
    pending: 0
};

let categoryChart = null;
let monthlyTrendChart = null;
let simChart = null;

document.addEventListener('DOMContentLoaded', startApp);

async function startApp() {
    initNavigation();
    initTheme();
    initModals();
    initForms();
    initFilters();
    initActions();
    initSimulator();
    setTodayAsDefault();
    initAuthentication();

    try {
        const user = await withLoading(() => window.finanzDB.session());
        if (user) await enterApp(user);
    } catch (error) {
        showAuthMessage(error.message || 'No se pudo contactar el servicio.', 'error');
    }
}

function initAuthentication() {
    const form = document.getElementById('authForm');
    const nameInput = document.getElementById('authName');
    const passwordInput = document.getElementById('authPassword');
    form.dataset.mode = 'login';
    passwordInput.minLength = 1;
    document.getElementById('authModeToggle').addEventListener('click', () => {
        const registerMode = form.dataset.mode !== 'register';
        form.dataset.mode = registerMode ? 'register' : 'login';
        document.getElementById('authNameGroup').hidden = !registerMode;
        nameInput.required = registerMode;
        passwordInput.autocomplete = registerMode ? 'new-password' : 'current-password';
        document.getElementById('authTitle').textContent = registerMode ? 'Crear cuenta' : 'Iniciar sesión';
        document.getElementById('authSubmit').textContent = registerMode ? 'Crear cuenta' : 'Iniciar sesión';
        document.getElementById('authModeToggle').textContent = registerMode
            ? '¿Ya tenés cuenta? Iniciar sesión'
            : '¿Primera vez? Crear cuenta';
        document.getElementById('passwordHint').textContent = registerMode
            ? 'Usá al menos 12 caracteres. Nunca compartas tu contraseña.'
            : 'Ingresá la contraseña de tu cuenta.';
        passwordInput.minLength = registerMode ? 12 : 1;
        document.getElementById('authMessage').textContent = '';
        form.reset();
    });

    form.addEventListener('submit', async event => {
        event.preventDefault();
        if (!form.reportValidity()) return;
        const submit = document.getElementById('authSubmit');
        submit.disabled = true;
        document.getElementById('authMessage').textContent = '';
        try {
            const user = await withLoading(async () => {
                if (form.dataset.mode === 'register') {
                    const result = await window.finanzDB.register(
                        nameInput.value,
                        document.getElementById('authEmail').value,
                        passwordInput.value
                    );
                    return result.user;
                }
                const result = await window.finanzDB.login(
                    document.getElementById('authEmail').value,
                    passwordInput.value
                );
                return result.user;
            });
            await enterApp(user);
            form.reset();
        } catch (error) {
            showAuthMessage(error.message || 'No se pudo iniciar sesión.', 'error');
        } finally {
            submit.disabled = false;
        }
    });
}

async function enterApp(user) {
    state.user = user;
    document.getElementById('authScreen').hidden = true;
    document.getElementById('appLayout').hidden = false;
    document.getElementById('userNameHeader').textContent = user.nombre;
    try {
        await withLoading(loadUserData);
    } catch (error) {
        showConnectionError(error);
    }
}

async function logout() {
    try {
        await withLoading(() => window.finanzDB.logout());
        state.user = null;
        state.transactions = [];
        state.budgets = [];
        state.debts = [];
        state.goals = [];
        state.categories = [];
        [categoryChart, monthlyTrendChart, simChart].forEach(chart => chart?.destroy());
        categoryChart = monthlyTrendChart = simChart = null;
        document.getElementById('appLayout').hidden = true;
        document.getElementById('authScreen').hidden = false;
        document.getElementById('authForm').reset();
        document.getElementById('authForm').dataset.mode = 'login';
        document.getElementById('authNameGroup').hidden = true;
        document.getElementById('authName').required = false;
        document.getElementById('authPassword').minLength = 1;
        document.getElementById('authTitle').textContent = 'Iniciar sesión';
        document.getElementById('authSubmit').textContent = 'Iniciar sesión';
        document.getElementById('authModeToggle').textContent = '¿Primera vez? Crear cuenta';
        document.getElementById('authMessage').textContent = '';
        showToast('Sesión cerrada correctamente.', 'success');
    } catch (error) {
        showToast(error.message || 'No se pudo cerrar la sesión.', 'error');
    }
}

function getCurrentMonthKey() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function initNavigation() {
    document.querySelectorAll('.nav-item[data-tab]').forEach(item => {
        item.addEventListener('click', event => {
            event.preventDefault();
            const tabId = item.dataset.tab;
            document.querySelectorAll('.nav-item').forEach(nav => nav.classList.toggle('active', nav === item));
            document.querySelectorAll('.tab-content').forEach(tab => {
                const active = tab.id === `${tabId}-tab`;
                tab.classList.toggle('active', active);
                tab.setAttribute('aria-hidden', String(!active));
            });
        });
    });

    document.getElementById('goToTransactions')?.addEventListener('click', event => {
        event.preventDefault();
        document.querySelector('[data-tab="transactions"]').click();
    });
}

function initTheme() {
    const themeButton = document.getElementById('themeToggleBtn');
    const savedTheme = localStorage.getItem('finanzapp-theme');
    document.documentElement.dataset.theme = savedTheme === 'light' ? 'light' : 'dark';
    updateThemeButton();
    themeButton.addEventListener('click', () => {
        document.documentElement.dataset.theme =
            document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
        localStorage.setItem('finanzapp-theme', document.documentElement.dataset.theme);
        updateThemeButton();
        refreshChartTheme();
    });
}

function updateThemeButton() {
    const isDark = document.documentElement.dataset.theme === 'dark';
    const button = document.getElementById('themeToggleBtn');
    button.querySelector('span').textContent = isDark ? 'Modo Oscuro' : 'Modo Claro';
    button.querySelector('i').className = `fa-solid ${isDark ? 'fa-moon' : 'fa-sun'}`;
}

function initModals() {
    document.querySelectorAll('[data-close-modal]').forEach(button => {
        button.addEventListener('click', () => closeModal(button.closest('.modal-backdrop')));
    });
    document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
        backdrop.addEventListener('click', event => {
            if (event.target === backdrop) closeModal(backdrop);
        });
    });
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape') {
            const activeModal = document.querySelector('.modal-backdrop.active');
            if (activeModal) closeModal(activeModal);
        }
    });

    document.getElementById('openAddTransactionModal').addEventListener('click', () => openTransactionForm());
    document.getElementById('openBudgetModal').addEventListener('click', () => openBudgetForm());
    document.getElementById('openDebtModal').addEventListener('click', () => openDebtForm());
    document.getElementById('openGoalModal').addEventListener('click', () => openGoalForm());
}

function openModal(id) {
    const modal = document.getElementById(id);
    modal.classList.add('active');
    modal.setAttribute('aria-hidden', 'false');
    modal.querySelector('input:not([type="hidden"]), select')?.focus();
}

function closeModal(modal) {
    if (!modal) return;
    modal.classList.remove('active');
    modal.setAttribute('aria-hidden', 'true');
}

function setTodayAsDefault() {
    const today = new Date();
    const localDate = new Date(today.getTime() - today.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    document.getElementById('txDate').value = localDate;
}

async function loadUserData() {
    const sequence = ++state.loadSequence;
    const data = await window.finanzDB.loadAll();
    if (sequence !== state.loadSequence) return;
    state.transactions = data.transactions.map(transaction => ({
        id: String(transaction.id),
        type: transaction.tipo === 'ingreso' ? 'INCOME' : 'EXPENSE',
        amount: Number(transaction.monto),
        date: String(transaction.fecha).slice(0, 10),
        category: transaction.categoria || 'Sin categoría',
        description: transaction.descripcion || ''
    }));
    state.budgets = data.budgets.map(budget => ({
        id: String(budget.id), category: budget.categoria, limit: Number(budget.limite)
    }));
    state.goals = data.goals.map(goal => ({
        id: String(goal.id), title: goal.titulo, target: Number(goal.objetivo), current: Number(goal.actual)
    }));
    state.debts = data.debts.map(debt => ({
        id: String(debt.id), title: debt.titulo, total: Number(debt.total),
        paid: Number(debt.pagado), dueDate: debt.vence_el ? String(debt.vence_el).slice(0, 10) : ''
    }));
    state.categories = data.categories || [];
    updateCategoryFilter();
    renderAll();
    document.getElementById('connectionStatus').textContent = 'Conectado y sincronizado';
    document.getElementById('connectionStatus').classList.remove('error');
}

function renderAll() {
    renderKPIs();
    renderRecentTransactions();
    renderAllTransactions();
    renderCategoryChart();
    renderMonthlyTrendChart();
    renderBudgets();
    renderDebts();
    renderGoals();
}

function renderKPIs() {
    const currentMonth = getCurrentMonthKey();
    const income = state.transactions
        .filter(transaction => transaction.type === 'INCOME' && transaction.date.startsWith(currentMonth))
        .reduce((sum, transaction) => sum + transaction.amount, 0);
    const expense = state.transactions
        .filter(transaction => transaction.type === 'EXPENSE' && transaction.date.startsWith(currentMonth))
        .reduce((sum, transaction) => sum + transaction.amount, 0);
    const balance = state.transactions.reduce((sum, transaction) =>
        sum + (transaction.type === 'INCOME' ? transaction.amount : -transaction.amount), 0);
    const savingsRate = income > 0 ? ((income - expense) / income) * 100 : 0;

    document.getElementById('kpiBalance').textContent = formatCurrency(balance);
    document.getElementById('kpiIncome').textContent = formatCurrency(income);
    document.getElementById('kpiExpense').textContent = formatCurrency(expense);
    document.getElementById('kpiSavingsRate').textContent = `${savingsRate.toFixed(1)}%`;
}

function renderRecentTransactions() {
    const rows = [...state.transactions].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);
    const tbody = document.getElementById('recentTransactionsTable');
    tbody.replaceChildren();
    if (!rows.length) return appendEmptyRow(tbody, 5, 'Todavía no hay transacciones para este perfil.');
    rows.forEach(transaction => {
        const row = document.createElement('tr');
        addCell(row, transaction.date);
        addCell(row, transaction.category, 'badge');
        addCell(row, transaction.description);
        const type = addCell(row, transaction.type === 'INCOME' ? 'Ingreso' : 'Gasto');
        type.className = transaction.type === 'INCOME' ? 'positive' : 'negative';
        addCell(row, formatCurrency(transaction.amount));
        tbody.appendChild(row);
    });
}

function renderAllTransactions() {
    const tbody = document.getElementById('allTransactionsTable');
    tbody.replaceChildren();
    const search = document.getElementById('searchInput').value.trim().toLocaleLowerCase();
    const typeFilter = document.getElementById('filterType').value;
    const categoryFilter = document.getElementById('filterCategory').value;
    const filtered = state.transactions.filter(transaction =>
        transaction.description.toLocaleLowerCase().includes(search) &&
        (typeFilter === 'ALL' || transaction.type === typeFilter) &&
        (categoryFilter === 'ALL' || transaction.category === categoryFilter)
    );
    if (!filtered.length) return appendEmptyRow(tbody, 6, 'No hay transacciones que coincidan.');

    filtered.forEach(transaction => {
        const row = document.createElement('tr');
        addCell(row, transaction.date);
        addCell(row, transaction.category);
        addCell(row, transaction.description);
        const type = addCell(row, transaction.type === 'INCOME' ? 'Ingreso' : 'Gasto');
        type.className = transaction.type === 'INCOME' ? 'positive' : 'negative';
        addCell(row, formatCurrency(transaction.amount));
        const actions = document.createElement('td');
        actions.append(
            createActionButton('edit-transaction', transaction.id, 'Editar transacción', 'fa-pen'),
            createActionButton('delete-transaction', transaction.id, 'Eliminar transacción', 'fa-trash')
        );
        row.appendChild(actions);
        tbody.appendChild(row);
    });
}

function renderCategoryChart() {
    const byCategory = new Map();
    state.transactions.filter(transaction => transaction.type === 'EXPENSE')
        .forEach(transaction => byCategory.set(transaction.category,
            (byCategory.get(transaction.category) || 0) + transaction.amount));
    if (categoryChart) categoryChart.destroy();
    const colors = ['#6366f1', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#06b6d4', '#ec4899'];
    categoryChart = new Chart(document.getElementById('categoryChart'), {
        type: 'doughnut',
        data: {
            labels: byCategory.size ? [...byCategory.keys()] : ['Sin gastos'],
            datasets: [{ data: byCategory.size ? [...byCategory.values()] : [1], backgroundColor: colors }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
    });
    refreshChartTheme();
}

function renderMonthlyTrendChart() {
    const months = [];
    const now = new Date();
    for (let offset = 5; offset >= 0; offset--) {
        const date = new Date(now.getFullYear(), now.getMonth() - offset, 1);
        months.push({
            key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`,
            label: new Intl.DateTimeFormat('es', { month: 'short' }).format(date)
        });
    }
    const incomes = months.map(month => sumForMonth(month.key, 'INCOME'));
    const expenses = months.map(month => sumForMonth(month.key, 'EXPENSE'));
    if (monthlyTrendChart) monthlyTrendChart.destroy();
    monthlyTrendChart = new Chart(document.getElementById('monthlyTrendChart'), {
        type: 'bar',
        data: {
            labels: months.map(month => month.label),
            datasets: [
                { label: 'Ingresos', data: incomes, backgroundColor: '#10b981' },
                { label: 'Gastos', data: expenses, backgroundColor: '#ef4444' }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            scales: { x: { grid: { display: false } }, y: { beginAtZero: true } }
        }
    });
    refreshChartTheme();
}

function sumForMonth(month, type) {
    return state.transactions.filter(transaction => transaction.date.startsWith(month) && transaction.type === type)
        .reduce((sum, transaction) => sum + transaction.amount, 0);
}

function renderBudgets() {
    const container = document.getElementById('budgetsList');
    container.replaceChildren();
    if (!state.budgets.length) return appendEmptyCard(container, 'Todavía no hay presupuestos.');
    state.budgets.forEach(budget => {
        const spent = state.transactions
            .filter(transaction => transaction.type === 'EXPENSE' && transaction.category === budget.category &&
                transaction.date.startsWith(getCurrentMonthKey()))
            .reduce((sum, transaction) => sum + transaction.amount, 0);
        const percent = budget.limit ? Math.min((spent / budget.limit) * 100, 100) : 0;
        const card = createProgressCard(budget.category, `${formatCurrency(spent)} / ${formatCurrency(budget.limit)}`,
            percent, spent > budget.limit ? 'var(--accent-red)' : 'var(--accent-blue)',
            `${percent.toFixed(0)}% del límite utilizado`);
        card.append(
            createActionButton('edit-budget', budget.id, 'Editar presupuesto', 'fa-pen'),
            createActionButton('delete-budget', budget.id, 'Eliminar presupuesto', 'fa-trash')
        );
        container.appendChild(card);
    });
}

function renderDebts() {
    const container = document.getElementById('debtsList');
    container.replaceChildren();
    if (!state.debts.length) return appendEmptyCard(container, 'Todavía no hay deudas registradas.');
    state.debts.forEach(debt => {
        const percent = debt.total ? Math.min((debt.paid / debt.total) * 100, 100) : 0;
        const card = createProgressCard(debt.title, `Vence: ${debt.dueDate || 'Sin fecha'}`, percent,
            'var(--accent-purple)', `Pagado: ${formatCurrency(debt.paid)} · Total: ${formatCurrency(debt.total)}`);
        card.append(
            createActionButton('edit-debt', debt.id, 'Editar deuda', 'fa-pen'),
            createActionButton('delete-debt', debt.id, 'Eliminar deuda', 'fa-trash')
        );
        container.appendChild(card);
    });
}

function renderGoals() {
    const container = document.getElementById('goalsList');
    container.replaceChildren();
    if (!state.goals.length) return appendEmptyCard(container, 'Todavía no hay metas de ahorro.');
    state.goals.forEach(goal => {
        const percent = goal.target ? Math.min((goal.current / goal.target) * 100, 100) : 0;
        const card = createProgressCard(goal.title, `${percent.toFixed(0)}%`, percent, 'var(--accent-green)',
            `Ahorrado: ${formatCurrency(goal.current)} · Meta: ${formatCurrency(goal.target)}`);
        card.append(
            createActionButton('edit-goal', goal.id, 'Editar meta', 'fa-pen'),
            createActionButton('delete-goal', goal.id, 'Eliminar meta', 'fa-trash')
        );
        container.appendChild(card);
    });
}

function createProgressCard(title, value, percent, color, detail) {
    const card = document.createElement('article');
    card.className = 'budget-card';
    const header = document.createElement('div');
    header.className = 'progress-card-header';
    const heading = document.createElement('strong');
    heading.textContent = title;
    const amount = document.createElement('span');
    amount.textContent = value;
    header.append(heading, amount);
    const progress = document.createElement('div');
    progress.className = 'progress-bar-bg';
    const fill = document.createElement('div');
    fill.className = 'progress-bar-fill';
    fill.style.width = `${percent}%`;
    fill.style.background = color;
    progress.appendChild(fill);
    const caption = document.createElement('span');
    caption.className = 'progress-detail';
    caption.textContent = detail;
    card.append(header, progress, caption);
    return card;
}

function initForms() {
    document.getElementById('txForm').addEventListener('submit', async event => {
        event.preventDefault();
        const form = event.currentTarget;
        if (!form.reportValidity()) return;
        const transaction = {
            id: document.getElementById('txId').value || null,
            type: document.getElementById('txType').value,
            amount: Number(document.getElementById('txAmount').value),
            category: document.getElementById('txCategory').value,
            date: document.getElementById('txDate').value,
            description: document.getElementById('txDescription').value
        };
        const saved = await mutate(
            async () => {
                await window.finanzDB.saveTransaction(transaction);
                await loadUserData();
            },
            transaction.id ? 'Transacción actualizada.' : 'Transacción guardada.'
        );
        if (saved) {
            closeModal(document.getElementById('transactionModal'));
            form.reset();
            document.getElementById('txId').value = '';
            setTodayAsDefault();
        }
    });

    document.getElementById('budgetForm').addEventListener('submit', event => submitForm(event, async () => {
        const budget = {
            id: document.getElementById('budgetId').value || null,
            category: document.getElementById('budgetCategory').value,
            limit: Number(document.getElementById('budgetLimit').value)
        };
        await window.finanzDB.saveBudget(budget);
        await loadUserData();
    }, 'Presupuesto guardado.', 'budgetModal'));

    document.getElementById('goalForm').addEventListener('submit', event => submitForm(event, async () => {
        const goal = {
            id: document.getElementById('goalId').value || null,
            title: document.getElementById('goalTitle').value,
            target: Number(document.getElementById('goalTarget').value),
            current: Number(document.getElementById('goalCurrent').value)
        };
        await window.finanzDB.saveGoal(goal);
        await loadUserData();
    }, 'Meta guardada.', 'goalModal'));

    document.getElementById('debtForm').addEventListener('submit', event => submitForm(event, async () => {
        const debt = {
            id: document.getElementById('debtId').value || null,
            title: document.getElementById('debtTitle').value,
            total: Number(document.getElementById('debtTotal').value),
            paid: Number(document.getElementById('debtPaid').value),
            dueDate: document.getElementById('debtDueDate').value
        };
        await window.finanzDB.saveDebt(debt);
        await loadUserData();
    }, 'Deuda guardada.', 'debtModal'));

    ['txForm', 'budgetForm', 'debtForm', 'goalForm'].forEach(id => {
        const form = document.getElementById(id);
        form.addEventListener('input', validateField);
        form.addEventListener('change', validateField);
        form.addEventListener('reset', () => window.setTimeout(() => {
            form.querySelectorAll('.is-valid, .is-invalid').forEach(field => {
                field.classList.remove('is-valid', 'is-invalid');
                field.removeAttribute('aria-invalid');
                field.setCustomValidity('');
            });
        }));
    });
    document.getElementById('debtPaid').addEventListener('input', validateDebtAmounts);
    document.getElementById('debtTotal').addEventListener('input', validateDebtAmounts);
    document.getElementById('goalCurrent').addEventListener('input', validateGoalAmounts);
    document.getElementById('goalTarget').addEventListener('input', validateGoalAmounts);
}

async function submitForm(event, action, successMessage, modalId) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const saved = await mutate(action, successMessage);
    if (saved) {
        closeModal(document.getElementById(modalId));
        form.reset();
    }
}

function validateField(event) {
    const field = event.target;
    if (!(field instanceof HTMLInputElement || field instanceof HTMLSelectElement)) return;
    field.classList.toggle('is-invalid', !field.validity.valid);
    field.classList.toggle('is-valid', field.validity.valid && Boolean(field.value));
    field.setAttribute('aria-invalid', String(!field.validity.valid));
}

function validateDebtAmounts() {
    const total = document.getElementById('debtTotal');
    const paid = document.getElementById('debtPaid');
    paid.setCustomValidity(Number(paid.value) > Number(total.value) ? 'El monto pagado no puede superar el total.' : '');
    validateField({ target: paid });
}

function validateGoalAmounts() {
    const target = document.getElementById('goalTarget');
    const current = document.getElementById('goalCurrent');
    current.setCustomValidity(Number(current.value) > Number(target.value) ? 'El monto ahorrado no puede superar el objetivo.' : '');
    validateField({ target: current });
}

function initFilters() {
    document.getElementById('searchInput').addEventListener('input', renderAllTransactions);
    document.getElementById('filterType').addEventListener('change', renderAllTransactions);
    document.getElementById('filterCategory').addEventListener('change', renderAllTransactions);
}

function updateCategoryFilter() {
    const filter = document.getElementById('filterCategory');
    const selected = filter.value;
    const categories = [...new Set([
        ...state.categories,
        ...state.transactions.map(transaction => transaction.category)
    ])].sort();
    filter.replaceChildren(new Option('Todas las categorías', 'ALL'));
    categories.forEach(category => filter.add(new Option(category, category)));
    filter.value = categories.includes(selected) ? selected : 'ALL';
    const transactionCategory = document.getElementById('txCategory');
    const currentCategory = transactionCategory.value;
    transactionCategory.replaceChildren();
    categories.forEach(category => transactionCategory.add(new Option(category, category)));
    if (categories.includes(currentCategory)) transactionCategory.value = currentCategory;
}

function initActions() {
    document.body.addEventListener('click', async event => {
        const button = event.target.closest('[data-action]');
        if (!button) return;
        const { action, id } = button.dataset;
        if (action.startsWith('delete-') && !window.confirm('¿Querés eliminar este registro? Esta acción no se puede deshacer.')) return;

        const operations = {
            'edit-transaction': () => openTransactionForm(state.transactions.find(item => item.id === id)),
            'edit-budget': () => openBudgetForm(state.budgets.find(item => item.id === id)),
            'edit-debt': () => openDebtForm(state.debts.find(item => item.id === id)),
            'edit-goal': () => openGoalForm(state.goals.find(item => item.id === id)),
            'delete-transaction': () => deleteRecord(() => window.finanzDB.deleteTransaction(id), 'Transacción eliminada.'),
            'delete-budget': () => deleteRecord(() => window.finanzDB.deleteBudget(id), 'Presupuesto eliminado.'),
            'delete-debt': () => deleteRecord(() => window.finanzDB.deleteDebt(id), 'Deuda eliminada.'),
            'delete-goal': () => deleteRecord(() => window.finanzDB.deleteGoal(id), 'Meta eliminada.')
        };
        if (operations[action]) await operations[action]();
    });

    document.getElementById('exportJsonBtn').addEventListener('click', exportData);
    document.getElementById('logoutBtn').addEventListener('click', logout);
}

async function deleteRecord(remove, message) {
    await mutate(async () => {
        await remove();
        await loadUserData();
    }, message);
}

function openTransactionForm(transaction) {
    const form = document.getElementById('txForm');
    form.reset();
    setTodayAsDefault();
    document.getElementById('txId').value = transaction?.id || '';
    document.getElementById('txType').value = transaction?.type || 'EXPENSE';
    document.getElementById('txAmount').value = transaction?.amount ?? '';
    document.getElementById('txCategory').value = transaction?.category || 'Alimentación';
    document.getElementById('txDate').value = transaction?.date || document.getElementById('txDate').value;
    document.getElementById('txDescription').value = transaction?.description || '';
    document.querySelector('#transactionModal h3').textContent = transaction ? 'Editar transacción' : 'Nueva Transacción';
    openModal('transactionModal');
}

function openBudgetForm(budget) {
    document.getElementById('budgetForm').reset();
    document.getElementById('budgetId').value = budget?.id || '';
    document.getElementById('budgetCategory').value = budget?.category || '';
    document.getElementById('budgetLimit').value = budget?.limit ?? '';
    document.getElementById('budgetModalTitle').textContent = budget ? 'Editar presupuesto' : 'Nuevo presupuesto';
    openModal('budgetModal');
}

function openDebtForm(debt) {
    document.getElementById('debtForm').reset();
    document.getElementById('debtId').value = debt?.id || '';
    document.getElementById('debtTitle').value = debt?.title || '';
    document.getElementById('debtTotal').value = debt?.total ?? '';
    document.getElementById('debtPaid').value = debt?.paid ?? 0;
    document.getElementById('debtDueDate').value = debt?.dueDate || '';
    document.getElementById('debtModalTitle').textContent = debt ? 'Editar deuda' : 'Registrar deuda';
    openModal('debtModal');
}

function openGoalForm(goal) {
    document.getElementById('goalForm').reset();
    document.getElementById('goalId').value = goal?.id || '';
    document.getElementById('goalTitle').value = goal?.title || '';
    document.getElementById('goalTarget').value = goal?.target ?? '';
    document.getElementById('goalCurrent').value = goal?.current ?? 0;
    document.getElementById('goalModalTitle').textContent = goal ? 'Editar meta' : 'Nueva meta';
    openModal('goalModal');
}

function initSimulator() {
    document.getElementById('simForm').addEventListener('submit', event => {
        event.preventDefault();
        calculateSimulation();
    });
    calculateSimulation();
}

function calculateSimulation() {
    const principal = Number(document.getElementById('simInitial').value);
    const monthlyPayment = Number(document.getElementById('simMonthly').value);
    const monthlyRate = Number(document.getElementById('simRate').value) / 1200;
    const years = Number(document.getElementById('simYears').value);
    if (![principal, monthlyPayment, monthlyRate, years].every(Number.isFinite) || years < 1 || years > 80) return;

    let balance = principal;
    let invested = principal;
    const labels = [];
    const balances = [];
    const investedValues = [];
    for (let month = 1; month <= years * 12; month++) {
        balance = balance * (1 + monthlyRate) + monthlyPayment;
        invested += monthlyPayment;
        if (month % 12 === 0) {
            labels.push(`Año ${month / 12}`);
            balances.push(Number(balance.toFixed(2)));
            investedValues.push(Number(invested.toFixed(2)));
        }
    }
    document.getElementById('simTotalInvested').textContent = formatCurrency(invested);
    document.getElementById('simTotalInterest').textContent = formatCurrency(balance - invested);
    document.getElementById('simFinalAmount').textContent = formatCurrency(balance);
    renderSimChart(labels, balances, investedValues);
}

function renderSimChart(labels, balances, invested) {
    if (simChart) simChart.destroy();
    simChart = new Chart(document.getElementById('simChart'), {
        type: 'line',
        data: {
            labels,
            datasets: [
                { label: 'Monto total estimado', data: balances, borderColor: '#6366f1', fill: false },
                { label: 'Total invertido', data: invested, borderColor: '#9ca3af', borderDash: [5, 5], fill: false }
            ]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });
    refreshChartTheme();
}

function refreshChartTheme() {
    const styles = getComputedStyle(document.documentElement);
    const textColor = styles.getPropertyValue('--text-secondary').trim();
    const gridColor = styles.getPropertyValue('--border-color').trim();
    [categoryChart, monthlyTrendChart, simChart].filter(Boolean).forEach(chart => {
        if (chart.options.plugins?.legend) {
            chart.options.plugins.legend.labels = { ...chart.options.plugins.legend.labels, color: textColor };
        }
        if (chart.options.scales) {
            Object.values(chart.options.scales).forEach(scale => {
                scale.ticks = { ...scale.ticks, color: textColor };
                scale.grid = { ...scale.grid, color: gridColor };
            });
        }
        chart.update();
    });
}

async function mutate(action, successMessage) {
    try {
        await withLoading(action);
        showToast(successMessage, 'success');
        return true;
    } catch (error) {
        showToast(error.message || 'No se pudo completar la operación.', 'error');
        return false;
    }
}

async function withLoading(action) {
    state.pending += 1;
    const indicator = document.getElementById('loadingIndicator');
    indicator.hidden = false;
    try {
        return await action();
    } finally {
        state.pending -= 1;
        indicator.hidden = state.pending === 0;
    }
}

function showConnectionError(error) {
    const message = error.message || 'No se pudo establecer conexión.';
    const status = document.getElementById('connectionStatus');
    status.textContent = `Error de conexión: ${message}`;
    status.classList.add('error');
    showToast(message, 'error');
}

function showAuthMessage(message, type = '') {
    const status = document.getElementById('authMessage');
    status.textContent = message;
    status.classList.toggle('error', type === 'error');
    status.classList.toggle('success', type === 'success');
}

function showToast(message, type) {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.setAttribute('role', type === 'error' ? 'alert' : 'status');
    toast.textContent = message;
    const region = document.getElementById('toastRegion');
    region.appendChild(toast);
    window.setTimeout(() => {
        toast.classList.add('toast-leaving');
        toast.addEventListener('transitionend', () => toast.remove(), { once: true });
        window.setTimeout(() => toast.remove(), 350);
    }, 3500);
}

function exportData() {
    const file = new Blob([JSON.stringify({
        usuario: state.user, transacciones: state.transactions, presupuestos: state.budgets,
        deudas: state.debts, metas: state.goals, exportadoEn: new Date().toISOString()
    }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(file);
    const link = document.createElement('a');
    link.href = url;
    link.download = `finanzapp-${state.user?.nombre || 'usuario'}.json`;
    link.click();
    URL.revokeObjectURL(url);
}

function appendEmptyRow(tbody, colspan, message) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = colspan;
    cell.className = 'empty-state';
    cell.textContent = message;
    row.appendChild(cell);
    tbody.appendChild(row);
}

function appendEmptyCard(container, message) {
    const empty = document.createElement('p');
    empty.className = 'empty-state';
    empty.textContent = message;
    container.appendChild(empty);
}

function addCell(row, value, className = '') {
    const cell = document.createElement('td');
    cell.textContent = value;
    if (className) cell.className = className;
    row.appendChild(cell);
    return cell;
}

function createActionButton(action, id, label, icon) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn btn-outline btn-icon';
    button.dataset.action = action;
    button.dataset.id = id;
    button.setAttribute('aria-label', label);
    button.title = label;
    const element = document.createElement('i');
    element.className = `fa-solid ${icon}`;
    button.appendChild(element);
    return button;
}

function formatCurrency(value) {
    return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(Number(value) || 0);
}