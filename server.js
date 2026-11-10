require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret';

// Configuración de la conexión segura a Neon PostgreSQL
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

app.use(express.json());
app.use(cookieParser());

// Servir archivos estáticos del frontend desde la carpeta 'public'
app.use(express.static(path.join(__dirname, 'public')));

// Middleware de autenticación por Token JWT en Cookies
function authenticateToken(req, res, next) {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ error: 'No autorizado. Inicie sesión.' });

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: 'Sesión expirada o inválida.' });
        req.user = user;
        next();
    });
}

// --- ENDPOINTS DE AUTENTICACIÓN ---

app.post('/api/register', async (req, res) => {
    try {
        const { name, email, password } = req.body;
        if (!name || !email || !password || password.length < 12) {
            return res.status(400).json({ error: 'Datos inválidos. La contraseña debe tener al menos 12 caracteres.' });
        }

        const userCheck = await pool.query('SELECT id FROM usuarios WHERE email = $1', [email]);
        if (userCheck.rows.length > 0) {
            return res.status(400).json({ error: 'El correo electrónico ya está registrado.' });
        }

        const saltRounds = 10;
        const password_hash = await bcrypt.hash(password, saltRounds);

        const newUser = await pool.query(
            'INSERT INTO usuarios (nombre, email, password_hash) VALUES ($1, $2, $3) RETURNING id, nombre, email',
            [name, email, password_hash]
        );

        const user = newUser.rows[0];
        const token = jwt.sign({ id: user.id, email: user.email, nombre: user.nombre }, JWT_SECRET, { expiresIn: '7d' });

        res.cookie('token', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict' });
        res.json({ user: { id: user.id, nombre: user.nombre, email: user.email } });
    } catch (error) {
        console.error('Error en registro:', error);
        res.status(500).json({ error: 'Error interno del servidor al registrar.' });
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const result = await pool.query('SELECT * FROM usuarios WHERE email = $1', [email]);
        if (result.rows.length === 0) {
            return res.status(400).json({ error: 'Credenciales inválidas.' });
        }

        const user = result.rows[0];
        const validPassword = await bcrypt.compare(password, user.password_hash);
        if (!validPassword) {
            return res.status(400).json({ error: 'Credenciales inválidas.' });
        }

        const token = jwt.sign({ id: user.id, email: user.email, nombre: user.nombre }, JWT_SECRET, { expiresIn: '7d' });

        res.cookie('token', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict' });
        res.json({ user: { id: user.id, nombre: user.nombre, email: user.email } });
    } catch (error) {
        console.error('Error en login:', error);
        res.status(500).json({ error: 'Error interno del servidor al iniciar sesión.' });
    }
});

app.post('/api/logout', (req, res) => {
    res.clearCookie('token');
    res.json({ success: true });
});

app.get('/api/session', authenticateToken, (req, res) => {
    res.json({ user: { id: req.user.id, nombre: req.user.nombre, email: req.user.email } });
});

// --- ENDPOINTS DE DATOS (Aislados por usuario) ---

app.get('/api/data', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const [transactions, budgets, debts, goals] = await Promise.all([
            pool.query(
                `SELECT t.*, c.nombre AS categoria
                 FROM transacciones t
                 LEFT JOIN categorias c
                    ON c.id = t.categoria_id
                    AND (c.usuario_id = t.usuario_id OR c.usuario_id IS NULL)
                 WHERE t.usuario_id = $1
                 ORDER BY t.fecha DESC`,
                [userId]
            ),
            pool.query('SELECT * FROM presupuestos WHERE usuario_id = $1', [userId]),
            pool.query('SELECT * FROM deudas WHERE usuario_id = $1', [userId]),
            pool.query('SELECT * FROM metas WHERE usuario_id = $1', [userId])
        ]);

        res.json({
            transactions: transactions.rows,
            budgets: budgets.rows,
            debts: debts.rows,
            goals: goals.rows,
            categories: ['Alimentación', 'Vivienda', 'Transporte', 'Servicios', 'Ocio/Entretenimiento', 'Salud', 'Sueldo', 'Freelance', 'Inversiones', 'Otros']
        });
    } catch (error) {
        console.error('Error al cargar datos:', error);
        res.status(500).json({ error: 'Error al obtener los datos.' });
    }
});

// Transacciones CRUD
async function findOrCreateCategoryId(userId, category, type) {
    const existing = await pool.query(
        `SELECT id
         FROM categorias
         WHERE nombre = $1 AND tipo = $2 AND (usuario_id = $3 OR usuario_id IS NULL)
         ORDER BY (usuario_id = $3) DESC
         LIMIT 1`,
        [category, type, userId]
    );
    if (existing.rows.length) return existing.rows[0].id;

    const created = await pool.query(
        'INSERT INTO categorias (usuario_id, nombre, tipo) VALUES ($1, $2, $3) RETURNING id',
        [userId, category, type]
    );
    return created.rows[0].id;
}

app.post('/api/transactions', authenticateToken, async (req, res) => {
    try {
        const { type, amount, category, date, description } = req.body;
        const tipoDb = type === 'INCOME' ? 'ingreso' : 'gasto';
        const categoriaId = await findOrCreateCategoryId(req.user.id, category, tipoDb);
        const result = await pool.query(
            `INSERT INTO transacciones
                (usuario_id, categoria_id, monto, moneda, tipo, descripcion, fecha)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING *`,
            [req.user.id, categoriaId, amount, 'ARS', tipoDb, description, date]
        );
        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error al guardar transacción en PostgreSQL:', error.message, {
            code: error.code,
            detail: error.detail,
            constraint: error.constraint,
            column: error.column
        });
        res.status(500).json({ error: 'Error al guardar transacción.' });
    }
});

app.put('/api/transactions/:id', authenticateToken, async (req, res) => {
    try {
        const { type, amount, category, date, description } = req.body;
        const tipoDb = type === 'INCOME' ? 'ingreso' : 'gasto';
        const categoriaId = await findOrCreateCategoryId(req.user.id, category, tipoDb);
        const result = await pool.query(
            `UPDATE transacciones
             SET tipo = $1, monto = $2, categoria_id = $3, fecha = $4, descripcion = $5
             WHERE id = $6 AND usuario_id = $7
             RETURNING *`,
            [tipoDb, amount, categoriaId, date, description, req.params.id, req.user.id]
        );
        res.json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: 'Error al actualizar transacción.' });
    }
});

app.delete('/api/transactions/:id', authenticateToken, async (req, res) => {
    try {
        await pool.query('DELETE FROM transacciones WHERE id = $1 AND usuario_id = $2', [req.params.id, req.user.id]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Error al eliminar transacción.' });
    }
});

// Presupuestos CRUD
app.post('/api/budgets', authenticateToken, async (req, res) => {
    try {
        const { category, limit } = req.body;
        const result = await pool.query(
            'INSERT INTO presupuestos (usuario_id, categoria, limite) VALUES ($1, $2, $3) RETURNING *',
            [req.user.id, category, limit]
        );
        res.json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: 'Error al guardar presupuesto.' });
    }
});

app.delete('/api/budgets/:id', authenticateToken, async (req, res) => {
    try {
        await pool.query('DELETE FROM presupuestos WHERE id = $1 AND usuario_id = $2', [req.params.id, req.user.id]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Error al eliminar presupuesto.' });
    }
});

// Metas CRUD
app.post('/api/goals', authenticateToken, async (req, res) => {
    try {
        const { title, target, current } = req.body;
        const result = await pool.query(
            'INSERT INTO metas (usuario_id, titulo, objetivo, actual) VALUES ($1, $2, $3, $4) RETURNING *',
            [req.user.id, title, target, current]
        );
        res.json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: 'Error al guardar meta.' });
    }
});

app.delete('/api/goals/:id', authenticateToken, async (req, res) => {
    try {
        await pool.query('DELETE FROM metas WHERE id = $1 AND usuario_id = $2', [req.params.id, req.user.id]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Error al eliminar meta.' });
    }
});

// Deudas CRUD
app.post('/api/debts', authenticateToken, async (req, res) => {
    try {
        const { title, total, paid, dueDate } = req.body;
        const result = await pool.query(
            'INSERT INTO deudas (usuario_id, titulo, total, pagado, vence_el) VALUES ($1, $2, $3, $4, $5) RETURNING *',
            [req.user.id, title, total, paid, dueDate || null]
        );
        res.json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: 'Error al guardar deuda.' });
    }
});

app.delete('/api/debts/:id', authenticateToken, async (req, res) => {
    try {
        await pool.query('DELETE FROM deudas WHERE id = $1 AND usuario_id = $2', [req.params.id, req.user.id]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Error al eliminar deuda.' });
    }
});

// Iniciar servidor
app.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
});