// Cliente del API same-origin. El driver y la cadena de conexión viven en el Worker / Servidor Node.
async function apiRequest(path, { method = 'GET', body } = {}) {
    let response;
    try {
        response = await fetch(`/api${path}`, {
            method,
            credentials: 'same-origin',
            headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
            body: body === undefined ? undefined : JSON.stringify(body)
        });
    } catch (error) {
        console.error('No se pudo contactar al API de FinanzApp:', error);
        throw new Error('No se pudo contactar el servicio. Verificá tu conexión e intentá otra vez.');
    }

    const responseText = await response.text();
    let result = null;
    try {
        result = responseText ? JSON.parse(responseText) : null;
    } catch (error) {
        console.error(`El API devolvió una respuesta no JSON (HTTP ${response.status}).`);
    }

    if (!response.ok) {
        let message = result?.error;
        if (!message && response.status === 404) {
            message = 'No se encontró la ruta del API solicitada (HTTP 404). Verificá que el servidor esté actualizado.';
        } else if (!message && response.status >= 500) {
            message = `El servidor no pudo completar la solicitud (HTTP ${response.status}). Revisá la consola del servidor para ver el detalle.`;
        } else if (!message) {
            message = `No se pudo completar la solicitud (HTTP ${response.status}).`;
        }
        const error = new Error(message);
        error.status = response.status;
        throw error;
    }

    if (!result || typeof result !== 'object') {
        throw new Error(`El servidor devolvió una respuesta inválida (HTTP ${response.status}).`);
    }
    return result;
}

window.finanzDB = {
    async session() {
        try {
            const { user } = await apiRequest('/session');
            return user;
        } catch (error) {
            if (error.status === 401) return null;
            throw error;
        }
    },

    async login(email, password) {
        return apiRequest('/login', { method: 'POST', body: { email, password } });
    },

    async register(name, email, password) {
        return apiRequest('/register', { method: 'POST', body: { name, email, password } });
    },

    async logout() {
        return apiRequest('/logout', { method: 'POST' });
    },

    async loadAll() {
        return apiRequest('/data');
    },

    async saveTransaction(transaction) {
        const id = transaction.id ? `/${encodeURIComponent(transaction.id)}` : '';
        return apiRequest(`/transactions${id}`, {
            method: transaction.id ? 'PUT' : 'POST',
            body: transaction
        });
    },

    async deleteTransaction(id) {
        return apiRequest(`/transactions/${encodeURIComponent(id)}`, { method: 'DELETE' });
    },

    async saveBudget(budget) {
        const id = budget.id ? `/${encodeURIComponent(budget.id)}` : '';
        return apiRequest(`/budgets${id}`, { method: budget.id ? 'PUT' : 'POST', body: budget });
    },

    async deleteBudget(id) {
        return apiRequest(`/budgets/${encodeURIComponent(id)}`, { method: 'DELETE' });
    },

    async saveGoal(goal) {
        const id = goal.id ? `/${encodeURIComponent(goal.id)}` : '';
        return apiRequest(`/goals${id}`, { method: goal.id ? 'PUT' : 'POST', body: goal });
    },

    async deleteGoal(id) {
        return apiRequest(`/goals/${encodeURIComponent(id)}`, { method: 'DELETE' });
    },

    async saveDebt(debt) {
        const id = debt.id ? `/${encodeURIComponent(debt.id)}` : '';
        return apiRequest(`/debts${id}`, { method: debt.id ? 'PUT' : 'POST', body: debt });
    },

    async deleteDebt(id) {
        return apiRequest(`/debts/${encodeURIComponent(id)}`, { method: 'DELETE' });
    }
};