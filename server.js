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
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

console.log('Server - Initializing...');

// Middleware
app.use(cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
}));
app.use('/public', express.static(path.join(__dirname, 'public'), { maxAge: '1d' }));
app.use('/pages', express.static(path.join(__dirname, 'pages'), { maxAge: '1d' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Log all requests and responses
app.use((req, res, next) => {
    console.log(`Server - Request: ${req.method} ${req.url}`);
    res.on('finish', () => {
        console.log(`Server - Response: ${req.method} ${req.url} - Status: ${res.statusCode}`);
    });
    next();
});

// CSRF protection
const csrfProtection = csurf({
    cookie: { 
        httpOnly: true, 
        sameSite: 'Strict', 
        secure: process.env.NODE_ENV === 'production' 
    },
    value: (req) => req.headers['x-csrf-token'] || req.body._csrf,
});

// Rate limiting for public endpoints
const publicLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // 100 requests per IP
    message: { error: 'Too many requests, please try again later.' },
});

// Explicit content filter
const explicitWords = [
    'fuck', 'shit', 'ass', 'bitch', 'damn', 'piss', 'cunt', 'cock', 'dick', 'bastard'
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

// Multer for teacher/proposal images
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
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});

// Multer for correction uploads
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
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
}).single('file');

// Visitor tracking middleware
app.use((req, res, next) => {
    const visitorId = req.cookies.visitorId || uuidv4();
    if (!req.cookies.visitorId) {
        res.cookie('visitorId', visitorId, { 
            maxAge: 365 * 24 * 60 * 60 * 1000, 
            httpOnly: true, 
            sameSite: 'Strict' 
        });
    }
    db.run('INSERT INTO stats (visitor_id, timestamp) VALUES (?, ?)', 
        [visitorId, new Date().toISOString()], 
        err => err && console.error('Server - Error logging visit:', err.message));
    next();
});

// SQLite Database Setup
const db = new sqlite3.Database('./database.sqlite', (err) => {
    if (err) console.error('Server - Database connection error:', err.message);
    else console.log('Server - Connected to SQLite database');
});

// Utility function to generate temporary IDs
function generateTempId() {
    return `TEMP-${uuidv4().slice(0, 8)}`;
}

// Database initialization
db.serialize(() => {
    const tables = [
        `CREATE TABLE IF NOT EXISTS teachers (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            bio TEXT NOT NULL,
            description TEXT NOT NULL,
            classes TEXT NOT NULL,
            tags TEXT NOT NULL,
            room_number TEXT NOT NULL,
            schedule TEXT NOT NULL,
            image_link TEXT)`,
        `CREATE TABLE IF NOT EXISTS votes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            teacher_id TEXT NOT NULL,
            rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
            comment TEXT,
            is_explicit INTEGER DEFAULT 0,
            FOREIGN KEY (teacher_id) REFERENCES teachers(id))`,
        `CREATE TABLE IF NOT EXISTS teacher_proposals (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            bio TEXT NOT NULL,
            description TEXT NOT NULL,
            classes TEXT NOT NULL,
            tags TEXT NOT NULL,
            room_number TEXT NOT NULL,
            email TEXT NOT NULL,
            schedule TEXT NOT NULL,
            image_link TEXT)`,
        `CREATE TABLE IF NOT EXISTS corrections (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            teacher_id TEXT NOT NULL,
            suggestion TEXT NOT NULL,
            file_path TEXT,
            submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (teacher_id) REFERENCES teachers(id))`,
        `CREATE TABLE IF NOT EXISTS admin_requests (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            email TEXT NOT NULL,
            reason TEXT NOT NULL,
            visitor_id TEXT NOT NULL,
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`,
        `CREATE TABLE IF NOT EXISTS notifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            visitor_id TEXT NOT NULL,
            message TEXT NOT NULL,
            type TEXT NOT NULL DEFAULT 'info',
            read INTEGER DEFAULT 0,
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`,
        `CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL)`,
        `CREATE TABLE IF NOT EXISTS stats (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            visitor_id TEXT NOT NULL,
            timestamp TEXT NOT NULL)`,
        `CREATE TABLE IF NOT EXISTS admins (
            username TEXT PRIMARY KEY,
            password_hash TEXT NOT NULL)`,
        `CREATE TABLE IF NOT EXISTS suggestions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT NOT NULL,
            suggestion TEXT NOT NULL,
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`
    ];

    const indexes = [
        `CREATE INDEX IF NOT EXISTS idx_votes_teacher_id ON votes (teacher_id)`,
        `CREATE INDEX IF NOT EXISTS idx_stats_timestamp ON stats (timestamp)`,
        `CREATE INDEX IF NOT EXISTS idx_admin_requests_timestamp ON admin_requests (timestamp)`,
        `CREATE INDEX IF NOT EXISTS idx_notifications_visitor_id ON notifications (visitor_id)`,
        `CREATE INDEX IF NOT EXISTS idx_suggestions_timestamp ON suggestions (timestamp)`
    ];

    tables.forEach(query => db.run(query, err => err && console.error('Server - Error creating table:', err.message)));
    indexes.forEach(query => db.run(query, err => err && console.error('Server - Error creating index:', err.message)));

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
            'Section Expansion Settings': true
        })]
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
                '/public/images/default-teacher.jpg'
            ], err => err ? console.error('Server - Error inserting teacher:', err.message) : console.log('Server - Inserted default teacher T001'));
        }
    });
});

// Favicon handler
app.get('/favicon.ico', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'favicon.ico'), err => {
        if (err) res.status(204).end();
    });
});

// Utility functions
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
        console.log('Server - Invalid JWT:', req.path);
        res.status(401).json({ error: 'Unauthorized: Invalid token' });
    }
}

// API Routes
app.get('/api/csrf-token', csrfProtection, (req, res) => {
    res.json({ csrfToken: req.csrfToken() });
});

app.post('/api/admin/login', publicLimiter, csrfProtection, async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

    db.get('SELECT * FROM admins WHERE username = ?', [username], async (err, admin) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        if (!admin || !(await bcrypt.compare(password, admin.password_hash))) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: '1d' });
        res.cookie('adminToken', token, { 
            httpOnly: true, 
            sameSite: 'Strict', 
            secure: process.env.NODE_ENV === 'production', 
            maxAge: 24 * 60 * 60 * 1000 
        });
        res.json({ message: 'Logged in successfully' });
    });
});

app.get('/api/admin/verify', authenticateAdmin, (req, res) => {
    res.json({ message: 'Admin session active', username: req.admin.username });
});

app.get('/pages/admin/login.html', (req, res) => {
    if (req.cookies.adminToken && jwt.verify(req.cookies.adminToken, JWT_SECRET, err => !err)) {
        return res.redirect('/pages/admin/dashboard.html');
    }
    res.sendFile(path.join(__dirname, 'pages', 'admin', 'login.html'));
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
        'default': 't.id'
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
                                        return []; // Fallback to empty array
                                    }
                                };
                                return {
                                    ...t,
                                    classes: parseField(t.classes, 'classes'),
                                    tags: parseField(t.tags, 'tags'),
                                    schedule: parseField(t.schedule, 'schedule'),
                                    avg_rating: t.avg_rating ? parseFloat(t.avg_rating.toFixed(1)) : null
                                };
                            });
                            res.json({
                                teachers: parsedTeachers,
                                total: countRow.total
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
                    rating_count: ratings.length
                });
            });
        });
    });
});

app.post('/api/ratings', publicLimiter, csrfProtection, (req, res) => {
    const { teacher_id, rating, comment } = req.body;
    if (!teacher_id || !rating || rating < 1 || rating > 5) {
        return res.status(400).json({ error: 'Invalid teacher ID or rating' });
    }
    const votedTeachers = (req.cookies.votedTeachers || '').split(',').filter(Boolean);
    if (votedTeachers.includes(teacher_id)) {
        return res.status(400).json({ error: 'Already voted for this teacher' });
    }
    const { cleanedComment, isExplicit } = filterComment(comment);
    db.run('INSERT INTO votes (teacher_id, rating, comment, is_explicit) VALUES (?, ?, ?, ?)', 
        [teacher_id, parseInt(rating), cleanedComment, isExplicit ? 1 : 0], function(err) {
            if (err) return res.status(500).json({ error: 'Database error' });
            votedTeachers.push(teacher_id);
            res.cookie('votedTeachers', votedTeachers.join(','), { maxAge: 365 * 24 * 60 * 60 * 1000, httpOnly: true });
            db.all('SELECT rating FROM votes WHERE teacher_id = ?', [teacher_id], (err, ratings) => {
                if (err) return res.status(500).json({ error: 'Database error' });
                const avgRating = ratings.length ? ratings.reduce((sum, r) => sum + r.rating, 0) / ratings.length : null;
                res.json({
                    message: 'Rating submitted',
                    avg_rating: avgRating ? parseFloat(avgRating.toFixed(1)) : null,
                    rating_count: ratings.length,
                    is_explicit: isExplicit
                });
            });
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
        name, bio, description,
        classes: JSON.stringify(classes.split(',').map(c => c.trim())),
        tags: JSON.stringify(tags.split(',').map(t => t.trim())),
        room_number: room_number.trim(),
        schedule: JSON.stringify(JSON.parse(schedule || '[]')),
        image_link: imageLink
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
    // Log incoming request for debugging
    console.log('Server - PUT /api/admin/teachers/:id - req.body:', req.body);
    if (req.file) console.log('Server - Uploaded file:', req.file);

    const { name, bio, classes, description, tags, room_number, schedule } = req.body;

    // Helper function to safely parse JSON with fallback
    const safeParse = (field, fieldName, fallback = []) => {
        try {
            return field ? JSON.parse(field) : fallback;
        } catch (error) {
            console.error(`Server - Error parsing ${fieldName} for teacher ID ${req.params.id}:`, error.message, 'Raw value:', field);
            return fallback; // Fallback to empty array or default
        }
    };

    // Fetch existing teacher data
    db.get('SELECT * FROM teachers WHERE id = ?', [req.params.id], (err, existingTeacher) => {
        if (err) {
            console.error('Server - Database error fetching teacher:', err.message);
            return res.status(500).json({ error: 'Database error' });
        }
        if (!existingTeacher) return res.status(404).json({ error: 'Teacher not found' });

        // Parse existing fields with safe parsing
        const parsedExisting = {
            name: existingTeacher.name,
            bio: existingTeacher.bio,
            description: existingTeacher.description,
            classes: safeParse(existingTeacher.classes, 'classes'),
            tags: safeParse(existingTeacher.tags, 'tags'),
            room_number: existingTeacher.room_number,
            schedule: safeParse(existingTeacher.schedule, 'schedule'),
            image_link: existingTeacher.image_link
        };

        // Construct updated teacher object with request data or existing data as fallback
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
            id: req.params.id
        };

        // Log the constructed teacher object before saving
        console.log('Server - Updating teacher with data:', teacher);

        // Ensure all fields have values (empty strings or arrays allowed)
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
                            return []; // Fallback to empty array
                        }
                    };
                    return {
                        ...row,
                        classes: parseField(row.classes, 'classes'),
                        tags: parseField(row.tags, 'tags'),
                        schedule: parseField(row.schedule, 'schedule')
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

app.post('/api/teacher-proposals', publicLimiter, uploadImage.single('image'), csrfProtection, (req, res) => {
    const { name, bio, classes, description, tags, room_number, email, schedule } = req.body;
    const requiredFields = ['name', 'bio', 'classes', 'description', 'tags', 'room_number', 'email'];
    if (!validateFields(req.body, requiredFields)) {
        return res.status(400).json({ error: 'All required fields must be provided' });
    }

    // Validate room_number
    if (room_number === tags || room_number.startsWith('[') || Array.isArray(room_number)) {
        console.error('Server - Invalid room_number detected:', room_number);
        return res.status(400).json({ error: 'Room number cannot be a list or match tags' });
    }

    const tempId = generateTempId();
    const image_link = req.file ? `/public/images/${req.file.filename}` : '';
    const proposal = {
        id: tempId,
        name,
        bio,
        description,
        email,
        classes: JSON.stringify(classes.split(',').map(c => c.trim())),
        tags: JSON.stringify(tags.split(',').map(t => t.trim())),
        room_number: room_number.trim(), // Ensure it’s a string
        schedule: schedule ? JSON.stringify(JSON.parse(schedule)) : '[]',
        image_link
    };

    db.run('INSERT INTO teacher_proposals (id, name, bio, description, email, classes, tags, room_number, schedule, image_link) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', 
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
                            return []; // Fallback to empty array
                        }
                    };
                    return {
                        ...row,
                        classes: parseField(row.classes, 'classes'),
                        tags: parseField(row.tags, 'tags'),
                        schedule: parseField(row.schedule, 'schedule')
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

app.post('/api/admin/teacher-proposals/approve/:tempId', authenticateAdmin, csrfProtection, (req, res) => {
    const { id } = req.body;
    if (!id) return res.status(400).json({ error: 'Teacher ID required' });

    db.serialize(() => {
        db.get('SELECT * FROM teacher_proposals WHERE id = ?', [req.params.tempId], (err, proposal) => {
            if (err) return res.status(500).json({ error: 'Database error' });
            if (!proposal) return res.status(404).json({ error: 'Proposal not found' });

            // Validate room_number before insertion
            const roomNumber = typeof proposal.room_number === 'string' && !proposal.room_number.startsWith('[') 
                ? proposal.room_number.trim() 
                : 'Unknown';
            if (roomNumber === proposal.tags || roomNumber.startsWith('[')) {
                console.error(`Server - Invalid room_number in proposal ${req.params.tempId}:`, proposal.room_number);
            }

            db.run('INSERT INTO teachers (id, name, bio, description, classes, tags, room_number, schedule, image_link) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [id, proposal.name, proposal.bio, proposal.description, proposal.classes, proposal.tags, roomNumber, proposal.schedule, proposal.image_link || ''],
                err => {
                    if (err) return res.status(500).json({ error: 'Database error' });
                    db.run('DELETE FROM teacher_proposals WHERE id = ?', [req.params.tempId], err => {
                        if (err) return res.status(500).json({ error: 'Database error' });
                        res.json({ message: 'Proposal approved', teacherId: id });
                    });
                });
        });
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

app.use((req, res) => {
    res.status(404).json({ error: 'Not found' });
});

// Start server with enhanced error handling
const server = app.listen(port, () => {
    console.log(`Server running on port ${port} - Version 1.24 - Started at ${new Date().toISOString()}`);
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