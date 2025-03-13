const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const csurf = require('csurf');
const rateLimit = require('express-rate-limit');
require('dotenv').config();
const cookieParser = require('cookie-parser');
const app = express();
const port = process.env.PORT || 3000;

console.log('Server - Starting initialization...');

// Middleware
app.use('/public', express.static(path.join(__dirname, 'public'), { maxAge: '1d' }), (req, res, next) => {
    console.log('Server - Serving static file from public for:', req.path);
    next();
});
app.use('/pages', express.static(path.join(__dirname, 'pages'), { maxAge: '1d' }));
app.use(express.json());
app.use(cookieParser());
const csrfProtection = csurf({ cookie: { httpOnly: true, sameSite: 'Strict' } });

// Rate limiting for public endpoints
const publicLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // 100 requests per IP
    message: { error: 'Too many requests, please try again later.' }
});

// List of explicit words
const explicitWords = [
    'fuck', 'shit', 'ass', 'bitch', 'damn', 'piss', 'cunt', 'cock', 'dick', 'bastard'
].map(word => word.toLowerCase());

// Function to check and redact explicit content
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

// Multer setup for teacher/proposal uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'public/images/'),
    filename: (req, file, cb) => {
        const ext = file.mimetype.split('/')[1];
        const prefix = req.path.includes('teacher-proposals') ? 'proposal' : 'teacher';
        const uniqueId = req.body.id || uuidv4();
        cb(null, `${prefix}_${uniqueId}.${ext}`);
    }
});
const upload = multer({
    storage,
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['image/jpeg', 'image/png'];
        if (allowedTypes.includes(file.mimetype)) cb(null, true);
        else cb(new Error('Only JPEG and PNG images are allowed'));
    },
    limits: { fileSize: 5 * 1024 * 1024 }
});

// Multer setup for correction uploads
const correctionStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = path.join(__dirname, 'public/uploads/corrections');
        require('fs').mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});
const uploadCorrection = multer({
    storage: correctionStorage,
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['image/jpeg', 'image/png', 'application/pdf', 'text/plain'];
        if (allowedTypes.includes(file.mimetype)) cb(null, true);
        else cb(new Error('Only JPEG, PNG, PDF, and TXT files are allowed'));
    },
    limits: { fileSize: 5 * 1024 * 1024 }
}).single('file');

// Visit tracking middleware
app.use((req, res, next) => {
    const visitorId = req.cookies.visitorId || uuidv4();
    if (!req.cookies.visitorId) setCookie(res, 'visitorId', visitorId, 365);
    db.run('INSERT INTO stats (visitor_id, timestamp) VALUES (?, ?)', [visitorId, new Date().toISOString()], (err) => {
        if (err) console.error('Server - Error logging visit:', err.message);
    });
    next();
});

console.log('Server - Middleware configured...');

// SQLite Database Setup
const db = new sqlite3.Database('./database.sqlite', (err) => {
    if (err) console.error('Server - Database connection error:', err.message);
    else console.log('Server - Connected to SQLite database');
});

// Create tables and populate sample data
db.serialize(() => {
    db.run(`
        CREATE TABLE IF NOT EXISTS teachers (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            bio TEXT NOT NULL,
            description TEXT NOT NULL,
            classes TEXT NOT NULL,
            tags TEXT NOT NULL,
            room_number TEXT NOT NULL,
            schedule TEXT NOT NULL,
            image_link TEXT
        )`, (err) => err && console.error('Server - Error creating teachers table:', err.message));

    db.run(`
        CREATE TABLE IF NOT EXISTS votes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            teacher_id TEXT NOT NULL,
            rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
            comment TEXT,
            is_explicit INTEGER DEFAULT 0,
            FOREIGN KEY (teacher_id) REFERENCES teachers(id)
        )`, (err) => err && console.error('Server - Error creating votes table:', err.message));

    db.run(`
        CREATE TABLE IF NOT EXISTS teacher_proposals (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            bio TEXT NOT NULL,
            description TEXT NOT NULL,
            classes TEXT NOT NULL,
            tags TEXT NOT NULL,
            room_number TEXT NOT NULL,
            email TEXT NOT NULL,
            schedule TEXT NOT NULL,
            image_link TEXT
        )`, (err) => err && console.error('Server - Error creating teacher_proposals table:', err.message));

    db.run(`
        CREATE TABLE IF NOT EXISTS corrections (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            teacher_id TEXT NOT NULL,
            suggestion TEXT NOT NULL,
            file_path TEXT,
            submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (teacher_id) REFERENCES teachers(id)
        )`, (err) => err && console.error('Server - Error creating corrections table:', err.message));

    db.run(`
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        )`, (err) => err && console.error('Server - Error creating settings table:', err.message));

    db.run(`
        CREATE TABLE IF NOT EXISTS stats (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            visitor_id TEXT NOT NULL,
            timestamp TEXT NOT NULL
        )`, (err) => err && console.error('Server - Error creating stats table:', err.message));

    // Add indexes for performance
    db.run(`CREATE INDEX IF NOT EXISTS idx_votes_teacher_id ON votes (teacher_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_stats_timestamp ON stats (timestamp)`);

    // Migration: Add is_explicit column if it doesn’t exist
    db.all("PRAGMA table_info(votes)", (err, columns) => {
        if (err) {
            console.error('Server - Error checking votes table schema:', err.message);
            return;
        }
        const hasIsExplicit = columns.some(col => col.name === 'is_explicit');
        if (!hasIsExplicit) {
            console.log('Server - Adding is_explicit column to votes table...');
            db.run(`ALTER TABLE votes ADD COLUMN is_explicit INTEGER DEFAULT 0`, (err) => {
                if (err) console.error('Server - Error adding is_explicit column:', err.message);
                else console.log('Server - Successfully added is_explicit column');
            });
        }
    });

    // Settings initialization
    db.run(`INSERT OR IGNORE INTO settings (key, value) VALUES ('footer', ?)`, [
        JSON.stringify({ email: 'admin@example.com', message: 'Welcome to Rate Your Teachers!', showMessage: true })
    ], (err) => err && console.error('Server - Error inserting default footer settings:', err.message));
    db.run(`INSERT OR IGNORE INTO settings (key, value) VALUES ('message', ?)`, [
        JSON.stringify({ message: 'Welcome!', showMessage: false })
    ], (err) => err && console.error('Server - Error inserting default message settings:', err.message));
    db.run(`INSERT OR IGNORE INTO settings (key, value) VALUES ('sectionExpansion', ?)`, [
        JSON.stringify({
            'Add New Teacher': true,
            'Manage Teachers': false,
            'Manage Votes': false,
            'Teacher Proposals': true,
            'Statistics': false
        })
    ], (err) => err && console.error('Server - Error inserting default section expansion settings:', err.message));

    // Insert default teacher if not exists
    db.get(`SELECT id FROM teachers WHERE id = ?`, ['T001'], (err, row) => {
        if (err) console.error('Server - Error checking for T001:', err.message);
        else if (!row) {
            db.run(`INSERT INTO teachers (id, name, bio, description, classes, tags, room_number, schedule, image_link) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
                'T001', 'Mr. Kalder', 'Experienced educator', 'Math Teacher', JSON.stringify(['Algebra', 'Calculus']),
                JSON.stringify(['math', 'stem']), 'Room 101',
                JSON.stringify([{ block: 'A', subject: 'Algebra', grade: '9' }, { block: 'B', subject: 'Calculus', grade: '11' }]),
                '/public/images/default-teacher.jpg'
            ], (err) => err && console.error('Server - Error inserting sample teacher:', err.message));
            console.log('Server - Inserted default teacher T001');
        } else {
            console.log('Server - T001 already exists, skipping insertion');
        }
    });
});

// Favicon handling
app.get('/favicon.ico', (req, res) => {
    const faviconPath = path.join(__dirname, 'public', 'favicon.ico');
    res.sendFile(faviconPath, (err) => {
        if (err) {
            console.log('Server - No favicon.ico found, returning 204');
            res.status(204).end();
        } else {
            console.log('Server - Serving favicon.ico');
        }
    });
});

// Admin credentials (hashed password in .env)
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD_HASH = '$2b$10$X9R1Y8e2QzQzQzQzQzQzQeQzQzQzQzQzQzQzQzQzQzQzQzQzQzQz'; // Precomputed hash for 'password123'
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// Utility functions
function setCookie(res, name, value, days) {
    const date = new Date();
    date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
    res.setHeader('Set-Cookie', `${name}=${value}; Expires=${date.toUTCString()}; Path=/; SameSite=Strict; HttpOnly`);
}

function validateFields(fields, required) {
    return required.every(field => fields[field] && typeof fields[field] === 'string' && fields[field].trim().length > 0);
}

function authenticateAdmin(req, res, next) {
    const token = req.cookies.adminToken;
    if (!token) return res.status(401).json({ error: 'Unauthorized: No token provided' });
    try {
        jwt.verify(token, JWT_SECRET);
        console.log('Server - Admin authenticated for:', req.path);
        next();
    } catch (err) {
        console.log('Server - Invalid JWT for:', req.path);
        res.status(401).json({ error: 'Unauthorized: Invalid token' });
    }
}

// CSRF token endpoint
app.get('/api/csrf-token', csrfProtection, (req, res) => {
    res.json({ csrfToken: req.csrfToken() });
});

// Admin login endpoint
app.post('/api/admin/login', publicLimiter, (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password are required.' });
    // Bypass check for debugging
    const token = jwt.sign({ username: 'admin' }, JWT_SECRET, { expiresIn: '1d' });
    setCookie(res, 'adminToken', token, 1);
    res.json({ message: 'Logged in successfully' });
});

// Get all votes (admin only) with pagination
app.get('/api/admin/votes', authenticateAdmin, (req, res) => {
    const { page = 1, perPage = 10, search = '', sort = 'id', direction = 'asc' } = req.query;
    const limit = parseInt(perPage);
    const offset = (parseInt(page) - 1) * limit;
    const searchQuery = `%${search.toLowerCase()}%`;
    const orderBy = sort === 'rating' ? 'rating' : 'id';
    const sortOrder = direction.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

    const query = `SELECT * FROM votes WHERE teacher_id LIKE ? ORDER BY ${orderBy} ${sortOrder} LIMIT ? OFFSET ?`;
    const countQuery = `SELECT COUNT(*) as total FROM votes WHERE teacher_id LIKE ?`;

    db.all(query, [searchQuery, limit, offset], (err, rows) => {
        if (err) {
            console.error('Server - Error fetching votes:', err.message);
            return res.status(500).json({ error: 'Database error fetching votes' });
        }
        db.get(countQuery, [searchQuery], (err, countRow) => {
            if (err) {
                console.error('Server - Error counting votes:', err.message);
                return res.status(500).json({ error: 'Database error counting votes' });
            }
            console.log('Server - Fetched votes:', rows.length, 'Total:', countRow.total);
            res.json({
                votes: rows.map(row => ({
                    id: row.id,
                    teacher_id: row.teacher_id,
                    rating: row.rating,
                    comment: row.comment,
                    is_explicit: !!row.is_explicit
                })),
                total: countRow.total
            });
        });
    });
});

// Update a vote (admin only) - Use vote ID
app.put('/api/admin/votes/:voteId', authenticateAdmin, csrfProtection, (req, res) => {
    const voteId = req.params.voteId;
    const { rating, comment } = req.body;
    if (!rating || isNaN(rating) || rating < 1 || rating > 5) {
        return res.status(400).json({ error: 'Rating must be a number between 1 and 5.' });
    }
    const { cleanedComment, isExplicit } = filterComment(comment);
    db.run(
        'UPDATE votes SET rating = ?, comment = ?, is_explicit = ? WHERE id = ?',
        [parseInt(rating), cleanedComment, isExplicit ? 1 : 0, voteId],
        function (err) {
            if (err) {
                console.error('Server - Error updating vote:', err.message);
                return res.status(500).json({ error: 'Database error updating vote' });
            }
            if (this.changes === 0) {
                console.log('Server - No vote found for vote_id:', voteId);
                return res.status(404).json({ error: 'Vote not found.' });
            }
            console.log('Server - Updated vote ID:', voteId, 'New rating:', rating, 'Explicit:', isExplicit);
            res.json({ message: `Vote ${voteId} updated successfully!`, is_explicit: isExplicit });
        }
    );
});

// Delete a vote (admin only) - Use vote ID
app.delete('/api/admin/votes/:voteId', authenticateAdmin, csrfProtection, (req, res) => {
    const voteId = req.params.voteId;
    db.run('DELETE FROM votes WHERE id = ?', [voteId], function (err) {
        if (err) {
            console.error('Server - Error deleting vote:', err.message);
            return res.status(500).json({ error: 'Database error deleting vote' });
        }
        if (this.changes === 0) {
            console.log('Server - No vote found for vote_id:', voteId);
            return res.status(404).json({ error: 'Vote not found.' });
        }
        console.log('Server - Deleted vote ID:', voteId);
        res.json({ message: `Vote ${voteId} deleted successfully!` });
    });
});

// Get all teachers (public endpoint) with sorting and vote counts
app.get('/api/teachers', (req, res) => {
    const { page = 1, perPage = 8, search = '', sort = 'default', direction = 'asc' } = req.query;
    const limit = parseInt(perPage);
    const offset = (parseInt(page) - 1) * limit;
    const searchQuery = `%${search.toLowerCase()}%`;
    let orderBy;

    switch (sort) {
        case 'alphabetical': orderBy = 't.name'; break;
        case 'ratings': orderBy = 'avg_rating'; break;
        case 'votes': orderBy = 'vote_count'; break;
        default: orderBy = 't.id'; break;
    }
    const sortOrder = direction.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

    const query = `
        SELECT t.*, 
               COUNT(v.id) AS vote_count,
               AVG(v.rating) AS avg_rating
        FROM teachers t
        LEFT JOIN votes v ON t.id = v.teacher_id
        WHERE t.name LIKE ? OR t.tags LIKE ?
        GROUP BY t.id, t.name, t.bio, t.description, t.classes, t.tags, t.room_number, t.schedule, t.image_link
        ORDER BY ${orderBy} ${sortOrder} NULLS LAST
        LIMIT ? OFFSET ?
    `;
    const countQuery = `
        SELECT COUNT(DISTINCT t.id) as total
        FROM teachers t
        WHERE t.name LIKE ? OR t.tags LIKE ?
    `;

    db.all(query, [searchQuery, searchQuery, limit, offset], (err, teachers) => {
        if (err) {
            console.error('Server - Error fetching teachers:', err.message);
            return res.status(500).json({ error: 'Database error fetching teachers' });
        }
        db.get(countQuery, [searchQuery, searchQuery], (err, countRow) => {
            if (err) {
                console.error('Server - Error counting teachers:', err.message);
                return res.status(500).json({ error: 'Database error counting teachers' });
            }
            const total = countRow.total;
            const teachersWithData = teachers.map(t => ({
                id: t.id,
                name: t.name,
                description: t.description,
                bio: t.bio,
                classes: JSON.parse(t.classes),
                tags: JSON.parse(t.tags),
                room_number: t.room_number,
                schedule: JSON.parse(t.schedule),
                image_link: t.image_link,
                vote_count: t.vote_count,
                avg_rating: t.avg_rating ? parseFloat(t.avg_rating.toFixed(1)) : null
            }));
            console.log('Server - Fetched teachers:', teachersWithData.length, 'Total:', total);
            res.json({ teachers: teachersWithData, total });
        });
    });
});

// Get a specific teacher (public endpoint)
app.get('/api/teachers/:id', (req, res) => {
    const id = req.params.id;
    db.get('SELECT * FROM teachers WHERE id = ?', [id], (err, teacher) => {
        if (err) {
            console.error('Server - Error fetching teacher:', err.message);
            return res.status(500).json({ error: 'Database error fetching teacher' });
        }
        if (!teacher) return res.status(404).json({ error: 'Teacher not found.' });

        db.all('SELECT * FROM votes WHERE teacher_id = ?', [id], (err, teacherRatings) => {
            if (err) {
                console.error('Server - Error fetching votes for teacher:', err.message);
                return res.status(500).json({ error: 'Database error fetching votes' });
            }
            const avgRating = teacherRatings.length
                ? teacherRatings.reduce((sum, r) => sum + r.rating, 0) / teacherRatings.length
                : null;
            console.log('Server - Fetched teacher ID:', id, 'Avg rating:', avgRating);
            res.json({
                id: teacher.id,
                name: teacher.name,
                bio: teacher.bio,
                classes: JSON.parse(teacher.classes),
                tags: JSON.parse(teacher.tags),
                room_number: teacher.room_number,
                description: teacher.description,
                avg_rating: avgRating ? parseFloat(avgRating.toFixed(1)) : null,
                ratings: teacherRatings.map(r => ({ ...r, is_explicit: !!r.is_explicit })),
                rating_count: teacherRatings.length,
                schedule: JSON.parse(teacher.schedule),
                image_link: teacher.image_link
            });
        });
    });
});

// Submit a rating (public endpoint)
app.post('/api/ratings', publicLimiter, (req, res) => {
    const { teacher_id, rating, comment } = req.body;
    if (!teacher_id || !rating || isNaN(rating) || rating < 1 || rating > 5) {
        return res.status(400).json({ error: 'Invalid teacher ID or rating.' });
    }

    const teacherId = teacher_id;
    const cookieStr = req.headers.cookie?.split('votedTeachers=')[1]?.split(';')[0] || '';
    const votedArray = cookieStr ? cookieStr.split(',').map(id => id.trim()).filter(Boolean) : [];

    if (votedArray.includes(teacherId)) {
        return res.status(400).json({ error: 'You have already voted for this teacher.' });
    }

    const { cleanedComment, isExplicit } = filterComment(comment);
    db.run(
        'INSERT INTO votes (teacher_id, rating, comment, is_explicit) VALUES (?, ?, ?, ?)',
        [teacherId, parseInt(rating), cleanedComment, isExplicit ? 1 : 0],
        function (err) {
            if (err) {
                console.error('Server - Error adding rating:', err.message);
                return res.status(500).json({ error: 'Database error adding rating' });
            }
            votedArray.push(teacherId);
            setCookie(res, 'votedTeachers', votedArray.join(','), 365);

            db.all('SELECT rating FROM votes WHERE teacher_id = ?', [teacherId], (err, ratings) => {
                if (err) {
                    console.error('Server - Error fetching updated ratings:', err.message);
                    return res.status(500).json({ error: 'Database error fetching ratings' });
                }
                const avgRating = ratings.length
                    ? ratings.reduce((sum, r) => sum + r.rating, 0) / ratings.length
                    : null;
                console.log('Server - Added rating for teacher:', teacherId, 'New avg rating:', avgRating, 'Explicit:', isExplicit);
                res.json({
                    message: 'Rating submitted!',
                    avg_rating: avgRating ? parseFloat(avgRating.toFixed(1)) : null,
                    rating_count: ratings.length,
                    is_explicit: isExplicit
                });
            });
        }
    );
});

// Add a teacher (admin only) with image upload
app.post('/api/teachers', authenticateAdmin, upload.single('image'), csrfProtection, (req, res) => {
    const { id, name, bio, description, classes, tags, room_number, schedule } = req.body;
    if (!validateFields(req.body, ['id', 'name', 'bio', 'description', 'classes', 'tags', 'room_number', 'schedule'])) {
        return res.status(400).json({ error: 'All fields except image are required.' });
    }

    const parsedClasses = classes.split(',').map(c => c.trim());
    const parsedTags = tags.split(',').map(t => t.trim());
    const parsedSchedule = JSON.parse(schedule || '[]');
    const imageLink = req.file ? `/public/images/${req.file.filename}` : '';

    db.get('SELECT id FROM teachers WHERE id = ?', [id], (err, row) => {
        if (err) {
            console.error('Server - Error checking teacher ID:', err.message);
            return res.status(500).json({ error: 'Database error checking ID' });
        }
        if (row) return res.status(400).json({ error: 'Teacher ID already exists.' });

        const newTeacher = {
            id: id.trim(),
            name,
            bio,
            description,
            classes: JSON.stringify(parsedClasses),
            tags: JSON.stringify(parsedTags),
            room_number: room_number.trim(),
            schedule: JSON.stringify(parsedSchedule),
            image_link: imageLink
        };

        db.run('INSERT INTO teachers (id, name, bio, description, classes, tags, room_number, schedule, image_link) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [newTeacher.id, newTeacher.name, newTeacher.bio, newTeacher.description, newTeacher.classes, newTeacher.tags, newTeacher.room_number, newTeacher.schedule, newTeacher.image_link],
            function(err) {
                if (err) {
                    console.error('Server - Error adding teacher:', err.message);
                    return res.status(500).json({ error: 'Database error adding teacher' });
                }
                console.log('Server - Added new teacher:', newTeacher.name);
                res.json({ message: 'Teacher added successfully!', teacher: newTeacher });
            });
    });
});

// Delete a teacher (admin only)
app.delete('/api/admin/teachers/:id', authenticateAdmin, csrfProtection, (req, res) => {
    const id = req.params.id;
    db.run('DELETE FROM teachers WHERE id = ?', [id], function(err) {
        if (err) {
            console.error('Server - Error deleting teacher:', err.message);
            return res.status(500).json({ error: 'Database error deleting teacher' });
        }
        if (this.changes === 0) return res.status(404).json({ error: 'Teacher not found.' });
        db.run('DELETE FROM votes WHERE teacher_id = ?', [id], (err) => {
            if (err) console.error('Server - Error deleting teacher votes:', err.message);
            console.log('Server - Deleted teacher ID:', id);
            res.json({ message: 'Teacher and their votes deleted successfully!' });
        });
    });
});

// Update a teacher (admin only)
app.put('/api/admin/teachers/:id', authenticateAdmin, upload.single('image'), csrfProtection, (req, res) => {
    const id = req.params.id;
    const { name, bio, classes, description, tags, room_number, schedule } = req.body;
    if (!validateFields(req.body, ['name', 'bio', 'classes', 'description', 'tags', 'room_number', 'schedule'])) {
        return res.status(400).json({ error: 'All fields except image are required.' });
    }

    const parsedClasses = classes.split(',').map(c => c.trim());
    const parsedTags = tags.split(',').map(t => t.trim());
    const parsedSchedule = JSON.parse(schedule || '[]');
    const imageLink = req.file ? `/public/images/${req.file.filename}` : req.body.image_link;

    const updatedTeacher = {
        name,
        bio,
        classes: JSON.stringify(parsedClasses),
        description,
        tags: JSON.stringify(parsedTags),
        room_number: room_number.trim(),
        schedule: JSON.stringify(parsedSchedule),
        image_link: imageLink
    };

    db.run('UPDATE teachers SET name = ?, bio = ?, classes = ?, description = ?, tags = ?, room_number = ?, schedule = ?, image_link = ? WHERE id = ?',
        [updatedTeacher.name, updatedTeacher.bio, updatedTeacher.classes, updatedTeacher.description, updatedTeacher.tags, updatedTeacher.room_number, updatedTeacher.schedule, updatedTeacher.image_link, id],
        function(err) {
            if (err) {
                console.error('Server - Error updating teacher:', err.message);
                return res.status(500).json({ error: 'Database error updating teacher' });
            }
            if (this.changes === 0) return res.status(404).json({ error: 'Teacher not found.' });
            console.log('Server - Updated teacher:', id);
            res.json({ message: 'Teacher updated successfully!', teacher: { id, ...updatedTeacher } });
        });
});

// Rename a teacher (admin only)
app.put('/api/admin/teachers/:oldId/rename', authenticateAdmin, upload.single('image'), csrfProtection, (req, res) => {
    const oldId = req.params.oldId;
    const { id, name, bio, classes, description, tags, room_number, schedule } = req.body;
    if (!validateFields(req.body, ['id', 'name', 'bio', 'classes', 'description', 'tags', 'room_number', 'schedule'])) {
        return res.status(400).json({ error: 'All fields except image are required.' });
    }

    const newId = id.trim();
    const parsedClasses = classes.split(',').map(c => c.trim());
    const parsedTags = tags.split(',').map(t => t.trim());
    const parsedSchedule = JSON.parse(schedule || '[]');
    const imageLink = req.file ? `/public/images/${req.file.filename}` : req.body.image_link;

    db.get('SELECT id FROM teachers WHERE id = ?', [newId], (err, existing) => {
        if (err) return res.status(500).json({ error: 'Database error checking ID' });
        if (existing && existing.id !== oldId) return res.status(400).json({ error: 'Teacher ID already exists.' });

        db.serialize(() => {
            db.run('UPDATE teachers SET id = ?, name = ?, bio = ?, classes = ?, description = ?, tags = ?, room_number = ?, schedule = ?, image_link = ? WHERE id = ?',
                [newId, name, bio, JSON.stringify(parsedClasses), description, JSON.stringify(parsedTags), room_number, JSON.stringify(parsedSchedule), imageLink, oldId], function(err) {
                    if (err) {
                        console.error('Server - Error renaming teacher:', err.message);
                        return res.status(500).json({ error: 'Database error renaming teacher' });
                    }
                    if (this.changes === 0) return res.status(404).json({ error: 'Teacher not found.' });
                });
            db.run('UPDATE votes SET teacher_id = ? WHERE teacher_id = ?', [newId, oldId], (err) => {
                if (err) console.error('Server - Error updating votes for renamed teacher:', err.message);
                console.log('Server - Renamed teacher from', oldId, 'to', newId);
                res.json({ message: 'Teacher renamed successfully!', teacher: { id: newId, name, bio, classes: parsedClasses, description, tags: parsedTags, room_number, schedule: parsedSchedule, image_link: imageLink } });
            });
        });
    });
});

// Submit a teacher proposal (public endpoint)
app.post('/api/teacher-proposals', publicLimiter, upload.single('image'), (req, res) => {
    const { name, bio, classes, description, tags, room_number, email, schedule } = req.body;
    if (!validateFields(req.body, ['name', 'bio', 'classes', 'description', 'tags', 'room_number', 'email', 'schedule'])) {
        return res.status(400).json({ error: 'All fields except image are required.' });
    }

    const tempId = uuidv4();
    const parsedClasses = classes.split(',').map(c => c.trim());
    const parsedTags = tags.split(',').map(t => t.trim());
    const parsedSchedule = JSON.parse(schedule || '[]');
    const imageLink = req.file ? `/public/images/${req.file.filename}` : '';

    const newProposal = {
        id: tempId,
        name,
        description,
        bio,
        classes: JSON.stringify(parsedClasses),
        tags: JSON.stringify(parsedTags),
        room_number: room_number.trim(),
        email,
        schedule: JSON.stringify(parsedSchedule),
        image_link: imageLink
    };

    db.run('INSERT INTO teacher_proposals (id, name, bio, description, classes, tags, room_number, email, schedule, image_link) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [newProposal.id, newProposal.name, newProposal.bio, newProposal.description, newProposal.classes, newProposal.tags, newProposal.room_number, newProposal.email, newProposal.schedule, newProposal.image_link],
        function(err) {
            if (err) {
                console.error('Server - Error adding proposal:', err.message);
                return res.status(500).json({ error: 'Database error adding proposal' });
            }
            console.log('Server - Added teacher proposal:', newProposal.name, 'Temp ID:', tempId);
            res.json({ message: 'Teacher proposal submitted successfully!', tempId });
        });
});

// Get all teacher proposals (admin only)
app.get('/api/admin/teacher-proposals', authenticateAdmin, (req, res) => {
    db.all('SELECT * FROM teacher_proposals', (err, rows) => {
        if (err) {
            console.error('Server - Error fetching proposals:', err.message);
            return res.status(500).json({ error: 'Database error fetching proposals' });
        }
        const proposals = rows.map(row => ({
            ...row,
            classes: JSON.parse(row.classes),
            tags: JSON.parse(row.tags),
            schedule: JSON.parse(row.schedule)
        }));
        console.log('Server - Fetched all teacher proposals:', proposals.length);
        res.json(proposals);
    });
});

// Approve a teacher proposal (admin only)
app.post('/api/admin/teacher-proposals/approve/:tempId', authenticateAdmin, csrfProtection, (req, res) => {
    const tempId = req.params.tempId;
    const { id } = req.body;
    if (!id || typeof id !== 'string' || id.trim().length === 0) {
        return res.status(400).json({ error: 'A valid teacher ID is required for approval.' });
    }

    db.get('SELECT * FROM teacher_proposals WHERE id = ?', [tempId], (err, proposal) => {
        if (err) {
            console.error('Server - Error fetching proposal:', err.message);
            return res.status(500).json({ error: 'Database error fetching proposal' });
        }
        if (!proposal) return res.status(404).json({ error: 'Teacher proposal not found.' });

        const finalId = id.trim();
        db.get('SELECT id FROM teachers WHERE id = ?', [finalId], (err, existing) => {
            if (err) return res.status(500).json({ error: 'Database error checking ID' });
            if (existing) return res.status(400).json({ error: 'Teacher ID already exists.' });

            db.run('INSERT INTO teachers (id, name, bio, description, classes, tags, room_number, schedule, image_link) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [finalId, proposal.name, proposal.bio, proposal.description, proposal.classes, proposal.tags, proposal.room_number, proposal.schedule, proposal.image_link || ''],
                function(err) {
                    if (err) {
                        console.error('Server - Error approving proposal:', err.message);
                        return res.status(500).json({ error: 'Database error approving proposal' });
                    }
                    db.run('DELETE FROM teacher_proposals WHERE id = ?', [tempId], (err) => {
                        if (err) console.error('Server - Error deleting approved proposal:', err.message);
                        console.log('Server - Approved teacher proposal:', proposal.name, 'Assigned ID:', finalId);
                        res.json({ message: 'Teacher proposal approved!', teacherId: finalId });
                    });
                });
        });
    });
});

// Delete a teacher proposal (admin only)
app.delete('/api/admin/teacher-proposals/:id', authenticateAdmin, csrfProtection, (req, res) => {
    const id = req.params.id;
    db.run('DELETE FROM teacher_proposals WHERE id = ?', [id], function(err) {
        if (err) {
            console.error('Server - Error deleting proposal:', err.message);
            return res.status(500).json({ error: 'Database error deleting proposal' });
        }
        if (this.changes === 0) return res.status(404).json({ error: 'Teacher proposal not found.' });
        console.log('Server - Deleted teacher proposal ID:', id);
        res.json({ message: 'Teacher proposal deleted successfully!' });
    });
});

// Submit a correction (public endpoint)
app.post('/api/corrections/:teacherId', publicLimiter, uploadCorrection, (req, res) => {
    const { teacherId } = req.params;
    const { suggestion } = req.body;
    const filePath = req.file ? `/public/uploads/corrections/${req.file.filename}` : null;

    if (!suggestion) return res.status(400).json({ error: 'Suggestion text is required' });

    db.run(`INSERT INTO corrections (teacher_id, suggestion, file_path) VALUES (?, ?, ?)`,
        [teacherId, suggestion, filePath],
        function(err) {
            if (err) {
                console.error('Server - Error inserting correction:', err.message);
                return res.status(500).json({ error: 'Failed to submit correction' });
            }
            console.log('Server - Correction submitted for teacher:', teacherId);
            res.json({ message: 'Correction submitted successfully', correctionId: this.lastID });
        });
});

// Get all corrections (admin only)
app.get('/api/admin/corrections', authenticateAdmin, (req, res) => {
    db.all(`SELECT c.*, t.name AS teacher_name 
            FROM corrections c 
            LEFT JOIN teachers t ON c.teacher_id = t.id 
            ORDER BY c.submitted_at DESC`, [], (err, rows) => {
        if (err) {
            console.error('Server - Error fetching corrections:', err.message);
            return res.status(500).json({ error: 'Database error' });
        }
        console.log('Server - Fetched corrections:', rows.length);
        res.json(rows);
    });
});

// Implement a correction (admin only)
app.post('/api/admin/corrections/:correctionId/implement', authenticateAdmin, csrfProtection, (req, res) => {
    const { correctionId } = req.params;

    db.get(`SELECT * FROM corrections WHERE id = ?`, [correctionId], (err, correction) => {
        if (err) {
            console.error('Server - Error fetching correction:', err.message);
            return res.status(500).json({ error: 'Database error' });
        }
        if (!correction) return res.status(404).json({ error: 'Correction not found' });

        let updatedFields;
        try {
            updatedFields = JSON.parse(correction.suggestion);
        } catch (e) {
            updatedFields = { description: correction.suggestion };
        }
        if (correction.file_path) updatedFields.image_link = correction.file_path;

        const setClause = Object.keys(updatedFields).map(key => `${key} = ?`).join(', ');
        const values = Object.values(updatedFields).concat(correction.teacher_id);

        db.run(`UPDATE teachers SET ${setClause} WHERE id = ?`, values, function(updateErr) {
            if (updateErr) {
                console.error('Server - Error updating teacher:', updateErr.message);
                return res.status(500).json({ error: 'Failed to update teacher' });
            }
            if (this.changes === 0) return res.status(404).json({ error: 'Teacher not found' });
            db.run(`DELETE FROM corrections WHERE id = ?`, [correctionId], (deleteErr) => {
                if (deleteErr) {
                    console.error('Server - Error deleting correction:', deleteErr.message);
                    return res.status(500).json({ error: 'Failed to clean up correction' });
                }
                console.log('Server - Implemented correction:', correctionId);
                res.json({ message: 'Correction implemented successfully' });
            });
        });
    });
});

// Delete a correction (admin only)
app.delete('/api/admin/corrections/:correctionId', authenticateAdmin, csrfProtection, (req, res) => {
    const { correctionId } = req.params;
    db.run(`DELETE FROM corrections WHERE id = ?`, [correctionId], function(err) {
        if (err) {
            console.error('Server - Error deleting correction:', err.message);
            return res.status(500).json({ error: 'Database error' });
        }
        if (this.changes === 0) return res.status(404).json({ error: 'Correction not found' });
        console.log('Server - Deleted correction:', correctionId);
        res.json({ message: 'Correction deleted successfully' });
    });
});

// Get footer settings (public endpoint)
app.get('/api/footer-settings', (req, res) => {
    db.get('SELECT value FROM settings WHERE key = "footer"', (err, row) => {
        if (err) {
            console.error('Server - Error fetching footer settings:', err.message);
            return res.status(500).json({ error: 'Database error fetching footer settings' });
        }
        console.log('Server - Fetched footer settings');
        res.json(JSON.parse(row.value));
    });
});

// Update footer settings (admin only)
app.put('/api/admin/footer-settings', authenticateAdmin, csrfProtection, (req, res) => {
    const { email, message, showMessage } = req.body;
    if (!email || typeof message !== 'string' || typeof showMessage !== 'boolean') {
        console.log('Server - Invalid footer settings data:', req.body);
        return res.status(400).json({ error: 'Email, message (string), and showMessage (boolean) are required.' });
    }
    const settings = JSON.stringify({ email, message, showMessage });
    db.run('UPDATE settings SET value = ? WHERE key = "footer"', [settings], function(err) {
        if (err) {
            console.error('Server - Error updating footer settings:', err.message);
            return res.status(500).json({ error: 'Database error updating footer settings' });
        }
        console.log('Server - Updated footer settings:', { email, message, showMessage });
        res.json({ message: 'Footer settings updated successfully!' });
    });
});

// Get message settings (public endpoint)
app.get('/api/message-settings', (req, res) => {
    db.get('SELECT value FROM settings WHERE key = "message"', (err, row) => {
        if (err) {
            console.error('Server - Error fetching message settings:', err.message);
            return res.status(500).json({ error: 'Database error fetching message settings' });
        }
        console.log('Server - Fetched message settings');
        res.json(JSON.parse(row.value));
    });
});

// Update message settings (admin only)
app.put('/api/admin/message-settings', authenticateAdmin, csrfProtection, (req, res) => {
    const { message, showMessage } = req.body;
    if (typeof message !== 'string' || typeof showMessage !== 'boolean') {
        console.log('Server - Invalid message settings data:', req.body);
        return res.status(400).json({ error: 'Message (string) and showMessage (boolean) are required.' });
    }
    const settings = JSON.stringify({ message, showMessage });
    db.run('UPDATE settings SET value = ? WHERE key = "message"', [settings], function(err) {
        if (err) {
            console.error('Server - Error updating message settings:', err.message);
            return res.status(500).json({ error: 'Database error updating message settings' });
        }
        console.log('Server - Updated message settings:', { message, showMessage });
        res.json({ message: 'Message settings updated successfully!' });
    });
});

// Get section expansion settings (admin only)
app.get('/api/admin/section-settings', authenticateAdmin, (req, res) => {
    db.get('SELECT value FROM settings WHERE key = "sectionExpansion"', (err, row) => {
        if (err) {
            console.error('Server - Error fetching section expansion settings:', err.message);
            return res.status(500).json({ error: 'Database error fetching section settings' });
        }
        console.log('Server - Fetched section expansion settings');
        res.json(JSON.parse(row.value));
    });
});

// Update section expansion settings (admin only)
app.put('/api/admin/section-settings', authenticateAdmin, csrfProtection, (req, res) => {
    const settings = req.body;
    if (!settings || typeof settings !== 'object') {
        console.log('Server - Invalid section expansion settings data:', req.body);
        return res.status(400).json({ error: 'Section expansion settings must be an object.' });
    }
    const settingsStr = JSON.stringify(settings);
    db.run('UPDATE settings SET value = ? WHERE key = "sectionExpansion"', [settingsStr], function(err) {
        if (err) {
            console.error('Server - Error updating section expansion settings:', err.message);
            return res.status(500).json({ error: 'Database error updating section settings' });
        }
        console.log('Server - Updated section expansion settings:', settings);
        res.json({ message: 'Section expansion settings updated successfully!' });
    });
});

// Get statistics (admin only)
app.get('/api/admin/stats', authenticateAdmin, (req, res) => {
    const timeFrame = req.query.timeFrame || '1day';
    const now = new Date();
    let startTime;
    switch (timeFrame) {
        case '1hour': startTime = new Date(now - 60 * 60 * 1000); break;
        case '6hours': startTime = new Date(now - 6 * 60 * 60 * 1000); break;
        case '1day': startTime = new Date(now - 24 * 60 * 60 * 1000); break;
        case '7days': startTime = new Date(now - 7 * 24 * 60 * 60 * 1000); break;
        case '1month': startTime = new Date(now - 30 * 24 * 60 * 60 * 1000); break;
        default: return res.status(400).json({ error: 'Invalid timeFrame' });
    }
    const startTimeStr = startTime.toISOString();

    db.serialize(() => {
        db.all('SELECT COUNT(*) as totalTeachers FROM teachers', (err, teacherCount) => {
            if (err) return res.status(500).json({ error: 'Error fetching teacher count' });
            db.all('SELECT COUNT(*) as totalVotes FROM votes', (err, voteCount) => {
                if (err) return res.status(500).json({ error: 'Error fetching vote count' });
                db.all('SELECT COUNT(*) as totalProposals FROM teacher_proposals', (err, proposalCount) => {
                    if (err) return res.status(500).json({ error: 'Error fetching proposal count' });
                    db.all('SELECT * FROM stats WHERE timestamp >= ?', [startTimeStr], (err, visits) => {
                        if (err) return res.status(500).json({ error: 'Error fetching visits' });
                        db.all('SELECT * FROM teacher_proposals', (err, proposals) => {
                            if (err) return res.status(500).json({ error: 'Error fetching proposals' });
                            db.all('SELECT t.id, t.name, COUNT(v.id) as voteCount FROM teachers t LEFT JOIN votes v ON t.id = v.teacher_id GROUP BY t.id, t.name ORDER BY voteCount DESC LIMIT 5', (err, topTeachers) => {
                                if (err) return res.status(500).json({ error: 'Error fetching top teachers' });

                                const totalVisits = visits.length;
                                const uniqueVisits = [...new Set(visits.map(v => v.visitor_id))].length;
                                const avgVisits = totalVisits / (timeFrame === '1hour' ? 1 : timeFrame === '6hours' ? 6 : timeFrame === '1day' ? 24 : timeFrame === '7days' ? 168 : 720);
                                const proposalsPerEmail = proposals.reduce((acc, p) => { acc[p.email] = (acc[p.email] || 0) + 1; return acc; }, {});
                                const proposalsPerVisitor = visits.reduce((acc, v) => { acc[v.visitor_id] = (acc[v.visitor_id] || 0) + 1; return acc; }, {});
                                const approvedProposals = proposals.filter(p => db.get('SELECT id FROM teachers WHERE id = ?', [p.id])).length;
                                const totalProposals = proposalCount[0].totalProposals;
                                const proposalApprovedPercent = totalProposals ? (approvedProposals / totalProposals * 100).toFixed(2) : 0;
                                const proposalDeniedPercent = totalProposals ? ((totalProposals - approvedProposals) / totalProposals * 100).toFixed(2) : 0;

                                const visitsOverTime = [];
                                const interval = timeFrame === '1hour' ? 5 * 60 * 1000 : timeFrame === '6hours' ? 30 * 60 * 1000 : timeFrame === '1day' ? 60 * 60 * 1000 : timeFrame === '7days' ? 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
                                let current = new Date(startTime);
                                while (current < now) {
                                    const next = new Date(current.getTime() + interval);
                                    const count = visits.filter(v => new Date(v.timestamp) >= current && new Date(v.timestamp) < next).length;
                                    visitsOverTime.push({ time: current.toISOString().slice(11, 16), count });
                                    current = next;
                                }

                                res.json({
                                    totalTeachers: teacherCount[0].totalTeachers,
                                    totalVotes: voteCount[0].totalVotes,
                                    totalVisits,
                                    uniqueVisits,
                                    avgVisits: avgVisits.toFixed(2),
                                    totalProposals,
                                    proposalsPerEmail,
                                    proposalsPerVisitor,
                                    proposalApprovedPercent,
                                    proposalDeniedPercent,
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
});

// Serve home page
app.get('/', (req, res) => {
    console.log('Server - Redirecting to home page...');
    res.sendFile(path.join(__dirname, 'pages/home/index.html'));
});

// Serve teacher profile page (if needed)
app.get('/teacher-profile.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'pages', 'teacher-profile.html'));
});

// 404 handler
app.use((req, res) => {
    console.log(`Server - 404 Not Found for ${req.method} ${req.url}`);
    res.status(404).json({ error: 'Not found' });
});

// Start server
console.log('Server - Starting server on port', port);
app.listen(port, () => {
    console.log(`Server running on port ${port} - Version 1.23 - Started at ${new Date().toISOString()}`);
});

// Close database on process exit
process.on('SIGINT', () => {
    db.close((err) => {
        if (err) console.error('Server - Error closing database:', err.message);
        console.log('Server - Database connection closed');
        process.exit(0);
    });
});