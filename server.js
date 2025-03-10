const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
require('dotenv').config();
const cookieParser = require('cookie-parser');
const app = express();
const port = process.env.PORT || 3000;

console.log('Server - Starting initialization...');

app.use('/public', express.static(path.join(__dirname, 'public'), { maxAge: '1d' }), (req, res, next) => {
    console.log('Server - Serving static file from public for:', req.path);
    next();
});
app.use('/pages', express.static(path.join(__dirname, 'pages'), { maxAge: '1d' }));
app.use(express.json());
app.use(cookieParser());

console.log('Server - Middleware configured...');

// SQLite Database Setup
const db = new sqlite3.Database('./database.sqlite', (err) => {
    if (err) {
        console.error('Server - Database connection error:', err.message);
    } else {
        console.log('Server - Connected to SQLite database');
    }
});

// Create tables if they don’t exist
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
        )`);
    db.run(`
        CREATE TABLE IF NOT EXISTS votes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            teacher_id TEXT NOT NULL,
            rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
            comment TEXT,
            FOREIGN KEY (teacher_id) REFERENCES teachers(id)
        )`);
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
        )`);
    db.run(`
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        )`);
    // Insert default settings if not present
    db.run(`INSERT OR IGNORE INTO settings (key, value) VALUES ('footer', ?)`, [
        JSON.stringify({ email: 'admin@example.com', message: 'Welcome to Rate Your Teachers!', showMessage: true })
    ]);
    db.run(`INSERT OR IGNORE INTO settings (key, value) VALUES ('message', ?)`, [
        JSON.stringify({ message: 'Welcome!', showMessage: false })
    ]);
});

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

const ADMIN_CREDENTIALS = {
    username: process.env.ADMIN_USERNAME || 'admin',
    password: process.env.ADMIN_PASSWORD || 'password123'
};

function authenticateAdmin(req, res, next) {
    const token = req.cookies.adminToken;
    if (!token || token !== 'admin-token') {
        console.log('Server - Authentication failed for:', req.path);
        return res.status(401).json({ error: 'Unauthorized access. Please log in as an admin.' });
    }
    next();
}

function setCookie(res, name, value, days) {
    const date = new Date();
    date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
    res.setHeader('Set-Cookie', `${name}=${value}; Expires=${date.toUTCString()}; Path=/; SameSite=Strict`);
}

app.post('/api/admin/login', (req, res) => {
    console.log('Server - Admin login attempt for:', req.body.username);
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required.' });
    }
    if (username === ADMIN_CREDENTIALS.username && password === ADMIN_CREDENTIALS.password) {
        setCookie(res, 'adminToken', 'admin-token', 1);
        res.json({ message: 'Logged in successfully' });
    } else {
        res.status(401).json({ error: 'Invalid credentials. Please try again.' });
    }
});

app.get('/api/admin/votes', authenticateAdmin, (req, res) => {
    db.all('SELECT * FROM votes', (err, rows) => {
        if (err) {
            console.error('Server - Error fetching votes:', err.message);
            return res.status(500).json({ error: 'Database error' });
        }
        console.log('Server - Fetched all votes:', rows.length);
        res.json(rows);
    });
});

app.put('/api/admin/votes/:teacherId', authenticateAdmin, (req, res) => {
    const teacherId = req.params.teacherId;
    const { rating, comment } = req.body;
    if (!rating || isNaN(rating) || rating < 1 || rating > 5) {
        return res.status(400).json({ error: 'Rating must be a number between 1 and 5.' });
    }
    db.run('UPDATE votes SET rating = ?, comment = ? WHERE teacher_id = ?', [parseInt(rating), comment || '', teacherId], (err) => {
        if (err) {
            console.error('Server - Error updating vote:', err.message);
            return res.status(500).json({ error: 'Database error' });
        }
        if (this.changes === 0) return res.status(404).json({ error: 'Vote not found for this teacher.' });
        console.log('Server - Modified vote for teacher:', teacherId, 'New rating:', rating);
        res.json({ message: 'Vote modified successfully!' });
    });
});

app.delete('/api/admin/votes/:teacherId', authenticateAdmin, (req, res) => {
    const teacherId = req.params.teacherId;
    db.run('DELETE FROM votes WHERE teacher_id = ?', [teacherId], (err) => {
        if (err) {
            console.error('Server - Error deleting vote:', err.message);
            return res.status(500).json({ error: 'Database error' });
        }
        if (this.changes === 0) return res.status(404).json({ error: 'No vote found for this teacher.' });
        console.log('Server - Deleted vote for teacher:', teacherId);
        res.json({ message: 'Vote deleted successfully!' });
    });
});

app.get('/api/teachers', (req, res) => {
    db.all('SELECT * FROM teachers', (err, teachers) => {
        if (err) {
            console.error('Server - Error fetching teachers:', err.message);
            return res.status(500).json({ error: 'Database error' });
        }
        db.all('SELECT teacher_id, rating FROM votes', (err, votes) => {
            if (err) {
                console.error('Server - Error fetching votes for teachers:', err.message);
                return res.status(500).json({ error: 'Database error' });
            }
            let teachersWithRatings = teachers.map(teacher => {
                const teacherRatings = votes.filter(v => v.teacher_id === teacher.id);
                const avgRating = teacherRatings.length
                    ? teacherRatings.reduce((sum, r) => sum + r.rating, 0) / teacherRatings.length
                    : null;
                return {
                    id: teacher.id,
                    name: teacher.name,
                    description: teacher.description,
                    classes: JSON.parse(teacher.classes),
                    tags: JSON.parse(teacher.tags),
                    room_number: teacher.room_number,
                    avg_rating: avgRating,
                    rating_count: teacherRatings.length,
                    schedule: JSON.parse(teacher.schedule),
                    image_link: teacher.image_link
                };
            });

            const sortBy = req.query.sort || 'default';
            const sortDirection = req.query.direction || 'asc';
            switch (sortBy) {
                case 'alphabetical':
                    teachersWithRatings.sort((a, b) =>
                        sortDirection === 'asc'
                            ? a.name.localeCompare(b.name)
                            : b.name.localeCompare(a.name)
                    );
                    break;
                case 'ratings':
                    teachersWithRatings.sort((a, b) =>
                        sortDirection === 'asc'
                            ? (a.avg_rating || 0) - (b.avg_rating || 0)
                            : (b.avg_rating || 0) - (a.avg_rating || 0)
                    );
                    break;
            }

            const searchQuery = req.query.search || '';
            if (searchQuery) {
                teachersWithRatings = teachersWithRatings.filter(t => {
                    const nameMatch = t.name.toLowerCase().includes(searchQuery.toLowerCase());
                    const tagMatch = t.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()));
                    return nameMatch || tagMatch;
                });
            }

            const page = parseInt(req.query.page) || 1;
            const perPage = parseInt(req.query.perPage) || 8;
            const startIndex = (page - 1) * perPage;
            const endIndex = startIndex + perPage;
            const paginatedTeachers = teachersWithRatings.slice(startIndex, endIndex);
            const totalTeachers = teachersWithRatings.length;

            console.log('Server - Fetched teachers:', paginatedTeachers.length, 'Total:', totalTeachers);
            res.json({ teachers: paginatedTeachers, total: totalTeachers });
        });
    });
});

app.get('/api/teachers/:id', (req, res) => {
    const id = req.params.id;
    db.get('SELECT * FROM teachers WHERE id = ?', [id], (err, teacher) => {
        if (err) {
            console.error('Server - Error fetching teacher:', err.message);
            return res.status(500).json({ error: 'Database error' });
        }
        if (!teacher) return res.status(404).json({ error: 'Teacher not found.' });

        db.all('SELECT * FROM votes WHERE teacher_id = ?', [id], (err, teacherRatings) => {
            if (err) {
                console.error('Server - Error fetching votes for teacher:', err.message);
                return res.status(500).json({ error: 'Database error' });
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
                avg_rating: avgRating,
                ratings: teacherRatings,
                rating_count: teacherRatings.length,
                schedule: JSON.parse(teacher.schedule),
                image_link: teacher.image_link
            });
        });
    });
});

app.post('/api/ratings', (req, res) => {
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

    db.run('INSERT INTO votes (teacher_id, rating, comment) VALUES (?, ?, ?)', [teacherId, parseInt(rating), comment || ''], (err) => {
        if (err) {
            console.error('Server - Error adding rating:', err.message);
            return res.status(500).json({ error: 'Database error' });
        }
        votedArray.push(teacherId);
        setCookie(res, 'votedTeachers', votedArray.join(','), 365);
        console.log('Server - Added rating for teacher:', teacherId);
        res.json({ message: 'Rating submitted!' });
    });
});

app.post('/api/teachers', authenticateAdmin, (req, res) => {
    const { name, bio, classes, description, id, tags, room_number, schedule, image_link } = req.body;
    if (!name || !bio || !classes || !Array.isArray(classes) || !description || !id || !tags || !Array.isArray(tags) || !room_number || !schedule || !Array.isArray(schedule)) {
        return res.status(400).json({ error: 'All fields except image_link are required.' });
    }
    const newTeacher = {
        id: id.trim(),
        name,
        description,
        bio,
        classes: JSON.stringify(classes),
        tags: JSON.stringify(tags.map(t => t.trim()).filter(t => t)),
        room_number: room_number.trim(),
        schedule: JSON.stringify(schedule),
        image_link: image_link || ''
    };
    db.run('INSERT INTO teachers (id, name, bio, description, classes, tags, room_number, schedule, image_link) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [newTeacher.id, newTeacher.name, newTeacher.bio, newTeacher.description, newTeacher.classes, newTeacher.tags, newTeacher.room_number, newTeacher.schedule, newTeacher.image_link],
        (err) => {
            if (err) {
                console.error('Server - Error adding teacher:', err.message);
                return res.status(500).json({ error: 'Database error' });
            }
            console.log('Server - Added new teacher:', newTeacher.name);
            res.json(newTeacher);
        });
});

app.delete('/api/admin/teachers/:id', authenticateAdmin, (req, res) => {
    const id = req.params.id;
    db.run('DELETE FROM teachers WHERE id = ?', [id], (err) => {
        if (err) {
            console.error('Server - Error deleting teacher:', err.message);
            return res.status(500).json({ error: 'Database error' });
        }
        if (this.changes === 0) return res.status(404).json({ error: 'Teacher not found.' });
        db.run('DELETE FROM votes WHERE teacher_id = ?', [id], (err) => {
            if (err) console.error('Server - Error deleting teacher votes:', err.message);
            console.log('Server - Deleted teacher ID:', id);
            res.json({ message: 'Teacher and their votes deleted successfully!' });
        });
    });
});

app.put('/api/admin/teachers/:id', authenticateAdmin, (req, res) => {
    const id = req.params.id;
    const { name, bio, classes, description, tags, room_number, schedule, image_link } = req.body;
    if (!name || !bio || !classes || !Array.isArray(classes) || classes.length === 0 ||
        !description || !tags || !Array.isArray(tags) || tags.length === 0 ||
        !room_number || !schedule || !Array.isArray(schedule) ||
        schedule.some(s => !s.block || !s.subject || !s.grade)) {
        return res.status(400).json({
            error: 'All fields except image_link (name, bio, classes, description, tags, room_number, schedule) are required and must be in the correct format.'
        });
    }
    const updatedTeacher = {
        name,
        bio,
        classes: JSON.stringify(classes),
        description,
        tags: JSON.stringify(tags.map(t => t.trim()).filter(t => t)),
        room_number: room_number.trim(),
        schedule: JSON.stringify(schedule),
        image_link: image_link || ''
    };
    db.run('UPDATE teachers SET name = ?, bio = ?, classes = ?, description = ?, tags = ?, room_number = ?, schedule = ?, image_link = ? WHERE id = ?',
        [updatedTeacher.name, updatedTeacher.bio, updatedTeacher.classes, updatedTeacher.description, updatedTeacher.tags, updatedTeacher.room_number, updatedTeacher.schedule, updatedTeacher.image_link, id],
        (err) => {
            if (err) {
                console.error('Server - Error updating teacher:', err.message);
                return res.status(500).json({ error: 'Database error' });
            }
            if (this.changes === 0) return res.status(404).json({ error: 'Teacher not found.' });
            console.log('Server - Updated teacher:', id);
            res.json({ message: 'Teacher updated successfully!', teacher: { id, ...updatedTeacher } });
        });
});

app.post('/api/teacher-proposals', (req, res) => {
    const { id, name, bio, classes, description, tags, room_number, email, schedule, image_link } = req.body;
    if (!id || !name || !bio || !classes || !Array.isArray(classes) || !description || !tags || !Array.isArray(tags) || !room_number || !email || !schedule || !Array.isArray(schedule)) {
        return res.status(400).json({ error: 'All fields except image_link are required.' });
    }
    const newProposal = {
        id: id.trim(),
        name,
        description,
        bio,
        classes: JSON.stringify(classes),
        tags: JSON.stringify(tags.map(t => t.trim()).filter(t => t)),
        room_number: room_number.trim(),
        email,
        schedule: JSON.stringify(schedule),
        image_link: image_link || ''
    };
    db.run('INSERT INTO teacher_proposals (id, name, bio, description, classes, tags, room_number, email, schedule, image_link) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [newProposal.id, newProposal.name, newProposal.bio, newProposal.description, newProposal.classes, newProposal.tags, newProposal.room_number, newProposal.email, newProposal.schedule, newProposal.image_link],
        (err) => {
            if (err) {
                console.error('Server - Error adding proposal:', err.message);
                return res.status(500).json({ error: 'Database error' });
            }
            console.log('Server - Added teacher proposal:', newProposal.name);
            res.json({ message: 'Teacher proposal submitted successfully!' });
        });
});

app.get('/api/admin/teacher-proposals', authenticateAdmin, (req, res) => {
    db.all('SELECT * FROM teacher_proposals', (err, rows) => {
        if (err) {
            console.error('Server - Error fetching proposals:', err.message);
            return res.status(500).json({ error: 'Database error' });
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

app.post('/api/admin/teacher-proposals/approve/:id', authenticateAdmin, (req, res) => {
    const id = req.params.id;
    db.get('SELECT * FROM teacher_proposals WHERE id = ?', [id], (err, proposal) => {
        if (err) {
            console.error('Server - Error fetching proposal:', err.message);
            return res.status(500).json({ error: 'Database ошибка' });
        }
        if (!proposal) return res.status(404).json({ error: 'Teacher proposal not found.' });

        db.run('INSERT INTO teachers (id, name, bio, description, classes, tags, room_number, schedule, image_link) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [proposal.id, proposal.name, proposal.bio, proposal.description, proposal.classes, proposal.tags, proposal.room_number, proposal.schedule, proposal.image_link || ''],
            (err) => {
                if (err) {
                    console.error('Server - Error approving proposal:', err.message);
                    return res.status(500).json({ error: 'Database error' });
                }
                db.run('DELETE FROM teacher_proposals WHERE id = ?', [id], (err) => {
                    if (err) console.error('Server - Error deleting approved proposal:', err.message);
                    console.log('Server - Approved teacher proposal:', proposal.name);
                    res.json({ message: 'Teacher proposal approved!' });
                });
            });
    });
});

app.delete('/api/admin/teacher-proposals/:id', authenticateAdmin, (req, res) => {
    const id = req.params.id;
    db.run('DELETE FROM teacher_proposals WHERE id = ?', [id], (err) => {
        if (err) {
            console.error('Server - Error deleting proposal:', err.message);
            return res.status(500).json({ error: 'Database error' });
        }
        if (this.changes === 0) return res.status(404).json({ error: 'Teacher proposal not found.' });
        console.log('Server - Deleted teacher proposal ID:', id);
        res.json({ message: 'Teacher proposal deleted successfully!' });
    });
});

app.get('/api/footer-settings', (req, res) => {
    db.get('SELECT value FROM settings WHERE key = "footer"', (err, row) => {
        if (err) {
            console.error('Server - Error fetching footer settings:', err.message);
            return res.status(500).json({ error: 'Database error' });
        }
        console.log('Server - Fetched footer settings');
        res.json(JSON.parse(row.value));
    });
});

app.put('/api/admin/footer-settings', authenticateAdmin, (req, res) => {
    const { email, message, showMessage } = req.body;
    if (!email || typeof message !== 'string' || typeof showMessage !== 'boolean') {
        console.log('Server - Invalid footer settings data:', req.body);
        return res.status(400).json({ error: 'Email, message (string), and showMessage (boolean) are required.' });
    }
    const settings = JSON.stringify({ email, message, showMessage });
    db.run('UPDATE settings SET value = ? WHERE key = "footer"', [settings], (err) => {
        if (err) {
            console.error('Server - Error updating footer settings:', err.message);
            return res.status(500).json({ error: 'Database error' });
        }
        console.log('Server - Updated footer settings:', { email, message, showMessage });
        res.json({ message: 'Footer settings updated successfully!' });
    });
});

app.get('/api/message-settings', (req, res) => {
    db.get('SELECT value FROM settings WHERE key = "message"', (err, row) => {
        if (err) {
            console.error('Server - Error fetching message settings:', err.message);
            return res.status(500).json({ error: 'Database error' });
        }
        console.log('Server - Fetched message settings');
        res.json(JSON.parse(row.value));
    });
});

app.put('/api/admin/message-settings', authenticateAdmin, (req, res) => {
    const { message, showMessage } = req.body;
    if (typeof message !== 'string' || typeof showMessage !== 'boolean') {
        console.log('Server - Invalid message settings data:', req.body);
        return res.status(400).json({ error: 'Message (string) and showMessage (boolean) are required.' });
    }
    const settings = JSON.stringify({ message, showMessage });
    db.run('UPDATE settings SET value = ? WHERE key = "message"', [settings], (err) => {
        if (err) {
            console.error('Server - Error updating message settings:', err.message);
            return res.status(500).json({ error: 'Database error' });
        }
        console.log('Server - Updated message settings:', { message, showMessage });
        res.json({ message: 'Message settings updated successfully!' });
    });
});

app.get('/', (req, res) => {
    console.log('Server - Redirecting to home page...');
    res.sendFile(path.join(__dirname, 'pages/home/index.html'));
});

app.use((req, res) => {
    console.log(`Server - 404 Not Found for ${req.method} ${req.url}`);
    res.status(404).json({ error: 'Not found' });
});

console.log('Server - Starting server on port', port);
app.listen(port, () => {
    console.log(`Server running on port ${port} - Version 1.20 - Started at ${new Date().toISOString()}`);
});

// Close database on process exit
process.on('SIGINT', () => {
    db.close((err) => {
        if (err) console.error('Server - Error closing database:', err.message);
        console.log('Server - Database connection closed');
        process.exit(0);
    });
});