const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const csurf = require('csurf');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const session = require('express-session');
const saltRounds = 10;
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

console.log('Server - Initializing...');

// Middleware
app.use(cors({
    origin: process.env.NODE_ENV === 'production' ? 'https://teachertally.com' : 'http://localhost:3000',
    credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.use(session({
    secret: process.env.SESSION_SECRET || 'your-secret-here',
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        sameSite: 'Strict',
        secure: process.env.NODE_ENV === 'production',
        maxAge: 24 * 60 * 60 * 1000,
    },
}));

app.use(express.static(path.join(__dirname, 'public')));

app.use((req, res, next) => {
    if (req.path === '/api/ratings') return next();
    csurf({ cookie: true })(req, res, next);
});

app.use('/pages/components', express.static(path.join(__dirname, 'pages', 'components'), { maxAge: '1d' }));
app.use('/public', express.static(path.join(__dirname, 'public'), { maxAge: '1d' }));
app.use('/pages', express.static(path.join(__dirname, 'pages'), { maxAge: '1d' }));

app.use((req, res, next) => {
    console.log(`Server - Request: ${req.method} ${req.url}`);
    res.on('finish', () => {
        console.log(`Server - Response: ${req.method} ${req.url} - Status: ${res.statusCode}`);
    });
    next();
});

const csrfProtection = csurf({
    cookie: {
        httpOnly: true,
        sameSite: 'Strict',
        secure: process.env.NODE_ENV === 'production',
    },
    value: (req) => req.headers['x-csrf-token'] || req.body._csrf,
});

const publicLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: { error: 'Too many requests, please try again later.' },
});

const explicitWords = [
    'fuck', 'shit', 'ass', 'bitch', 'damn', 'piss', 'cunt', 'cock', 'dick', 'bastard',
].map(word => word.toLowerCase());

function filterComment(comment) {
    if (!comment || typeof comment !== 'string') return { cleanedComment: comment || '', isExplicit: false };
    const words = comment.toLowerCase().split(/\s+/);
    let isExplicit = false;
    const cleanedComment = words.map(word => {
        if (explicitWords.some(explicit => word.includes(explicit))) {
            isExplicit = true;
            return '[Redacted]';
        }
        return word;
    }).join(' ');
    return { cleanedComment, isExplicit };
}

function updateTeacherStats(teacherId, res) {
    db.all('SELECT rating FROM votes WHERE teacher_id = ?', [teacherId], (err, rows) => {
        if (err) {
            console.error('Server - Error fetching ratings:', err.message);
            return res.status(500).json({ error: 'Database error fetching ratings' });
        }
        const avgRating = rows.length ? rows.reduce((sum, r) => sum + r.rating, 0) / rows.length : 0;
        const ratingCount = rows.length;
        db.run('UPDATE teachers SET avg_rating = ?, rating_count = ? WHERE id = ?', [avgRating, ratingCount, teacherId], (err) => {
            if (err) {
                console.error('Server - Error updating teacher stats:', err.message);
                return res.status(500).json({ error: 'Database error updating teacher stats' });
            }
            console.log('Server - Teacher stats updated:', { teacherId, avgRating, ratingCount });
            res.json({ avg_rating: avgRating, rating_count: ratingCount });
        });
    });
}

const imageStorage = multer.diskStorage({
    destination: 'public/images/',
    filename: (req, file, cb) => {
        const ext = file.mimetype.split('/')[1];
        const prefix = req.path.includes('teacher-proposals') ? 'proposal' : 'teacher';
        const uniqueId = req.body.id || uuidv4();
        cb(null, `${prefix}_${uniqueId}.${ext}`);
    },
});
const uploadImage = multer({
    storage: imageStorage,
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['image/jpeg', 'image/png'];
        cb(null, allowedTypes.includes(file.mimetype));
    },
    limits: { fileSize: 5 * 1024 * 1024 },
});

const correctionStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = path.join(__dirname, 'public/uploads/corrections');
        require('fs').mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});
const uploadCorrection = multer({
    storage: correctionStorage,
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['image/jpeg', 'image/png', 'application/pdf', 'text/plain'];
        cb(null, allowedTypes.includes(file.mimetype));
    },
    limits: { fileSize: 5 * 1024 * 1024 },
}).single('file');

app.use((req, res, next) => {
    const visitorId = req.cookies.visitorId || uuidv4();
    if (!req.cookies.visitorId) {
        res.cookie('visitorId', visitorId, {
            maxAge: 365 * 24 * 60 * 60 * 1000,
            httpOnly: true,
            sameSite: 'Strict',
        });
    }
    db.run('INSERT INTO stats (visitor_id, timestamp) VALUES (?, ?)',
        [visitorId, new Date().toISOString()],
        err => err && console.error('Server - Error logging visit:', err.message));
    next();
});

const db = new sqlite3.Database('./database.sqlite', sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
    if (err) console.error('Server - Database connection error:', err.message);
    else console.log('Server - Connected to SQLite database');
});

function generateTempId() {
    return `TEMP-${uuidv4().slice(0, 8)}`;
}

db.serialize(() => {
    const checkTable = (tableName, expectedColumns, sql, callback) => {
        db.all(`PRAGMA table_info(${tableName})`, (err, columns) => {
            if (err) {
                console.error(`Server - Error checking table ${tableName}:`, err.message);
                callback(false);
                return;
            }
            if (columns.length === 0) {
                console.log(`Server - Table ${tableName} does not exist`);
                callback(false);
            } else {
                const columnNames = columns.map(col => col.name);
                const missingColumns = expectedColumns.filter(col => !columnNames.includes(col));
                if (missingColumns.length > 0) {
                    console.warn(`Server - Table ${tableName} missing columns: ${missingColumns.join(', ')}`);
                    callback(false);
                } else {
                    db.get(`PRAGMA foreign_key_check(${tableName})`, (err, result) => {
                        if (err) console.error(`Server - Error checking foreign keys for ${tableName}:`, err.message);
                        if (result && result.length > 0) {
                            console.warn(`Server - Foreign key issues in ${tableName}:`, result);
                            callback(false);
                        } else {
                            console.log(`Server - Table ${tableName} exists and is valid`);
                            callback(true);
                        }
                    });
                }
            }
        });
    };

    const tables = [
        {
            name: 'teachers',
            sql: `CREATE TABLE IF NOT EXISTS teachers (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                bio TEXT NOT NULL,
                description TEXT NOT NULL,
                classes TEXT NOT NULL,
                tags TEXT NOT NULL,
                room_number TEXT NOT NULL,
                schedule TEXT NOT NULL,
                image_link TEXT,
                avg_rating REAL DEFAULT 0,
                rating_count INTEGER DEFAULT 0)`,
            columns: ['id', 'name', 'bio', 'description', 'classes', 'tags', 'room_number', 'schedule', 'image_link', 'avg_rating', 'rating_count'],
        },
        {
            name: 'votes',
            sql: `CREATE TABLE IF NOT EXISTS votes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                teacher_id TEXT NOT NULL,
                user_id INTEGER,
                anon_vote_id TEXT,
                rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
                comment TEXT,
                is_explicit INTEGER DEFAULT 0,
                FOREIGN KEY (teacher_id) REFERENCES teachers(id),
                FOREIGN KEY (user_id) REFERENCES users(id))`,
            columns: ['id', 'teacher_id', 'user_id', 'anon_vote_id', 'rating', 'comment', 'is_explicit'],
        },
        {
            name: 'teacher_proposals',
            sql: `CREATE TABLE IF NOT EXISTS teacher_proposals (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                bio TEXT NOT NULL,
                description TEXT NOT NULL,
                classes TEXT NOT NULL,
                tags TEXT NOT NULL,
                room_number TEXT NOT NULL,
                email TEXT NOT NULL,
                user_id INTEGER,
                schedule TEXT NOT NULL,
                image_link TEXT,
                FOREIGN KEY (user_id) REFERENCES users(id))`,
            columns: ['id', 'name', 'bio', 'description', 'classes', 'tags', 'room_number', 'email', 'user_id', 'schedule', 'image_link'],
        },
        {
            name: 'corrections',
            sql: `CREATE TABLE IF NOT EXISTS corrections (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                teacher_id TEXT NOT NULL,
                suggestion TEXT NOT NULL,
                file_path TEXT,
                submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (teacher_id) REFERENCES teachers(id))`,
            columns: ['id', 'teacher_id', 'suggestion', 'file_path', 'submitted_at'],
        },
        {
            name: 'admin_requests',
            sql: `CREATE TABLE IF NOT EXISTS admin_requests (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                email TEXT NOT NULL,
                reason TEXT NOT NULL,
                visitor_id TEXT NOT NULL,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`,
            columns: ['id', 'name', 'email', 'reason', 'visitor_id', 'timestamp'],
        },
        {
            name: 'notifications',
            sql: `CREATE TABLE IF NOT EXISTS notifications (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                visitor_id TEXT NOT NULL,
                message TEXT NOT NULL,
                type TEXT NOT NULL DEFAULT 'info',
                read INTEGER DEFAULT 0,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`,
            columns: ['id', 'visitor_id', 'message', 'type', 'read', 'timestamp'],
        },
        {
            name: 'settings',
            sql: `CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL)`,
            columns: ['key', 'value'],
        },
        {
            name: 'stats',
            sql: `CREATE TABLE IF NOT EXISTS stats (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                visitor_id TEXT NOT NULL,
                timestamp TEXT NOT NULL)`,
            columns: ['id', 'visitor_id', 'timestamp'],
        },
        {
            name: 'admins',
            sql: `CREATE TABLE IF NOT EXISTS admins (
                username TEXT PRIMARY KEY,
                password_hash TEXT NOT NULL)`,
            columns: ['username', 'password_hash'],
        },
        {
            name: 'suggestions',
            sql: `CREATE TABLE IF NOT EXISTS suggestions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT NOT NULL,
                suggestion TEXT NOT NULL,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`,
            columns: ['id', 'email', 'suggestion', 'timestamp'],
        },
        {
            name: 'users',
            sql: `CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL UNIQUE,
                email TEXT NOT NULL,
                password_hash TEXT NOT NULL,
                points INTEGER DEFAULT 0,
                last_login DATE,
                is_locked INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`,
            columns: ['id', 'username', 'email', 'password_hash', 'points', 'last_login', 'is_locked', 'created_at'],
        },
        {
            name: 'point_transactions',
            sql: `CREATE TABLE IF NOT EXISTS point_transactions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                points INTEGER NOT NULL,
                reason TEXT,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id))`,
            columns: ['id', 'user_id', 'points', 'reason', 'timestamp'],
        },
    ];

    const indexes = [
        `CREATE INDEX IF NOT EXISTS idx_votes_teacher_id ON votes (teacher_id)`,
        `CREATE INDEX IF NOT EXISTS idx_votes_user_id ON votes (user_id)`,
        `CREATE INDEX IF NOT EXISTS idx_teacher_proposals_user_id ON teacher_proposals (user_id)`,
        `CREATE INDEX IF NOT EXISTS idx_stats_timestamp ON stats (timestamp)`,
        `CREATE INDEX IF NOT EXISTS idx_admin_requests_timestamp ON admin_requests (timestamp)`,
        `CREATE INDEX IF NOT EXISTS idx_notifications_visitor_id ON notifications (visitor_id)`,
        `CREATE INDEX IF NOT EXISTS idx_suggestions_timestamp ON suggestions (timestamp)`,
        `CREATE INDEX IF NOT EXISTS idx_users_username ON users (username)`,
        `CREATE INDEX IF NOT EXISTS idx_point_transactions_user_id ON point_transactions (user_id)`,
    ];

    let tableIndex = 0;
    function createNextTable() {
        if (tableIndex >= tables.length) {
            createIndexes();
            insertInitialData();
            return;
        }
        const table = tables[tableIndex];
        checkTable(table.name, table.columns, table.sql, (isValid) => {
            if (!isValid) {
                console.log(`Server - Dropping and recreating table ${table.name}`);
                db.run(`DROP TABLE IF EXISTS ${table.name}`, (dropErr) => {
                    if (dropErr) {
                        console.error(`Server - Error dropping table ${table.name}:`, dropErr.message);
                    }
                    db.run(table.sql, (createErr) => {
                        if (createErr) {
                            console.error(`Server - Error creating table ${table.name}:`, createErr.message);
                        } else {
                            console.log(`Server - Table ${table.name} created successfully`);
                        }
                        tableIndex++;
                        createNextTable();
                    });
                });
            } else {
                tableIndex++;
                createNextTable();
            }
        });
    }

    function createIndexes() {
        indexes.forEach(query => {
            db.run(query, err => {
                if (err) {
                    console.error('Server - Error creating index:', err.message);
                } else {
                    console.log('Server - Index created successfully:', query.split(' ')[5]);
                }
            });
        });
    }

    function insertInitialData() {
        const initialSettings = [
            ['footer', JSON.stringify({ email: 'admin@example.com', message: 'Welcome to Teacher Tally!', showMessage: true })],
            ['message', JSON.stringify({ message: 'Welcome!', showMessage: false })],
            ['sectionExpansion', JSON.stringify({
                'Add New Teacher': true,
                'Manage Teachers': false,
                'Manage Votes': false,
                'Teacher Proposals': true,
                'Admin Access Requests': false,
                'Statistics': false,
                'Corrections': true,
                'Suggestions': true,
                'Main Message Settings': true,
                'Footer Settings': true,
                'Section Expansion Settings': true,
            })],
        ];
        initialSettings.forEach(([key, value]) =>
            db.run('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)', [key, value],
                err => err && console.error('Server - Error initializing setting:', err.message)));

        const adminUsername = process.env.ADMIN_USERNAME || 'admin';
        const adminPassword = process.env.ADMIN_PASSWORD || 'password123';
        bcrypt.hash(adminPassword, 10, (err, hash) => {
            if (err) return console.error('Server - Error hashing admin password:', err.message);
            db.run('INSERT OR IGNORE INTO admins (username, password_hash) VALUES (?, ?)', [adminUsername, hash],
                err => err ? console.error('Server - Error inserting admin:', err.message) : console.log('Server - Default admin initialized:', adminUsername));
        });

        db.get('SELECT id FROM teachers WHERE id = "T001"', (err, row) => {
            if (err) return console.error('Server - Error checking teacher T001:', err.message);
            if (!row) {
                db.run(`INSERT INTO teachers (id, name, bio, description, classes, tags, room_number, schedule, image_link) 
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
                    'T001', 'Mr. Kalder', 'Experienced educator', 'Math Teacher',
                    JSON.stringify(['Algebra', 'Calculus']), JSON.stringify(['math', 'stem']),
                    'Room 101', JSON.stringify([{ block: 'A', subject: 'Algebra', grade: '9' }, { block: 'B', subject: 'Calculus', grade: '11' }]),
                    '/public/images/default-teacher.jpg',
                ], err => err ? console.error('Server - Error inserting teacher:', err.message) : console.log('Server - Inserted default teacher T001'));
            }
        });
    }

    console.log('Server - Starting table creation process');
    createNextTable();
});

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

function validateFields(fields, required) {
    return required.every(field => fields[field] && typeof fields[field] === 'string' && fields[field].trim().length > 0);
}

function authenticateAdmin(req, res, next) {
    const token = req.cookies.adminToken || req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Unauthorized: No token' });
    try {
        req.admin = jwt.verify(token, JWT_SECRET);
        next();
    } catch (err) {
        console.log('Server - Invalid admin JWT:', req.path);
        res.status(401).json({ error: 'Unauthorized: Invalid token' });
    }
}

function authenticateUser(req, res, next) {
    const token = req.cookies.userToken || req.headers.authorization?.split(' ')[1];
    console.log('Server - Authenticating user with token:', token);
    if (!token) {
        console.log('Server - No user token provided');
        return res.status(401).json({ error: 'Not authenticated. Please login.' });
    }
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        console.log('Server - Token decoded:', decoded);
        db.get('SELECT id, username, is_locked FROM users WHERE id = ?', [decoded.id], (err, row) => {
            if (err) {
                console.error('Server - Database error in authenticateUser:', err.message);
                return res.status(500).json({ error: 'Database error' });
            }
            if (!row) {
                console.log('Server - User not found for ID:', decoded.id);
                return res.status(401).json({ error: 'Unauthorized: User not found' });
            }
            if (row.is_locked) {
                console.log('Server - User account locked:', row.username);
                return res.status(403).json({ error: 'Account is locked. Please contact accounts@teachertally.com.' });
            }
            req.user = { id: row.id, username: row.username };
            next();
        });
    } catch (err) {
        console.error('Server - Invalid user JWT:', err.message);
        res.status(401).json({ error: 'Unauthorized: Invalid token' });
    }
}

// Points Helper Function
function updateUserPoints(userId, pointsToAdd, reason, callback) {
    db.serialize(() => {
        db.run('UPDATE users SET points = points + ? WHERE id = ?', [pointsToAdd, userId], (err) => {
            if (err) {
                console.error('Server - Error updating points:', err.message);
                return callback(err);
            }
            db.run('INSERT INTO point_transactions (user_id, points, reason) VALUES (?, ?, ?)',
                [userId, pointsToAdd, reason], (err) => {
                    if (err) {
                        console.error('Server - Error logging point transaction:', err.message);
                        return callback(err);
                    }
                    console.log('Server - Points updated and transaction logged:', { userId, pointsToAdd, reason });
                    callback(null);
                });
        });
    });
}

// Login Streak Handler
function handleLoginStreak(userId, res) {
    const today = new Date().toISOString().split('T')[0];
    db.get('SELECT last_login, points FROM users WHERE id = ?', [userId], (err, user) => {
        if (err) {
            console.error('Server - Error fetching user for streak:', err.message);
            return res.status(500).json({ error: 'Database error' });
        }
        const lastLogin = user.last_login ? new Date(user.last_login) : null;
        let streakPoints = 0;
        if (lastLogin) {
            const yesterday = new Date(today);
            yesterday.setDate(yesterday.getDate() - 1);
            if (lastLogin.toISOString().split('T')[0] === yesterday.toISOString().split('T')[0]) {
                streakPoints = 5;
            }
        }
        db.serialize(() => {
            db.run('UPDATE users SET last_login = ?, points = points + ? WHERE id = ?', 
                [today, streakPoints, userId], (err) => {
                    if (err) {
                        console.error('Server - Error updating login streak:', err.message);
                        return res.status(500).json({ error: 'Database error' });
                    }
                    if (streakPoints > 0) {
                        db.run('INSERT INTO point_transactions (user_id, points, reason) VALUES (?, ?, ?)',
                            [userId, streakPoints, 'Login streak bonus'], (err) => {
                                if (err) {
                                    console.error('Server - Error logging streak points:', err.message);
                                    return res.status(500).json({ error: 'Database error' });
                                }
                                console.log('Server - Login streak points logged:', { userId, streakPoints });
                            });
                    }
                    db.get('SELECT id, username, email, points FROM users WHERE id = ?', [userId], (err, updatedUser) => {
                        if (err) return res.status(500).json({ error: 'Database error' });
                        res.json(updatedUser);
                    });
                });
        });
    });
}

app.get('/api/user/points/history', authenticateUser, (req, res) => {
    const userId = req.user.id;
    const { page = 1, perPage = 10, sort = 'timestamp', direction = 'desc' } = req.query;
    const limit = parseInt(perPage);
    const offset = (parseInt(page) - 1) * limit;
    const orderBy = ['points', 'timestamp'].includes(sort) ? sort : 'timestamp';
    const sortOrder = direction.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

    db.serialize(() => {
        db.all(`SELECT id, points, reason, timestamp FROM point_transactions WHERE user_id = ? ORDER BY ${orderBy} ${sortOrder} LIMIT ? OFFSET ?`,
            [userId, limit, offset], (err, transactions) => {
                if (err) {
                    console.error('Server - Error fetching point history:', err.message);
                    return res.status(500).json({ error: 'Database error' });
                }
                db.get('SELECT COUNT(*) as total FROM point_transactions WHERE user_id = ?', [userId], (err, countRow) => {
                    if (err) {
                        console.error('Server - Error counting point transactions:', err.message);
                        return res.status(500).json({ error: 'Database error' });
                    }
                    console.log('Server - Point history fetched for user:', userId);
                    res.json({
                        transactions,
                        total: countRow.total,
                        page: parseInt(page),
                        perPage: limit
                    });
                });
            });
    });
});

app.get('/api/csrf-token', (req, res) => {
    try {
        const token = req.csrfToken();
        console.log('Server - Generating CSRF token:', token, 'Session ID:', req.sessionID);
        res.json({ csrfToken: token });
    } catch (error) {
        console.error('Server - Error generating CSRF token:', error.message);
        res.status(500).json({ error: 'Failed to generate CSRF token' });
    }
});

app.post('/api/check-username', publicLimiter, (req, res) => {
    const { username } = req.body;
    if (!username || typeof username !== 'string') return res.status(400).json({ error: 'Username required' });
    db.get('SELECT id FROM users WHERE username = ?', [username], (err, row) => {
        if (err) {
            console.error('Server - Error checking username:', err.message);
            return res.status(500).json({ error: 'Database error' });
        }
        res.json({ available: !row });
    });
});

app.post('/api/users/login', publicLimiter, csrfProtection, async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        console.log('Server - Login failed: Missing username or password');
        return res.status(400).json({ error: 'Username and password required' });
    }
    db.get('SELECT * FROM users WHERE username = ?', [username], async (err, user) => {
        if (err) {
            console.error('Server - Database error during login:', err.message);
            return res.status(500).json({ error: 'Database error' });
        }
        if (!user || !(await bcrypt.compare(password, user.password_hash))) {
            console.log('Server - Login failed: Invalid credentials for:', username);
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        if (user.is_locked) {
            console.log('Server - Login failed: Account locked:', username);
            return res.status(403).json({ error: 'Account is locked. Please contact accounts@teachertally.com.' });
        }
        const token = jwt.sign({ id: user.id, role: 'user' }, JWT_SECRET, { expiresIn: '1d' });
        req.session.user = { id: user.id, username: user.username, isAdmin: false };
        res.cookie('userToken', token, {
            httpOnly: true,
            sameSite: 'Strict',
            secure: process.env.NODE_ENV === 'production',
            maxAge: 24 * 60 * 60 * 1000,
        });
        console.log('Server - User login successful:', username, 'Token:', token);
        res.json({ message: 'Login successful', isAdmin: false });
    });
});

app.get('/api/leaderboard', (req, res) => {
    const { page = 1, perPage = 10 } = req.query;
    const limit = parseInt(perPage);
    const offset = (parseInt(page) - 1) * limit;

    db.serialize(() => {
        // Fetch users with summed points from transactions
        const query = `
            SELECT u.id, u.username, COALESCE(SUM(pt.points), 0) as total_points
            FROM users u
            LEFT JOIN point_transactions pt ON u.id = pt.user_id
            GROUP BY u.id, u.username
            ORDER BY total_points DESC
            LIMIT ? OFFSET ?;
        `;
        db.all(query, [limit, offset], (err, users) => {
            if (err) {
                console.error('Server - Error fetching leaderboard:', err.message);
                return res.status(500).json({ error: 'Database error' });
            }
            db.get('SELECT COUNT(*) as total FROM users', (err, countRow) => {
                if (err) {
                    console.error('Server - Error counting users:', err.message);
                    return res.status(500).json({ error: 'Database error' });
                }
                console.log('Server - Leaderboard fetched:', { page, perPage });
                res.json({
                    users: users.map(user => ({
                        id: user.id,
                        username: user.username,
                        points: user.total_points
                    })),
                    total: countRow.total,
                    page: parseInt(page),
                    perPage: limit
                });
            });
        });
    });
});



app.post('/api/logout', (req, res) => {
    console.log('Server - Logout request received');
    res.clearCookie('userToken', {
        httpOnly: true,
        sameSite: 'Strict',
        secure: process.env.NODE_ENV === 'production',
    });
    res.clearCookie('adminToken', {
        httpOnly: true,
        sameSite: 'Strict',
        secure: process.env.NODE_ENV === 'production',
    });

    if (req.session) {
        req.session.destroy((err) => {
            if (err) {
                console.error('Server - Error destroying session:', err.message);
                return res.status(500).json({ error: 'Logout failed' });
            }
            console.log('Server - Session destroyed');
            res.json({ message: 'Logout successful' });
        });
    } else {
        console.log('Server - No session to destroy');
        res.json({ message: 'Logout successful' });
    }
});

// Updated /api/users route (replacing the original)
app.get('/api/users', authenticateAdmin, (req, res) => {
    const perPage = parseInt(req.query.perPage) || 10;
    const page = parseInt(req.query.page) || 1;
    const offset = (page - 1) * perPage;

    db.all('SELECT id, username, email, is_locked FROM users LIMIT ? OFFSET ?', [perPage, offset], (err, users) => {
        if (err) {
            console.error('Server - Error fetching users:', err.message);
            return res.status(500).json({ error: 'Database error' });
        }
        db.get('SELECT COUNT(*) as total FROM users', (err, row) => {
            if (err) {
                console.error('Server - Error counting users:', err.message);
                return res.status(500).json({ error: 'Database error' });
            }
            res.json({
                users: users.map(user => ({
                    id: user.id,
                    username: user.username,
                    role: 'user', // Hardcoded as 'user' since table doesn't store role
                    locked: !!user.is_locked // Convert integer to boolean
                })),
                total: row.total,
                page,
                perPage
            });
        });
    });
});

// Updated /api/admins route (replacing the original)
app.get('/api/admins', authenticateAdmin, (req, res) => {
    const perPage = parseInt(req.query.perPage) || 10;
    const page = parseInt(req.query.page) || 1;
    const offset = (page - 1) * perPage;

    db.all('SELECT username FROM admins LIMIT ? OFFSET ?', [perPage, offset], (err, admins) => {
        if (err) {
            console.error('Server - Error fetching admins:', err.message);
            return res.status(500).json({ error: 'Database error' });
        }
        db.get('SELECT COUNT(*) as total FROM admins', (err, row) => {
            if (err) {
                console.error('Server - Error counting admins:', err.message);
                return res.status(500).json({ error: 'Database error' });
            }
            res.json({
                admins: admins.map(admin => ({
                    id: admin.username, // Using username as ID since no numeric ID exists
                    username: admin.username,
                    role: 'admin',
                    locked: false // Admins table doesn’t have a locked field; assume false
                })),
                total: row.total,
                page,
                perPage
            });
        });
    });
});

app.post('/api/signup', publicLimiter, csrfProtection, async (req, res) => {
    const { username, email, password, confirmPassword } = req.body;
    if (!validateFields(req.body, ['username', 'email', 'password', 'confirmPassword'])) return res.status(400).json({ error: 'All fields required' });
    if (password !== confirmPassword) return res.status(400).json({ error: 'Passwords do not match' });
    try {
        const passwordHash = await bcrypt.hash(password, 10);
        console.log('Server - Attempting to insert user:', { username, email });
        db.run('INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)', [username, email, passwordHash], function(err) {
            if (err) {
                console.error('Server - Database error on signup:', err.message);
                if (err.message.includes('UNIQUE')) return res.status(409).json({ error: 'Username already exists' });
                return res.status(500).json({ error: 'Database error', details: err.message });
            }
            const token = jwt.sign({ id: this.lastID, role: 'user' }, JWT_SECRET, { expiresIn: '1d' });
            req.session.user = { id: this.lastID, username, isAdmin: false };
            res.cookie('userToken', token, {
                httpOnly: true,
                sameSite: 'Strict',
                secure: process.env.NODE_ENV === 'production',
                maxAge: 24 * 60 * 60 * 1000,
            });
            console.log('Server - Signup successful for user:', username, 'Session set:', req.session.user);
            res.json({ message: 'Signup successful' });
        });
    } catch (err) {
        console.error('Server - Error during signup:', err.message);
        res.status(500).json({ error: 'Server error', details: err.message });
    }
});

app.post('/api/users/register', publicLimiter, csrfProtection, async (req, res) => {
    const { username, password } = req.body;
    if (!validateFields(req.body, ['username', 'password'])) {
        return res.status(400).json({ error: 'Username and password required' });
    }
    try {
        const passwordHash = await bcrypt.hash(password, 10);
        db.run('INSERT INTO users (username, password_hash) VALUES (?, ?)', [username, passwordHash], function(err) {
            if (err) {
                if (err.message.includes('UNIQUE')) return res.status(409).json({ error: 'Username already exists' });
                return res.status(500).json({ error: 'Database error' });
            }
            const token = jwt.sign({ id: this.lastID, role: 'user' }, JWT_SECRET, { expiresIn: '1d' });
            req.session.user = { id: this.lastID, username, isAdmin: false };
            res.cookie('userToken', token, {
                httpOnly: true,
                sameSite: 'Strict',
                secure: process.env.NODE_ENV === 'production',
                maxAge: 24 * 60 * 60 * 1000,
            });
            console.log('Server - Register successful for user:', username, 'Session set:', req.session.user);
            res.json({ message: 'Sign up successful' });
        });
    } catch (err) {
        console.error('Server - Error during signup:', err.message);
        res.status(500).json({ error: 'Server error' });
    }
});

app.get('/api/user', authenticateUser, (req, res) => {
    console.log('Server - Request: GET /api/user');
    const userId = req.user.id;
    handleLoginStreak(userId, res);
});

app.post('/api/users/login', publicLimiter, csrfProtection, async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        console.log('Server - Login failed: Missing username or password');
        return res.status(400).json({ error: 'Username and password required' });
    }
    db.get('SELECT * FROM users WHERE username = ?', [username], async (err, user) => {
        if (err) {
            console.error('Server - Database error during login:', err.message);
            return res.status(500).json({ error: 'Database error' });
        }
        if (!user || !(await bcrypt.compare(password, user.password_hash))) {
            console.log('Server - Login failed: Invalid credentials for:', username);
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        if (user.is_locked) {
            console.log('Server - Login failed: Account locked:', username);
            return res.status(403).json({ error: 'Account is locked. Please contact accounts@teachertally.com.' });
        }
        const token = jwt.sign({ id: user.id, role: 'user' }, JWT_SECRET, { expiresIn: '1d' });
        req.session.user = { id: user.id, username: user.username, isAdmin: false };
        res.cookie('userToken', token, {
            httpOnly: true,
            sameSite: 'Strict',
            secure: process.env.NODE_ENV === 'production',
            maxAge: 24 * 60 * 60 * 1000,
        });
        console.log('Server - User login successful:', username, 'Token:', token);
        res.json({ message: 'Login successful', isAdmin: false }); // Include isAdmin in response
    });
});

app.post('/api/users/logout', csrfProtection, (req, res) => {
    req.session.destroy((err) => {
        if (err) console.error('Server - Error destroying session:', err.message);
    });
    res.clearCookie('userToken', { httpOnly: true, sameSite: 'Strict', secure: process.env.NODE_ENV === 'production' });
    res.json({ message: 'Logged out successfully' });
});

app.get('/api/user/votes', authenticateUser, (req, res) => {
    const userId = req.user.id;
    db.all(`
        SELECT v.id, v.teacher_id, v.rating, v.comment, t.name AS teacher_name
        FROM votes v
        JOIN teachers t ON v.teacher_id = t.id
        WHERE v.user_id = ?
    `, [userId], (err, rows) => {
        if (err) {
            console.error('Server - Error fetching user votes:', err.message);
            return res.status(500).json({ error: 'Database error' });
        }
        console.log('Server - User votes fetched for:', req.user.username);
        res.json(rows);
    });
});
app.put('/api/vote/:id', authenticateUser, csrfProtection, (req, res) => {
    const voteId = req.params.id;
    const { rating, comment } = req.body;
    const userId = req.user.id;

    if (!rating || rating < 1 || rating > 5) {
        return res.status(400).json({ error: 'Rating must be between 1 and 5' });
    }

    db.get('SELECT * FROM votes WHERE id = ? AND user_id = ?', [voteId, userId], (err, vote) => {
        if (err) {
            console.error('Server - Error checking vote:', err.message);
            return res.status(500).json({ error: 'Database error' });
        }
        if (!vote) {
            console.log('Server - Vote not found or not owned by user:', voteId, userId);
            return res.status(404).json({ error: 'Vote not found or not authorized' });
        }

        db.run('UPDATE votes SET rating = ?, comment = ? WHERE id = ?', [rating, comment || null, voteId], (err) => {
            if (err) {
                console.error('Server - Error updating vote:', err.message);
                return res.status(500).json({ error: 'Database error' });
            }
            console.log('Server - Vote updated:', { voteId, rating, user: userId });
            updateTeacherStats(vote.teacher_id, res);
        });
    });
});
function updateTeacherStats(teacherId, res) {
    db.all('SELECT rating FROM votes WHERE teacher_id = ?', [teacherId], (err, rows) => {
        if (err) {
            console.error('Server - Error fetching ratings:', err.message);
            return res.status(500).json({ error: 'Database error fetching ratings' });
        }
        const avgRating = rows.length ? rows.reduce((sum, r) => sum + r.rating, 0) / rows.length : 0;
        const ratingCount = rows.length;

        db.run('UPDATE teachers SET avg_rating = ?, rating_count = ? WHERE id = ?', [avgRating, ratingCount, teacherId], (err) => {
            if (err) {
                console.error('Server - Error updating teacher stats:', err.message);
                return res.status(500).json({ error: 'Database error updating teacher stats' });
            }
            console.log('Server - Teacher stats updated:', { teacherId, avgRating, ratingCount });
            res.json({ avg_rating: avgRating, rating_count: ratingCount });
        });
    });
}

app.get('/api/users/me', authenticateUser, (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated. Please login' });
    db.get('SELECT id, username, points FROM users WHERE id = ?', [req.user.id], (err, user) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        db.all('SELECT * FROM votes WHERE user_id = ?', [req.user.id], (err, votes) => {
            if (err) return res.status(500).json({ error: 'Database error' });
            db.all('SELECT * FROM teacher_proposals WHERE user_id = ?', [req.user.id], (err, proposals) => {
                if (err) return res.status(500).json({ error: 'Database error' });
                db.get('SELECT SUM(points) as totalPointsEarned FROM point_transactions WHERE user_id = ?', [req.user.id], (err, pointsRow) => {
                    if (err) return res.status(500).json({ error: 'Database error' });
                    res.json({
                        user: { 
                            id: user.id, 
                            username: user.username, 
                            points: user.points, 
                            totalPointsEarned: pointsRow.totalPointsEarned || 0 
                        },
                        votes,
                        proposals: proposals.map(p => ({
                            ...p,
                            classes: JSON.parse(p.classes || '[]'),
                            tags: JSON.parse(p.tags || '[]'),
                            schedule: JSON.parse(p.schedule || '[]'),
                        })),
                    });
                });
            });
        });
    });
});

app.get('/api/check-auth', (req, res) => {
    const adminToken = req.cookies.adminToken;
    const userToken = req.cookies.userToken;
    if (adminToken) {
        try {
            jwt.verify(adminToken, JWT_SECRET);
            return res.json({ isAuthenticated: true, role: 'admin' });
        } catch {
            res.clearCookie('adminToken');
        }
    } else if (userToken) {
        try {
            const decoded = jwt.verify(userToken, JWT_SECRET);
            db.get('SELECT is_locked FROM users WHERE id = ?', [decoded.id], (err, row) => {
                if (err || !row || row.is_locked) return res.json({ isAuthenticated: false });
                res.json({ isAuthenticated: true, role: 'user' });
            });
            return;
        } catch {
            res.clearCookie('userToken');
        }
    }
    res.json({ isAuthenticated: false });
});

app.get('/api/admin/verify', authenticateAdmin, (req, res) => {
    res.json({ message: 'Admin session active', username: req.admin.username });
});

app.post('/api/users/login', publicLimiter, csrfProtection, async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password required' });
    }
    db.get('SELECT * FROM users WHERE username = ?', [username], async (err, user) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        if (!user || !(await bcrypt.compare(password, user.password_hash))) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        if (user.is_locked) {
            return res.status(403).json({ error: 'Account is locked. Please contact accounts@teachertally.com.' });
        }
        const token = jwt.sign({ id: user.id, role: 'user' }, JWT_SECRET, { expiresIn: '1d' });
        req.session.user = { id: user.id, username: user.username, isAdmin: false };
        res.cookie('userToken', token, {
            httpOnly: true,
            sameSite: 'Strict',
            secure: process.env.NODE_ENV === 'production',
            maxAge: 24 * 60 * 60 * 1000,
        });
        console.log('Server - User login successful:', username, 'Token:', token);
        res.json({ message: 'Login successful' });
    });
});

app.get('/api/admin/accounts', authenticateAdmin, (req, res) => {
    const { page = 1, perPage = 10, search = '', sort = 'id', direction = 'asc' } = req.query;
    const limit = parseInt(perPage);
    const offset = (parseInt(page) - 1) * limit;
    const searchQuery = `%${search.toLowerCase()}%`;
    const orderBy = ['id', 'username', 'points'].includes(sort) ? sort : 'id';
    const sortOrder = direction.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

    db.serialize(() => {
        db.all(`SELECT id, username, email, points, is_locked FROM users WHERE username LIKE ? ORDER BY ${orderBy} ${sortOrder} LIMIT ? OFFSET ?`,
            [searchQuery, limit, offset], (err, rows) => {
                if (err) {
                    console.error('Server - Error fetching user accounts:', err.message);
                    return res.status(500).json({ error: 'Database error' });
                }
                db.get(`SELECT COUNT(*) as total FROM users WHERE username LIKE ?`,
                    [searchQuery], (err, countRow) => {
                        if (err) {
                            console.error('Server - Error counting users:', err.message);
                            return res.status(500).json({ error: 'Database error' });
                        }
                        res.json({
                            accounts: rows.map(row => ({
                                id: row.id,
                                username: row.username,
                                email: row.email,
                                points: row.points,
                                is_locked: !!row.is_locked
                            })),
                            total: countRow.total
                        });
                    });
            });
    });
});

app.get('/api/admin/accounts/:id/points', authenticateAdmin, (req, res) => {
    const userId = req.params.id;
    const { page = 1, perPage = 10, sort = 'timestamp', direction = 'desc' } = req.query;
    const limit = parseInt(perPage);
    const offset = (parseInt(page) - 1) * limit;
    const orderBy = ['points', 'timestamp'].includes(sort) ? sort : 'timestamp';
    const sortOrder = direction.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

    db.serialize(() => {
        db.get('SELECT id, username, points FROM users WHERE id = ?', [userId], (err, user) => {
            if (err) {
                console.error('Server - Error fetching user:', err.message);
                return res.status(500).json({ error: 'Database error' });
            }
            if (!user) {
                console.log('Server - User not found:', userId);
                return res.status(404).json({ error: 'User not found' });
            }
            db.all(`SELECT id, points, reason, timestamp FROM point_transactions WHERE user_id = ? ORDER BY ${orderBy} ${sortOrder} LIMIT ? OFFSET ?`,
                [userId, limit, offset], (err, transactions) => {
                    if (err) {
                        console.error('Server - Error fetching point transactions:', err.message);
                        return res.status(500).json({ error: 'Database error' });
                    }
                    db.get('SELECT COUNT(*) as total FROM point_transactions WHERE user_id = ?', [userId], (err, countRow) => {
                        if (err) {
                            console.error('Server - Error counting point transactions:', err.message);
                            return res.status(500).json({ error: 'Database error' });
                        }
                        console.log('Server - Point details fetched for user:', userId);
                        res.json({
                            user: {
                                id: user.id,
                                username: user.username,
                                totalPoints: user.points
                            },
                            transactions: transactions.map(t => ({
                                id: t.id,
                                points: t.points,
                                reason: t.reason,
                                timestamp: t.timestamp
                            })),
                            totalTransactions: countRow.total,
                            page: parseInt(page),
                            perPage: limit
                        });
                    });
                });
        });
    });
});

app.get('/api/admin/accounts/:id/votes', authenticateAdmin, (req, res) => {
    db.all('SELECT * FROM votes WHERE user_id = ?', [req.params.id], (err, votes) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        res.json(votes);
    });
});

app.get('/api/admin/accounts/:id/proposals', authenticateAdmin, (req, res) => {
    db.all('SELECT * FROM teacher_proposals WHERE user_id = ?', [req.params.id], (err, proposals) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        res.json(proposals.map(p => ({
            ...p,
            classes: JSON.parse(p.classes || '[]'),
            tags: JSON.parse(p.tags || '[]'),
            schedule: JSON.parse(p.schedule || '[]'),
        })));
    });
});

app.post('/api/admin/accounts/:id/points', authenticateAdmin, csrfProtection, (req, res) => {
    const { points } = req.body;
    if (typeof points !== 'number' || points < 0) return res.status(400).json({ error: 'Points must be a non-negative number' });
    const userId = req.params.id;

    db.serialize(() => {
        db.get('SELECT points FROM users WHERE id = ?', [userId], (err, user) => {
            if (err) {
                console.error('Server - Error fetching user points:', err.message);
                return res.status(500).json({ error: 'Database error' });
            }
            if (!user) {
                console.log('Server - User not found:', userId);
                return res.status(404).json({ error: 'Account not found' });
            }

            const oldPoints = user.points;
            const pointChange = points - oldPoints;

            db.run('UPDATE users SET points = ? WHERE id = ?', [points, userId], (err) => {
                if (err) {
                    console.error('Server - Error updating points:', err.message);
                    return res.status(500).json({ error: 'Database error' });
                }

                if (pointChange !== 0) {
                    const reason = `Admin adjustment (${pointChange > 0 ? '+' : ''}${pointChange} points)`;
                    db.run('INSERT INTO point_transactions (user_id, points, reason) VALUES (?, ?, ?)',
                        [userId, pointChange, reason], (err) => {
                            if (err) {
                                console.error('Server - Error logging point transaction:', err.message);
                                return res.status(500).json({ error: 'Database error logging transaction' });
                            }
                            console.log('Server - Points adjusted and logged:', { userId, oldPoints, newPoints: points, pointChange });
                        });
                    // Optional notification
                    db.run('INSERT INTO notifications (visitor_id, message, type) VALUES (?, ?, ?)',
                        [userId, `Your point balance was adjusted by an admin: ${pointChange > 0 ? '+' : ''}${pointChange} points. New total: ${points}`, 'info'],
                        (err) => {
                            if (err) console.error('Server - Error adding notification:', err.message);
                        });
                } else {
                    console.log('Server - No point change to log:', { userId, points });
                }

                res.json({ message: 'Points updated', oldPoints, newPoints: points, pointChange });
            });
        });
    });
});

app.delete('/api/admin/accounts/:id', authenticateAdmin, csrfProtection, (req, res) => {
    db.run('DELETE FROM users WHERE id = ?', [req.params.id], function(err) {
        if (err) return res.status(500).json({ error: 'Database error' });
        if (this.changes === 0) return res.status(404).json({ error: 'Account not found' });
        res.json({ message: 'Account deleted' });
    });
});

app.post('/api/admin/accounts/:id/lock', authenticateAdmin, csrfProtection, (req, res) => {
    const { lock } = req.body;
    if (typeof lock !== 'boolean') return res.status(400).json({ error: 'Lock must be a boolean' });
    db.run('UPDATE users SET is_locked = ? WHERE id = ?', [lock ? 1 : 0, req.params.id], function(err) {
        if (err) return res.status(500).json({ error: 'Database error' });
        if (this.changes === 0) return res.status(404).json({ error: 'Account not found' });
        res.json({ message: `Account ${lock ? 'locked' : 'unlocked'}` });
    });
});

app.put('/api/users/:id/lock', authenticateAdmin, (req, res) => {
    const { id } = req.params;
    const { lock } = req.body;
    db.run('UPDATE users SET is_locked = ? WHERE id = ?', [lock ? 1 : 0, id], function(err) {
        if (err) {
            console.error('Server - Error locking/unlocking user:', err.message);
            return res.status(500).json({ error: 'Database error' });
        }
        if (this.changes === 0) {
            return res.status(404).json({ error: 'User not found' });
        }
        console.log(`Server - ${lock ? 'Locked' : 'Unlocked'} user:`, id);
        res.json({ success: true });
    });
});

app.get('/pages/auth/login.html', (req, res) => {
    if (req.cookies.userToken) {
        try {
            jwt.verify(req.cookies.userToken, JWT_SECRET);
            return res.redirect('/pages/user/dashboard.html');
        } catch {
            res.clearCookie('userToken');
        }
    }
    res.sendFile(path.join(__dirname, 'pages', 'auth', 'login.html'));
});

app.get('/pages/signup.html', (req, res) => {
    if (req.cookies.userToken) {
        try {
            jwt.verify(req.cookies.userToken, JWT_SECRET);
            return res.redirect('/pages/user/dashboard.html');
        } catch {
            res.clearCookie('userToken');
        }
    }
    res.sendFile(path.join(__dirname, 'pages', 'signup.html'));
});

app.get('/pages/user/dashboard.html', authenticateUser, (req, res) => {
    if (!req.user) return res.redirect('/pages/auth/login.html');
    res.sendFile(path.join(__dirname, 'pages', 'user', 'dashboard.html'));
});

app.post('/api/admin/login', publicLimiter, csrfProtection, async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    console.log('Server - Admin login failed: Missing username or password');
    return res.status(400).json({ error: 'Username and password required' });
  }

  db.get('SELECT * FROM admins WHERE username = ?', [username], async (err, admin) => {
    if (err) {
      console.error('Server - Database error during admin login:', err.message);
      return res.status(500).json({ error: 'Database error' });
    }
    if (!admin || !(await bcrypt.compare(password, admin.password_hash))) {
      console.log('Server - Admin login failed: Invalid credentials for:', username);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign({ id: admin.id, role: 'admin' }, JWT_SECRET, { expiresIn: '1d' });
    res.cookie('adminToken', token, {
      httpOnly: true,
      sameSite: 'Strict',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 24 * 60 * 60 * 1000,
    });
    console.log('Server - Admin login successful:', username, 'Token:', token);
    res.json({ message: 'Login successful', isAdmin: true });
  });
});

app.get('/pages/admin/dashboard.html', authenticateAdmin, (req, res) => {
    res.sendFile(path.join(__dirname, 'pages', 'admin', 'dashboard.html'));
});

app.post('/api/admin-request', publicLimiter, csrfProtection, (req, res) => {
    const { name, email, reason } = req.body;
    if (!validateFields(req.body, ['name', 'email', 'reason'])) {
        return res.status(400).json({ error: 'Name, email, and reason required' });
    }
    const id = uuidv4();
    const visitorId = req.cookies.visitorId;
    db.run('INSERT INTO admin_requests (id, name, email, reason, visitor_id) VALUES (?, ?, ?, ?, ?)',
        [id, name, email, reason, visitorId], err => {
            if (err) return res.status(500).json({ error: 'Database error' });
            db.run('INSERT INTO notifications (visitor_id, message, type) VALUES (?, ?, ?)',
                [visitorId, 'Your admin request has been submitted!', 'info'],
                err => err && console.error('Server - Error adding notification:', err.message));
            res.json({ message: 'Admin request submitted', requestId: id });
        });
});

app.delete('/api/admin-request/:id', authenticateAdmin, csrfProtection, (req, res) => {
    db.run('DELETE FROM admin_requests WHERE id = ?', [req.params.id], function(err) {
        if (err) return res.status(500).json({ error: 'Database error' });
        if (this.changes === 0) return res.status(404).json({ error: 'Request not found' });
        res.json({ message: 'Admin request deleted' });
    });
});

app.get('/api/admin-request', authenticateAdmin, (req, res) => {
    const { page = 1, perPage = 10, search = '', sort = 'timestamp', direction = 'desc' } = req.query;
    const limit = parseInt(perPage);
    const offset = (page - 1) * limit;
    const searchQuery = `%${search.toLowerCase()}%`;
    const orderBy = ['name', 'email', 'timestamp'].includes(sort) ? sort : 'timestamp';
    const sortOrder = direction.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

    db.serialize(() => {
        db.all(`SELECT * FROM admin_requests WHERE name LIKE ? OR email LIKE ? ORDER BY ${orderBy} ${sortOrder} LIMIT ? OFFSET ?`,
            [searchQuery, searchQuery, limit, offset], (err, rows) => {
                if (err) return res.status(500).json({ error: 'Database error' });
                db.get(`SELECT COUNT(*) as total FROM admin_requests WHERE name LIKE ? OR email LIKE ?`,
                    [searchQuery, searchQuery], (err, countRow) => {
                        if (err) return res.status(500).json({ error: 'Database error' });
                        res.json({ requests: rows, total: countRow.total });
                    });
            });
    });
});

app.post('/api/admin-request/approve/:id', authenticateAdmin, csrfProtection, async (req, res) => {
    db.get('SELECT * FROM admin_requests WHERE id = ?', [req.params.id], async (err, request) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        if (!request) return res.status(404).json({ error: 'Request not found' });

        const tempPassword = uuidv4().slice(0, 8);
        const hashedPassword = await bcrypt.hash(tempPassword, 10);
        db.run('INSERT OR IGNORE INTO admins (username, password_hash) VALUES (?, ?)',
            [request.email, hashedPassword], err => {
                if (err) return res.status(500).json({ error: 'Database error' });
                db.run('DELETE FROM admin_requests WHERE id = ?', [req.params.id], err => {
                    if (err) return res.status(500).json({ error: 'Database error' });
                    db.run('INSERT INTO notifications (visitor_id, message, type) VALUES (?, ?, ?)',
                        [request.visitor_id, `Admin approved! Username: ${request.email}, Password: ${tempPassword}`, 'success'],
                        err => err && console.error('Server - Error adding notification:', err.message));
                    res.json({ message: 'Admin request approved', newAdmin: { username: request.email, password: tempPassword } });
                });
            });
    });
});

app.delete('/api/admin-request/deny/:id', authenticateAdmin, csrfProtection, (req, res) => {
    db.get('SELECT visitor_id FROM admin_requests WHERE id = ?', [req.params.id], (err, request) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        if (!request) return res.status(404).json({ error: 'Request not found' });
        db.run('DELETE FROM admin_requests WHERE id = ?', [req.params.id], err => {
            if (err) return res.status(500).json({ error: 'Database error' });
            db.run('INSERT INTO notifications (visitor_id, message, type) VALUES (?, ?, ?)',
                [request.visitor_id, 'Your admin request was denied.', 'error'],
                err => err && console.error('Server - Error adding notification:', err.message));
            res.json({ message: 'Admin request denied' });
        });
    });
});

app.get('/api/notifications', (req, res) => {
    const visitorId = req.cookies.visitorId;
    if (!visitorId) return res.status(400).json({ error: 'No visitor ID' });
    db.all('SELECT * FROM notifications WHERE visitor_id = ? AND read = 0 ORDER BY timestamp DESC',
        [visitorId], (err, rows) => {
            if (err) return res.status(500).json({ error: 'Database error' });
            res.json(rows);
        });
});

app.post('/api/notifications/:id/read', publicLimiter, csrfProtection, (req, res) => {
    const visitorId = req.cookies.visitorId;
    if (!visitorId) return res.status(401).json({ error: 'Unauthorized' });
    db.run('UPDATE notifications SET read = 1 WHERE id = ? AND visitor_id = ?',
        [req.params.id, visitorId], function(err) {
            if (err) return res.status(500).json({ error: 'Database error' });
            if (this.changes === 0) return res.status(404).json({ error: 'Notification not found' });
            res.json({ message: 'Notification marked as read' });
        });
});

app.get('/api/admin/votes', authenticateAdmin, (req, res) => {
    const { page = 1, perPage = 10, search = '', sort = 'id', direction = 'asc' } = req.query;
    const limit = parseInt(perPage);
    const offset = (page - 1) * limit;
    const searchQuery = `%${search.toLowerCase()}%`;
    const orderBy = sort === 'rating' ? 'rating' : 'id';
    const sortOrder = direction.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

    db.serialize(() => {
        db.all(`SELECT * FROM votes WHERE teacher_id LIKE ? ORDER BY ${orderBy} ${sortOrder} LIMIT ? OFFSET ?`,
            [searchQuery, limit, offset], (err, rows) => {
                if (err) return res.status(500).json({ error: 'Database error' });
                db.get(`SELECT COUNT(*) as total FROM votes WHERE teacher_id LIKE ?`,
                    [searchQuery], (err, countRow) => {
                        if (err) return res.status(500).json({ error: 'Database error' });
                        res.json({ votes: rows, total: countRow.total });
                    });
            });
    });
});

app.put('/api/admin/votes/:voteId', authenticateAdmin, csrfProtection, (req, res) => {
    const { rating, comment } = req.body;
    if (!rating || rating < 1 || rating > 5) return res.status(400).json({ error: 'Rating must be 1-5' });
    const { cleanedComment, isExplicit } = filterComment(comment);
    db.run('UPDATE votes SET rating = ?, comment = ?, is_explicit = ? WHERE id = ?',
        [parseInt(rating), cleanedComment, isExplicit ? 1 : 0, req.params.voteId], function(err) {
            if (err) return res.status(500).json({ error: 'Database error' });
            if (this.changes === 0) return res.status(404).json({ error: 'Vote not found' });
            res.json({ message: 'Vote updated', is_explicit: isExplicit });
        });
});

app.delete('/api/admin/votes/:voteId', authenticateAdmin, csrfProtection, (req, res) => {
    db.run('DELETE FROM votes WHERE id = ?', [req.params.voteId], function(err) {
        if (err) return res.status(500).json({ error: 'Database error' });
        if (this.changes === 0) return res.status(404).json({ error: 'Vote not found' });
        res.json({ message: 'Vote deleted' });
    });
});

app.get('/api/teachers', (req, res) => {
    const { page = 1, perPage = 8, search = '', sort = 'default', direction = 'asc' } = req.query;
    const limit = parseInt(perPage);
    const offset = (page - 1) * limit;
    const searchQuery = `%${search.toLowerCase()}%`;
    const orderBy = {
        'alphabetical': 't.name',
        'ratings': 'avg_rating',
        'votes': 'vote_count',
        'default': 't.id',
    }[sort] || 't.id';
    const sortOrder = direction.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

    db.serialize(() => {
        db.all(`SELECT t.*, COUNT(v.id) AS vote_count, AVG(v.rating) AS avg_rating 
                FROM teachers t LEFT JOIN votes v ON t.id = v.teacher_id 
                WHERE t.name LIKE ? OR t.tags LIKE ? 
                GROUP BY t.id ORDER BY ${orderBy} ${sortOrder} NULLS LAST LIMIT ? OFFSET ?`,
            [searchQuery, searchQuery, limit, offset], (err, teachers) => {
                if (err) {
                    console.error('Server - Error fetching teachers:', err.message);
                    return res.status(500).json({ error: 'Database error' });
                }
                db.get(`SELECT COUNT(DISTINCT t.id) as total FROM teachers t WHERE t.name LIKE ? OR t.tags LIKE ?`,
                    [searchQuery, searchQuery], (err, countRow) => {
                        if (err) {
                            console.error('Server - Error counting teachers:', err.message);
                            return res.status(500).json({ error: 'Database error' });
                        }
                        try {
                            const parsedTeachers = teachers.map(t => {
                                const parseField = (field, fieldName) => {
                                    try {
                                        return field ? JSON.parse(field) : [];
                                    } catch (parseErr) {
                                        console.error(`Server - Error parsing ${fieldName} for teacher ID ${t.id}:`, parseErr.message, 'Raw value:', field);
                                        return [];
                                    }
                                };
                                return {
                                    ...t,
                                    classes: parseField(t.classes, 'classes'),
                                    tags: parseField(t.tags, 'tags'),
                                    schedule: parseField(t.schedule, 'schedule'),
                                    avg_rating: t.avg_rating ? parseFloat(t.avg_rating.toFixed(1)) : null,
                                };
                            });
                            res.json({
                                teachers: parsedTeachers,
                                total: countRow.total,
                            });
                        } catch (parseErr) {
                            console.error('Server - Unexpected error processing teachers:', parseErr.message);
                            res.status(500).json({ error: 'Error processing teacher data' });
                        }
                    });
            });
    });
});

app.get('/api/teachers/:id', (req, res) => {
    db.serialize(() => {
        db.get('SELECT * FROM teachers WHERE id = ?', [req.params.id], (err, teacher) => {
            if (err) return res.status(500).json({ error: 'Database error' });
            if (!teacher) return res.status(404).json({ error: 'Teacher not found' });
            db.all('SELECT * FROM votes WHERE teacher_id = ?', [req.params.id], (err, ratings) => {
                if (err) return res.status(500).json({ error: 'Database error' });
                const parseField = (field, fieldName) => {
                    try {
                        return field ? JSON.parse(field) : [];
                    } catch (parseErr) {
                        console.error(`Server - Error parsing ${fieldName} for teacher ID ${req.params.id}:`, parseErr.message, 'Raw value:', field);
                        return [];
                    }
                };
                const avgRating = ratings.length ? ratings.reduce((sum, r) => sum + r.rating, 0) / ratings.length : null;
                res.json({
                    ...teacher,
                    classes: parseField(teacher.classes, 'classes'),
                    tags: parseField(teacher.tags, 'tags'),
                    schedule: parseField(teacher.schedule, 'schedule'),
                    avg_rating: avgRating ? parseFloat(avgRating.toFixed(1)) : null,
                    ratings: ratings.map(r => ({ ...r, is_explicit: !!r.is_explicit })),
                    rating_count: ratings.length,
                });
            });
        });
    });
});

app.post('/api/admins/create', (req, res) => {
    const { username, password, role } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required' });
    }
    if (role !== 'admin') {
        return res.status(400).json({ error: 'Invalid role for admin creation' });
    }

    // Check if username already exists
    db.get('SELECT * FROM users WHERE username = ?', [username], (err, row) => {
        if (err) {
            console.error('Server - Error checking admin existence:', err.message);
            return res.status(500).json({ error: 'Database error' });
        }
        if (row) {
            return res.status(400).json({ error: 'Username already taken' });
        }

        // Hash password and insert admin
        bcrypt.hash(password, saltRounds, (err, hash) => {
            if (err) {
                console.error('Server - Error hashing password:', err.message);
                return res.status(500).json({ error: 'Password hashing failed' });
            }

            db.run(
                'INSERT INTO users (username, password, role) VALUES (?, ?, ?)',
                [username, hash, 'admin'],
                function (err) {
                    if (err) {
                        console.error('Server - Error creating admin:', err.message);
                        return res.status(500).json({ error: 'Database error' });
                    }
                    console.log('Server - Admin created:', { username });
                    res.status(201).json({ message: 'Admin created successfully', userId: this.lastID });
                }
            );
        });
    });
});


app.get('/api/csrf-token', csrfProtection, (req, res) => {
    const csrfToken = req.csrfToken();
    console.log('Server - Generating CSRF token:', csrfToken, 'Session ID:', req.sessionID);
    res.json({ csrfToken });
});

app.post('/api/users/create', csrfProtection, (req, res) => {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
        return res.status(400).json({ error: 'Username, email, and password are required' });
    }

    db.get('SELECT * FROM users WHERE username = ? OR email = ?', [username, email], (err, row) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        if (row) return res.status(400).json({ error: 'Username or email already taken' });

        bcrypt.hash(password, 10, (err, hash) => {
            if (err) return res.status(500).json({ error: 'Password hashing failed' });

            db.run(
                'INSERT INTO users (username, email, password, role) VALUES (?, ?, ?, ?)',
                [username, email, hash, 'user'],
                function (err) {
                    if (err) return res.status(500).json({ error: 'Database error' });
                    res.status(201).json({ message: 'User created successfully', userId: this.lastID });
                }
            );
        });
    });
});

app.post('/api/admins/create', csrfProtection, (req, res) => {
    const { username, password, role } = req.body;

    if (!username || !password || role !== 'admin') {
        return res.status(400).json({ error: 'Username, password, and admin role are required' });
    }

    db.get('SELECT * FROM users WHERE username = ?', [username], (err, row) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        if (row) return res.status(400).json({ error: 'Username already taken' });

        bcrypt.hash(password, 10, (err, hash) => {
            if (err) return res.status(500).json({ error: 'Password hashing failed' });

            db.run(
                'INSERT INTO users (username, password, role) VALUES (?, ?, ?)',
                [username, hash, 'admin'],
                function (err) {
                    if (err) return res.status(500).json({ error: 'Database error' });
                    res.status(201).json({ message: 'Admin created successfully', userId: this.lastID });
                }
            );
        });
    });
});

app.post('/api/users/create', (req, res) => {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
        return res.status(400).json({ error: 'Username, email, and password are required' });
    }

    // Check if username or email already exists
    db.get('SELECT * FROM users WHERE username = ? OR email = ?', [username, email], (err, row) => {
        if (err) {
            console.error('Server - Error checking user existence:', err.message);
            return res.status(500).json({ error: 'Database error' });
        }
        if (row) {
            return res.status(400).json({ error: 'Username or email already taken' });
        }

        // Hash password and insert user
        bcrypt.hash(password, saltRounds, (err, hash) => {
            if (err) {
                console.error('Server - Error hashing password:', err.message);
                return res.status(500).json({ error: 'Password hashing failed' });
            }

            db.run(
                'INSERT INTO users (username, email, password, role) VALUES (?, ?, ?, ?)',
                [username, email, hash, 'user'],
                function (err) {
                    if (err) {
                        console.error('Server - Error creating user:', err.message);
                        return res.status(500).json({ error: 'Database error' });
                    }
                    console.log('Server - User created:', { username, email });
                    res.status(201).json({ message: 'User created successfully', userId: this.lastID });
                }
            );
        });
    });
});

app.post('/api/vote', authenticateUser, csrfProtection, (req, res) => {
    const { teacher_id, rating, comment } = req.body;
    const userId = req.user.id;

    if (!teacher_id || !rating || rating < 1 || rating > 5) {
        return res.status(400).json({ error: 'Teacher ID and rating (1-5) are required' });
    }

    // Check if this user has already voted for this teacher
    db.get('SELECT * FROM votes WHERE teacher_id = ? AND user_id = ?', [teacher_id, userId], (err, row) => {
        if (err) {
            console.error('Server - Error checking existing vote:', err.message);
            return res.status(500).json({ error: 'Database error' });
        }
        if (row) {
            console.log('Server - User already voted:', { userId, teacher_id });
            return res.status(403).json({ error: 'Already voted' });
        }

        // Insert the new vote
        db.run(
            'INSERT INTO votes (teacher_id, rating, comment, user_id) VALUES (?, ?, ?, ?)',
            [teacher_id, rating, comment || null, userId],
            function (err) {
                if (err) {
                    console.error('Server - Error inserting vote:', err.message);
                    return res.status(500).json({ error: 'Database error' });
                }
                console.log('Server - Vote recorded:', { teacher_id, rating, userId });

                // Update user points and teacher stats
                updateUserPoints(userId, 2, 'Vote submitted', (err) => {
                    if (err) {
                        console.error('Server - Error updating points:', err.message);
                        return res.status(500).json({ error: 'Points update failed' });
                    }
                    updateTeacherStats(teacher_id, res);
                });
            }
        );
    });
});

app.post('/api/ratings', publicLimiter, (req, res) => {
    const { teacher_id, rating, comment } = req.body;

    if (!teacher_id || !rating || rating < 1 || rating > 5) {
        return res.status(400).json({ error: 'Teacher ID and rating (1-5) are required' });
    }

    const visitorId = req.cookies.visitorId;
    if (!visitorId) {
        return res.status(400).json({ error: 'Visitor ID required' });
    }

    console.log('Server - Anonymous vote attempt:', { teacher_id, rating, visitorId });

    // Check if this visitor has already voted for this teacher
    db.get('SELECT * FROM votes WHERE teacher_id = ? AND anon_vote_id = ?', [teacher_id, visitorId], (err, row) => {
        if (err) {
            console.error('Server - Error checking existing vote:', err.message);
            return res.status(500).json({ error: 'Database error' });
        }
        if (row) {
            console.log('Server - Visitor already voted:', { visitorId, teacher_id });
            return res.status(403).json({ error: 'Already voted' });
        }

        // Insert the new vote
        db.run(
            'INSERT INTO votes (teacher_id, rating, comment, anon_vote_id) VALUES (?, ?, ?, ?)',
            [teacher_id, rating, comment || null, visitorId],
            function (err) {
                if (err) {
                    console.error('Server - Error inserting vote:', err.message);
                    return res.status(500).json({ error: 'Database error' });
                }
                console.log('Server - Anonymous vote recorded:', { teacher_id, rating, visitorId });
                updateTeacherStats(teacher_id, res);
            }
        );
    });
});

app.post('/api/teachers', authenticateAdmin, uploadImage.single('image'), csrfProtection, (req, res) => {
    const { id, name, bio, description, classes, tags, room_number, schedule } = req.body;
    if (!validateFields(req.body, ['id', 'name', 'bio', 'description', 'classes', 'tags', 'room_number', 'schedule'])) {
        return res.status(400).json({ error: 'All fields required' });
    }
    const imageLink = req.file ? `/public/images/${req.file.filename}` : '';
    const teacher = {
        id: id.trim(),
        name,
        bio,
        description,
        classes: JSON.stringify(classes.split(',').map(c => c.trim())),
        tags: JSON.stringify(tags.split(',').map(t => t.trim())),
        room_number: room_number.trim(),
        schedule: JSON.stringify(JSON.parse(schedule || '[]')),
        image_link: imageLink,
    };
    db.run('INSERT INTO teachers (id, name, bio, description, classes, tags, room_number, schedule, image_link) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        Object.values(teacher), err => {
            if (err) return res.status(500).json({ error: 'Database error' });
            res.json({ message: 'Teacher added', teacher });
        });
});

app.delete('/api/admin/teachers/:id', authenticateAdmin, csrfProtection, (req, res) => {
    db.run('DELETE FROM teachers WHERE id = ?', [req.params.id], function(err) {
        if (err) return res.status(500).json({ error: 'Database error' });
        if (this.changes === 0) return res.status(404).json({ error: 'Teacher not found' });
        db.run('DELETE FROM votes WHERE teacher_id = ?', [req.params.id], err => err && console.error('Server - Error deleting votes:', err.message));
        res.json({ message: 'Teacher and votes deleted' });
    });
});

app.put('/api/admin/teachers/:id', authenticateAdmin, uploadImage.single('image'), csrfProtection, (req, res) => {
    console.log('Server - PUT /api/admin/teachers/:id - req.body:', req.body);
    if (req.file) console.log('Server - Uploaded file:', req.file);

    const { name, bio, classes, description, tags, room_number, schedule } = req.body;

    const safeParse = (field, fieldName, fallback = []) => {
        try {
            return field ? JSON.parse(field) : fallback;
        } catch (error) {
            console.error(`Server - Error parsing ${fieldName} for teacher ID ${req.params.id}:`, error.message, 'Raw value:', field);
            return fallback;
        }
    };

    db.get('SELECT * FROM teachers WHERE id = ?', [req.params.id], (err, existingTeacher) => {
        if (err) {
            console.error('Server - Database error fetching teacher:', err.message);
            return res.status(500).json({ error: 'Database error' });
        }
        if (!existingTeacher) return res.status(404).json({ error: 'Teacher not found' });

        const parsedExisting = {
            name: existingTeacher.name,
            bio: existingTeacher.bio,
            description: existingTeacher.description,
            classes: safeParse(existingTeacher.classes, 'classes'),
            tags: safeParse(existingTeacher.tags, 'tags'),
            room_number: existingTeacher.room_number,
            schedule: safeParse(existingTeacher.schedule, 'schedule'),
            image_link: existingTeacher.image_link,
        };

        const imageLink = req.file ? `/public/images/${req.file.filename}` : parsedExisting.image_link;
        const teacher = {
            name: name || parsedExisting.name,
            bio: bio || parsedExisting.bio,
            description: description || parsedExisting.description,
            classes: classes ? JSON.stringify(classes.split(',').map(c => c.trim())) : JSON.stringify(parsedExisting.classes),
            tags: tags ? JSON.stringify(tags.split(',').map(t => t.trim())) : JSON.stringify(parsedExisting.tags),
            room_number: room_number || parsedExisting.room_number,
            schedule: schedule ? JSON.stringify(safeParse(schedule, 'schedule', parsedExisting.schedule)) : JSON.stringify(parsedExisting.schedule),
            image_link: imageLink,
            id: req.params.id,
        };

        console.log('Server - Updating teacher with data:', teacher);

        if (!teacher.name || !teacher.bio || !teacher.description || !teacher.classes || !teacher.tags || !teacher.room_number || !teacher.schedule) {
            return res.status(400).json({ error: 'All fields must have values (empty strings or arrays allowed)' });
        }

        db.run('UPDATE teachers SET name = ?, bio = ?, description = ?, classes = ?, tags = ?, room_number = ?, schedule = ?, image_link = ? WHERE id = ?',
            [...Object.values(teacher).slice(0, -1), teacher.id], function(err) {
                if (err) {
                    console.error('Server - Error updating teacher:', err.message);
                    return res.status(500).json({ error: 'Database error' });
                }
                if (this.changes === 0) return res.status(404).json({ error: 'Teacher not found' });
                res.json({ message: 'Teacher updated', teacher });
            });
    });
});

app.get('/api/admin/teachers', authenticateAdmin, (req, res) => {
    const { perPage = 100 } = req.query;
    db.serialize(() => {
        db.all('SELECT * FROM teachers LIMIT ?', [parseInt(perPage)], (err, rows) => {
            if (err) {
                console.error('Server - Error fetching teachers:', err.message);
                return res.status(500).json({ error: 'Database error' });
            }
            try {
                const teachers = rows.map(row => {
                    const parseField = (field, fieldName) => {
                        try {
                            return field ? JSON.parse(field) : [];
                        } catch (parseErr) {
                            console.error(`Server - Error parsing ${fieldName} for teacher ID ${row.id}:`, parseErr.message, 'Raw value:', field);
                            return [];
                        }
                    };
                    return {
                        ...row,
                        classes: parseField(row.classes, 'classes'),
                        tags: parseField(row.tags, 'tags'),
                        schedule: parseField(row.schedule, 'schedule'),
                    };
                });
                res.json(teachers);
            } catch (generalErr) {
                console.error('Server - Unexpected error processing teachers:', generalErr.message);
                res.status(500).json({ error: 'Error processing teacher data' });
            }
        });
    });
});

app.post('/api/suggestions', publicLimiter, csrfProtection, (req, res) => {
    const { email, suggestion } = req.body;
    if (!validateFields(req.body, ['email', 'suggestion'])) {
        return res.status(400).json({ error: 'Email and suggestion required' });
    }
    const visitorId = req.cookies.visitorId;
    db.run('INSERT INTO suggestions (email, suggestion) VALUES (?, ?)', [email, suggestion], function(err) {
        if (err) return res.status(500).json({ error: 'Database error' });
        db.run('INSERT INTO notifications (visitor_id, message, type) VALUES (?, ?, ?)',
            [visitorId, 'Suggestion submitted! Thank you!', 'info'],
            err => err && console.error('Server - Error adding notification:', err.message));
        res.status(201).json({ message: 'Suggestion submitted', suggestionId: this.lastID });
    });
});

app.get('/api/suggestions', authenticateAdmin, (req, res) => {
    const { page = 1, perPage = 10, search = '', sort = 'timestamp', direction = 'desc' } = req.query;
    const limit = parseInt(perPage);
    const offset = (page - 1) * limit;
    const searchQuery = `%${search.toLowerCase()}%`;
    const orderBy = ['email', 'timestamp'].includes(sort) ? sort : 'timestamp';
    const sortOrder = direction.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

    db.serialize(() => {
        db.all(`SELECT * FROM suggestions WHERE email LIKE ? OR suggestion LIKE ? ORDER BY ${orderBy} ${sortOrder} LIMIT ? OFFSET ?`,
            [searchQuery, searchQuery, limit, offset], (err, rows) => {
                if (err) return res.status(500).json({ error: 'Database error' });
                db.get(`SELECT COUNT(*) as total FROM suggestions WHERE email LIKE ? OR suggestion LIKE ?`,
                    [searchQuery, searchQuery], (err, countRow) => {
                        if (err) return res.status(500).json({ error: 'Database error' });
                        res.json({ suggestions: rows, total: countRow.total });
                    });
            });
    });
});

app.delete('/api/suggestions/:id', authenticateAdmin, csrfProtection, (req, res) => {
    db.run('DELETE FROM suggestions WHERE id = ?', [req.params.id], function(err) {
        if (err) return res.status(500).json({ error: 'Database error' });
        if (this.changes === 0) return res.status(404).json({ error: 'Suggestion not found' });
        res.json({ message: 'Suggestion deleted' });
    });
});

app.post('/api/teacher-proposals', publicLimiter, uploadImage.single('image'), csrfProtection, authenticateUser, (req, res) => {
    const { name, bio, classes, description, tags, room_number, email, schedule } = req.body;
    const requiredFields = ['name', 'bio', 'classes', 'description', 'tags', 'room_number', 'email'];
    if (!validateFields(req.body, requiredFields)) {
        return res.status(400).json({ error: 'All required fields must be provided' });
    }

    if (room_number === tags || room_number.startsWith('[') || Array.isArray(room_number)) {
        console.error('Server - Invalid room_number detected:', room_number);
        return res.status(400).json({ error: 'Room number cannot be a list or match tags' });
    }

    const tempId = generateTempId();
    const image_link = req.file ? `/public/images/${req.file.filename}` : '';
    const userId = req.user ? req.user.id : null;
    const proposal = {
        id: tempId,
        name,
        bio,
        description,
        email,
        user_id: userId,
        classes: JSON.stringify(classes.split(',').map(c => c.trim())),
        tags: JSON.stringify(tags.split(',').map(t => t.trim())),
        room_number: room_number.trim(),
        schedule: schedule ? JSON.stringify(JSON.parse(schedule)) : '[]',
        image_link,
    };

    db.run('INSERT INTO teacher_proposals (id, name, bio, description, email, user_id, classes, tags, room_number, schedule, image_link) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        Object.values(proposal), err => {
            if (err) {
                console.error('Server - Error inserting teacher proposal:', err.message);
                return res.status(500).json({ error: 'Database error' });
            }
            res.json({ message: 'Proposal submitted', tempId });
        });
});

app.get('/api/admin/teacher-proposals', authenticateAdmin, (req, res) => {
    db.serialize(() => {
        db.all('SELECT * FROM teacher_proposals', (err, rows) => {
            if (err) {
                console.error('Server - Database error fetching proposals:', err.message);
                return res.status(500).json({ error: 'Database error' });
            }
            try {
                const proposals = rows.map(row => {
                    const parseField = (field, fieldName) => {
                        try {
                            return field ? JSON.parse(field) : [];
                        } catch (parseErr) {
                            console.error(`Server - Error parsing ${fieldName} for proposal ID ${row.id}:`, parseErr.message, 'Raw value:', field);
                            return [];
                        }
                    };
                    return {
                        ...row,
                        classes: parseField(row.classes, 'classes'),
                        tags: parseField(row.tags, 'tags'),
                        schedule: parseField(row.schedule, 'schedule'),
                    };
                });
                res.json(proposals);
            } catch (generalErr) {
                console.error('Server - Unexpected error processing proposals:', generalErr.message);
                res.status(500).json({ error: 'Error processing proposals' });
            }
        });
    });
});

app.put('/api/admin/teacher-submissions/:id', authenticateAdmin, (req, res) => {
    const submissionId = req.params.id;
    const { approved } = req.body;
    db.get('SELECT user_id FROM teacher_submissions WHERE id = ?', [submissionId], (err, submission) => {
        if (err || !submission) {
            console.error('Server - Error fetching submission:', err?.message);
            return res.status(404).json({ error: 'Submission not found' });
        }
        if (approved) {
            db.run('UPDATE teacher_submissions SET approved = 1 WHERE id = ?', [submissionId], (err) => {
                if (err) {
                    console.error('Server - Error approving submission:', err.message);
                    return res.status(500).json({ error: 'Database error' });
                }
updateUserPoints(submission.user_id, 10, 'Teacher submission approved', (err) => {
    if (err) return res.status(500).json({ error: 'Points update failed' });
    res.json({ message: 'Submission approved, points awarded' });
});
            });
        } else {
            res.json({ message: 'Submission processed' });
        }
    });
});

app.delete('/api/admin/teacher-proposals/:id', authenticateAdmin, csrfProtection, (req, res) => {
    db.run('DELETE FROM teacher_proposals WHERE id = ?', [req.params.id], function(err) {
        if (err) return res.status(500).json({ error: 'Database error' });
        if (this.changes === 0) return res.status(404).json({ error: 'Proposal not found' });
        res.json({ message: 'Proposal deleted' });
    });
});

app.post('/api/corrections/:teacherId', publicLimiter, uploadCorrection, csrfProtection, (req, res) => {
    const { suggestion } = req.body;
    if (!suggestion) return res.status(400).json({ error: 'Suggestion required' });
    const filePath = req.file ? `/public/uploads/corrections/${req.file.filename}` : null;
    db.run('INSERT INTO corrections (teacher_id, suggestion, file_path) VALUES (?, ?, ?)',
        [req.params.teacherId, suggestion, filePath], function(err) {
            if (err) return res.status(500).json({ error: 'Database error' });
            res.json({ message: 'Correction submitted', correctionId: this.lastID });
        });
});

app.get('/api/admin/corrections', authenticateAdmin, (req, res) => {
    db.serialize(() => {
        db.all('SELECT c.*, t.name AS teacher_name FROM corrections c LEFT JOIN teachers t ON c.teacher_id = t.id ORDER BY c.submitted_at DESC',
            (err, rows) => {
                if (err) return res.status(500).json({ error: 'Database error' });
                res.json(rows);
            });
    });
});

app.post('/api/admin/teacher-proposals/:id/approve', authenticateAdmin, csrfProtection, (req, res) => {
  const proposalId = req.params.id;

  // Step 1: Fetch the proposal
  db.get('SELECT * FROM teacher_proposals WHERE id = ?', [proposalId], (err, proposal) => {
    if (err) {
      console.error('Server - Error fetching teacher proposal:', err.message);
      return res.status(500).json({ error: 'Database error' });
    }
    if (!proposal) {
      console.log('Server - Proposal not found:', proposalId);
      return res.status(404).json({ error: 'Teacher proposal not found' });
    }

    // Step 2: Insert into teachers table
    const teacherData = {
      id: proposal.id.startsWith('TEMP-') ? `T${uuidv4().slice(0, 8)}` : proposal.id, // Generate a permanent ID if temp
      name: proposal.name,
      bio: proposal.bio,
      description: proposal.description,
      classes: proposal.classes,
      tags: proposal.tags,
      room_number: proposal.room_number,
      schedule: proposal.schedule,
      image_link: proposal.image_link,
      avg_rating: 0,
      rating_count: 0,
    };

    db.run(
      'INSERT INTO teachers (id, name, bio, description, classes, tags, room_number, schedule, image_link, avg_rating, rating_count) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      Object.values(teacherData),
      (err) => {
        if (err) {
          console.error('Server - Error inserting teacher:', err.message);
          return res.status(500).json({ error: 'Database error inserting teacher' });
        }

        // Step 3: Delete from teacher_proposals
        db.run('DELETE FROM teacher_proposals WHERE id = ?', [proposalId], (err) => {
          if (err) {
            console.error('Server - Error deleting proposal:', err.message);
            return res.status(500).json({ error: 'Database error deleting proposal' });
          }

          // Step 4: Award points to user (if user_id exists)
          if (proposal.user_id) {
            updateUserPoints(proposal.user_id, 10, 'Teacher proposal approved', (err) => {
    if (err) {
        console.error('Server - Error updating user points:', err.message);
        return res.status(500).json({ error: 'Points update failed' });
    }
    console.log('Server - Proposal approved and points awarded:', { proposalId, userId: proposal.user_id });
});
          }

          // Step 5: Notify the user (optional)
          db.run(
            'INSERT INTO notifications (visitor_id, message, type) VALUES (?, ?, ?)',
            [req.cookies.visitorId || proposal.user_id, `Your teacher proposal for ${proposal.name} has been approved!`, 'success'],
            (err) => {
              if (err) console.error('Server - Error adding notification:', err.message);
            }
          );

          res.json({ message: 'Teacher proposal approved', teacherId: teacherData.id });
        });
      }
    );
  });
});

app.post('/api/admin/corrections/:correctionId/implement', authenticateAdmin, csrfProtection, (req, res) => {
    db.serialize(() => {
        db.get('SELECT * FROM corrections WHERE id = ?', [req.params.correctionId], (err, correction) => {
            if (err) return res.status(500).json({ error: 'Database error' });
            if (!correction) return res.status(404).json({ error: 'Correction not found' });
            const updatedFields = correction.suggestion.startsWith('{') ? JSON.parse(correction.suggestion) : { description: correction.suggestion };
            if (correction.file_path) updatedFields.image_link = correction.file_path;
            const setClause = Object.keys(updatedFields).map(key => `${key} = ?`).join(', ');
            db.run(`UPDATE teachers SET ${setClause} WHERE id = ?`,
                [...Object.values(updatedFields), correction.teacher_id], function(err) {
                    if (err) return res.status(500).json({ error: 'Database error' });
                    if (this.changes === 0) return res.status(404).json({ error: 'Teacher not found' });
                    db.run('DELETE FROM corrections WHERE id = ?', [req.params.correctionId], err => {
                        if (err) return res.status(500).json({ error: 'Database error' });
                        res.json({ message: 'Correction implemented' });
                    });
                });
        });
    });
});

app.delete('/api/admin/corrections/:correctionId', authenticateAdmin, csrfProtection, (req, res) => {
    db.run('DELETE FROM corrections WHERE id = ?', [req.params.correctionId], function(err) {
        if (err) return res.status(500).json({ error: 'Database error' });
        if (this.changes === 0) return res.status(404).json({ error: 'Correction not found' });
        res.json({ message: 'Correction deleted' });
    });
});

app.get('/api/footer-settings', (req, res) => {
    db.get('SELECT value FROM settings WHERE key = "footer"', (err, row) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        try {
            res.json(JSON.parse(row.value));
        } catch (parseErr) {
            console.error('Server - Error parsing footer settings:', parseErr.message);
            res.status(500).json({ error: 'Error processing settings' });
        }
    });
});

app.delete('/api/users/:id', authenticateAdmin, csrfProtection, (req, res) => {
    const userId = req.params.id;

    db.serialize(() => {
        // Check if the user exists first
        db.get('SELECT username FROM users WHERE id = ?', [userId], (err, user) => {
            if (err) {
                console.error('Server - Error checking user existence:', err.message);
                return res.status(500).json({ error: 'Database error' });
            }
            if (!user) {
                console.log(`Server - User ${userId} not found for deletion`);
                return res.status(404).json({ error: 'User not found' });
            }

            // Delete related data first (point_transactions, votes, teacher_proposals)
            db.run('DELETE FROM point_transactions WHERE user_id = ?', [userId], (err) => {
                if (err) console.error('Server - Error deleting point transactions:', err.message);
            });
            db.run('DELETE FROM votes WHERE user_id = ?', [userId], (err) => {
                if (err) console.error('Server - Error deleting votes:', err.message);
            });
            db.run('DELETE FROM teacher_proposals WHERE user_id = ?', [userId], (err) => {
                if (err) console.error('Server - Error deleting teacher proposals:', err.message);
            });

            // Delete the user
            db.run('DELETE FROM users WHERE id = ?', [userId], function(err) {
                if (err) {
                    console.error('Server - Error deleting user:', err.message);
                    return res.status(500).json({ error: 'Database error' });
                }
                if (this.changes === 0) {
                    // This shouldn’t happen due to the prior check, but included for robustness
                    return res.status(404).json({ error: 'User not found' });
                }

                console.log(`Server - User ${userId} (${user.username}) deleted successfully along with related data`);
                res.json({ message: 'User deleted successfully' });
            });
        });
    });
});

app.put('/api/admin/footer-settings', authenticateAdmin, csrfProtection, (req, res) => {
    const { email, message, showMessage } = req.body;
    if (!email || typeof message !== 'string' || typeof showMessage !== 'boolean') {
        return res.status(400).json({ error: 'Invalid footer settings' });
    }
    db.run('UPDATE settings SET value = ? WHERE key = "footer"',
        [JSON.stringify({ email, message, showMessage })], err => {
            if (err) return res.status(500).json({ error: 'Database error' });
            res.json({ message: 'Footer settings updated' });
        });
});

app.get('/api/message-settings', (req, res) => {
    db.get('SELECT value FROM settings WHERE key = "message"', (err, row) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        try {
            res.json(JSON.parse(row.value));
        } catch (parseErr) {
            console.error('Server - Error parsing message settings:', parseErr.message);
            res.status(500).json({ error: 'Error processing settings' });
        }
    });
});

app.put('/api/admin/message-settings', authenticateAdmin, csrfProtection, (req, res) => {
    const { message, showMessage } = req.body;
    if (typeof message !== 'string' || typeof showMessage !== 'boolean') {
        return res.status(400).json({ error: 'Invalid message settings' });
    }
    db.run('UPDATE settings SET value = ? WHERE key = "message"',
        [JSON.stringify({ message, showMessage })], err => {
            if (err) return res.status(500).json({ error: 'Database error' });
            res.json({ message: 'Message settings updated' });
        });
});

app.get('/api/admin/section-settings', authenticateAdmin, (req, res) => {
    db.get('SELECT value FROM settings WHERE key = "sectionExpansion"', (err, row) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        try {
            res.json(JSON.parse(row.value));
        } catch (parseErr) {
            console.error('Server - Error parsing section settings:', parseErr.message);
            res.status(500).json({ error: 'Error processing settings' });
        }
    });
});

app.patch('/api/teachers/:id', authenticateAdmin, csrfProtection, (req, res) => {
    const { id } = req.params;
    const { description } = req.body;
    if (!description) return res.status(400).json({ error: 'Description required' });
    db.run('UPDATE teachers SET description = ? WHERE id = ?', [description, id], function(err) {
        if (err) {
            console.error('Server - Error updating teacher description:', err.message);
            return res.status(500).json({ error: 'Database error' });
        }
        if (this.changes === 0) return res.status(404).json({ error: 'Teacher not found' });
        res.json({ message: 'Description updated' });
    });
});

app.put('/api/admin/section-settings', authenticateAdmin, csrfProtection, (req, res) => {
    const settings = req.body;
    if (!settings || typeof settings !== 'object') return res.status(400).json({ error: 'Invalid settings' });
    db.run('UPDATE settings SET value = ? WHERE key = "sectionExpansion"',
        [JSON.stringify(settings)], err => {
            if (err) return res.status(500).json({ error: 'Database error' });
            res.json({ message: 'Section settings updated' });
        });
});

app.get('/api/admin/stats', authenticateAdmin, (req, res) => {
    const timeFrame = req.query.timeFrame || '1day';
    const intervals = { '1hour': 1, '6hours': 6, '1day': 24, '7days': 168, '1month': 720 };
    if (!intervals[timeFrame]) return res.status(400).json({ error: 'Invalid timeFrame' });
    const hours = intervals[timeFrame];
    const startTime = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

    db.serialize(() => {
        db.get('SELECT COUNT(*) as totalTeachers FROM teachers', (err, t) => {
            if (err) return res.status(500).json({ error: 'Database error' });
            db.get('SELECT COUNT(*) as totalVotes FROM votes', (err, v) => {
                if (err) return res.status(500).json({ error: 'Database error' });
                db.get('SELECT COUNT(*) as totalProposals FROM teacher_proposals', (err, p) => {
                    if (err) return res.status(500).json({ error: 'Database error' });
                    db.all('SELECT * FROM stats WHERE timestamp >= ?', [startTime], (err, visits) => {
                        if (err) return res.status(500).json({ error: 'Database error' });
                        db.all('SELECT t.id, t.name, COUNT(v.id) as voteCount FROM teachers t LEFT JOIN votes v ON t.id = v.teacher_id GROUP BY t.id, t.name ORDER BY voteCount DESC LIMIT 5', (err, topTeachers) => {
                            if (err) return res.status(500).json({ error: 'Database error' });
                            const totalVisits = visits.length;
                            const uniqueVisits = new Set(visits.map(v => v.visitor_id)).size;
                            const avgVisits = (totalVisits / hours).toFixed(2);
                            const interval = hours <= 6 ? 5 * 60 * 1000 : hours <= 24 ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
                            const visitsOverTime = [];
                            let current = new Date(startTime);
                            while (current < new Date()) {
                                const next = new Date(current.getTime() + interval);
                                visitsOverTime.push({
                                    time: current.toISOString().slice(11, 16),
                                    count: visits.filter(v => new Date(v.timestamp) >= current && new Date(v.timestamp) < next).length
                                });
                                current = next;
                            }
                            res.json({
                                totalTeachers: t.totalTeachers,
                                totalVotes: v.totalVotes,
                                totalProposals: p.totalProposals,
                                totalVisits,
                                uniqueVisits,
                                avgVisits,
                                topTeachers,
                                visitsOverTime
                            });
                        });
                    });
                });
            });
        });
    });
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'pages', 'home', 'index.html'));
});

app.get('/teacher-profile.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'pages', 'teacher-profile.html'));
});

app.use((err, req, res, next) => {
    if (err.code === 'EBADCSRFTOKEN') {
        console.error('Server - CSRF token validation failed:', {
            path: req.path,
            body: req.body,
            sessionID: req.sessionID,
            expectedCsrf: req.csrfToken()
        });
        return res.status(403).json({ error: 'Invalid CSRF token' });
    }
    next(err);
});

app.use((req, res) => {
    res.status(404).json({ error: 'Not found' });
});

const server = app.listen(port, () => {
    console.log(`Server running on port ${port} - Version 1.25 - Started at ${new Date().toISOString()}`);
}).on('error', (err) => {
    console.error(`Server - Failed to start on port ${port}:`, err.message);
    if (err.code === 'EADDRINUSE') {
        console.log(`Server - Port ${port} is in use, try a different port.`);
    }
    process.exit(1);
});

process.on('SIGINT', () => {
    console.log('Server - Received SIGINT, shutting down...');
    server.close(() => {
        db.close(err => {
            if (err) console.error('Server - Error closing database:', err.message);
            console.log('Server - Database connection closed');
            process.exit(0);
        });
    });
});

process.on('uncaughtException', (err) => {
    console.error('Server - Uncaught Exception:', err.stack || err.message);
    server.close(() => {
        db.close(() => {
            console.log('Server - Cleanup complete after uncaught exception');
            process.exit(1);
        });
    });
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Server - Unhandled Rejection at:', promise, 'reason:', reason.stack || reason);
    server.close(() => {
        db.close(() => {
            console.log('Server - Cleanup complete after unhandled rejection');
            process.exit(1);
        });
    });
});