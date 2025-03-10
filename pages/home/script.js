const express = require('express');
const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse');
const app = express();
const port = process.env.PORT || 3000;

console.log('Server - Starting initialization...');

// Serve static files with explicit paths
app.use('/public', express.static(path.join(__dirname, 'public'), { maxAge: '1d' }), (req, res, next) => {
    console.log('Server - Serving static file from public for:', req.path);
    next();
});
app.use('/pages', express.static(path.join(__dirname, 'pages'), { maxAge: '1d' })); // Serve all pages directories under /pages
app.use(express.json());

console.log('Server - Middleware configured...');

// Handle favicon.ico requests
app.get('/favicon.ico', (req, res) => {
    const faviconPath = path.join(__dirname, 'public', 'favicon.ico');
    if (fs.existsSync(faviconPath)) {
        res.sendFile(faviconPath);
    } else {
        res.status(204).end(); // No Content
    }
});

// Load teachers from teachers.csv file
let teachers = [];
const teachersFilePath = path.join(__dirname, 'teachers.csv');

function loadTeachersFromFile() {
    try {
        if (fs.existsSync(teachersFilePath)) {
            const records = [];
            fs.createReadStream(teachersFilePath)
                .pipe(parse({
                    columns: true,
                    trim: true,
                    skip_empty_lines: true,
                    quote: '"',
                    escape: '\\',
                    relax_column_count: true
                }))
                .on('data', (row) => {
                    if (row.id && row.name && row.description && row.bio && row.classes && row.tags && row.room_number) {
                        const classes = row.classes.split(',').map(c => c.trim()).filter(c => c);
                        const tags = row.tags.split(',').map(t => t.trim()).filter(t => t);
                        const id = row.id.trim();
                        const roomNumber = row.room_number.trim();
                        let schedule = [];
                        try {
                            schedule = row.schedule ? JSON.parse(row.schedule) : [];
                        } catch (error) {
                            console.warn(`Server - Invalid schedule JSON for teacher ${row.name}:`, error.message);
                            schedule = [];
                        }
                        records.push({ id, name: row.name, description: row.description, bio: row.bio, classes, tags, room_number: roomNumber, schedule });
                    } else {
                        console.warn('Server - Incomplete data for teacher, skipping:', row);
                    }
                })
                .on('end', () => {
                    teachers = records.sort((a, b) => a.id.localeCompare(b.id));
                    console.log('Server - Loaded teachers from CSV with tags, room numbers, and schedules:', teachers.length);
                })
                .on('error', (error) => {
                    throw new Error(`Error parsing CSV: ${error.message}`);
                });
        } else {
            console.log('Server - teachers.csv not found, starting with empty teachers array');
            teachers = [];
        }
    } catch (error) {
        console.error('Server - Error loading teachers from CSV:', error.message);
        teachers = []; // Fallback to empty array if file fails
    }
}

loadTeachersFromFile();

// Save teachers back to CSV file after modifications
function saveTeachersToFile() {
    try {
        const headers = ['id', 'name', 'description', 'bio', 'classes', 'tags', 'room_number', 'schedule'];
        const csvContent = [
            headers.join(','),
            ...teachers.map(t => {
                const scheduleString = JSON.stringify(t.schedule).replace(/"/g, '\\"');
                return `"${t.id}","${t.name}","${t.description.replace(/,/g, ';')}","${t.bio.replace(/,/g, ';')}","${t.classes.join(',')}","${t.tags.join(',')}","${t.room_number}","${scheduleString}"`;
            })
        ].join('\n');
        fs.writeFileSync(teachersFilePath, csvContent, 'utf8');
        console.log('Server - Saved teachers to CSV');
    } catch (error) {
        console.error('Server - Error saving teachers to CSV:', error.message);
    }
}

const ratings = []; // In-memory ratings persist during runtime

// Admin credentials
const ADMIN_CREDENTIALS = { username: 'admin', password: 'password123' };

// Middleware for admin authorization
function authenticateAdmin(req, res, next) {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token || token !== 'admin-token') {
        return res.status(401).json({ error: 'Unauthorized access. Please log in as an admin.' });
    }
    next();
}

// Admin login
app.post('/api/admin/login', (req, res) => {
    console.log('Server - Admin login attempt for:', req.body.username);
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required.' });
    }
    if (username === ADMIN_CREDENTIALS.username && password === ADMIN_CREDENTIALS.password) {
        res.json({ token: 'admin-token' });
    } else {
        res.status(401).json({ error: 'Invalid credentials. Please try again.' });
    }
});

// Get all votes
app.get('/api/admin/votes', authenticateAdmin, (req, res) => {
    console.log('Server - Fetching all votes');
    res.json(ratings);
});

// Modify a vote
app.put('/api/admin/votes/:teacherId', authenticateAdmin, (req, res) => {
    const teacherId = req.params.teacherId;
    const { rating, comment } = req.body;
    if (!rating || isNaN(rating) || rating < 1 || rating > 5) {
        return res.status(400).json({ error: 'Rating must be a number between 1 and 5.' });
    }
    const voteIndex = ratings.findIndex(r => r.teacher_id === teacherId);
    if (voteIndex === -1) return res.status(404).json({ error: 'Vote not found for this teacher.' });
    ratings[voteIndex] = { teacher_id: teacherId, rating: parseInt(rating), comment: comment || '' };
    console.log('Server - Modified vote for teacher:', teacherId, 'New rating:', rating);
    res.json({ message: 'Vote modified successfully!' });
});

// Delete a vote
app.delete('/api/admin/votes/:teacherId', authenticateAdmin, (req, res) => {
    const teacherId = req.params.teacherId;
    const initialLength = ratings.length;
    const newRatings = ratings.filter(r => r.teacher_id !== teacherId);
    if (newRatings.length < initialLength) {
        ratings.length = 0;
        ratings.push(...newRatings);
        console.log('Server - Deleted vote for teacher:', teacherId);
        res.json({ message: 'Vote deleted successfully!' });
    } else {
        res.status(404).json({ error: 'No vote found for this teacher.' });
    }
});

// Get all teachers with average ratings
app.get('/api/teachers', (req, res) => {
    let teachersWithRatings = teachers.map(teacher => {
        const teacherRatings = ratings.filter(r => r.teacher_id === teacher.id);
        const avgRating = teacherRatings.length
            ? teacherRatings.reduce((sum, r) => sum + r.rating, 0) / teacherRatings.length
            : null;
        return { 
            id: teacher.id, 
            name: teacher.name, 
            description: teacher.description, 
            classes: teacher.classes, 
            tags: teacher.tags, 
            room_number: teacher.room_number, 
            avg_rating: avgRating, 
            rating_count: teacherRatings.length,
            schedule: teacher.schedule
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
        case 'default':
        default:
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

    console.log('Server - Fetched teachers:', paginatedTeachers.length, 'Total:', totalTeachers, 'Sort/Search/Page/PerPage:', { sortBy, sortDirection, searchQuery, page, perPage });
    res.json({ teachers: paginatedTeachers, total: totalTeachers });
});

// Get a single teacher by ID with ratings
app.get('/api/teachers/:id', (req, res) => {
    const id = req.params.id;
    const teacher = teachers.find(t => t.id === id);
    if (!teacher) return res.status(404).json({ error: 'Teacher not found.' });
    
    const teacherRatings = ratings.filter(r => r.teacher_id === id);
    const avgRating = teacherRatings.length
        ? teacherRatings.reduce((sum, r) => sum + r.rating, 0) / teacherRatings.length
        : null;
    console.log('Server - Fetched teacher ID:', id, 'Avg rating:', avgRating, 'Ratings count:', teacherRatings.length);
    res.json({ 
        id: teacher.id, 
        name: teacher.name, 
        bio: teacher.bio, 
        classes: teacher.classes, 
        tags: teacher.tags, 
        room_number: teacher.room_number, 
        avg_rating: avgRating, 
        ratings: teacherRatings,
        rating_count: teacherRatings.length,
        schedule: teacher.schedule
    });
});

// Submit a rating
app.post('/api/ratings', (req, res) => {
    const { teacher_id, rating, comment } = req.body;
    if (!teacher_id || !rating || isNaN(rating) || rating < 1 || rating > 5) {
        return res.status(400).json({ error: 'Invalid teacher ID or rating. Rating must be a number between 1 and 5.' });
    }

    const teacherId = teacher_id;
    const cookieStr = req.headers.cookie?.split('votedTeachers=')[1]?.split(';')[0] || '';
    const votedArray = cookieStr ? cookieStr.split(',').map(id => id.trim()).filter(Boolean) : [];

    if (votedArray.includes(teacherId)) {
        res.status(400).json({ error: 'You have already voted for this teacher.' });
        return;
    }

    ratings.push({ teacher_id: teacherId, rating: parseInt(rating), comment: comment || '' });
    votedArray.push(teacherId);
    setCookie(res, 'votedTeachers', votedArray.join(','), 365);
    console.log('Server - Added rating for teacher:', teacherId, 'Rating:', { rating, comment });
    res.json({ message: 'Rating submitted!' });
});

// Add a new teacher
app.post('/api/teachers', authenticateAdmin, (req, res) => {
    const { name, bio, classes, description, id, tags, room_number, schedule } = req.body;
    if (!name || !bio || !classes || !Array.isArray(classes) || !description || !id || !tags || !Array.isArray(tags) || !room_number || !schedule || !Array.isArray(schedule)) {
        return res.status(400).json({ error: 'Name, bio, classes (as an array), description, ID (string), tags (as an array), room number, and schedule (as an array of objects) are required.' });
    }
    const newTeacher = { 
        id: id.trim(), 
        name, 
        description, 
        bio, 
        classes, 
        tags: tags.map(t => t.trim()).filter(t => t), 
        room_number: room_number.trim(),
        schedule: schedule // Now an array of objects
    };
    teachers.push(newTeacher);
    saveTeachersToFile();
    console.log('Server - Added new teacher:', newTeacher.name, 'ID:', newTeacher.id, 'Tags:', newTeacher.tags, 'Room:', newTeacher.room_number, 'Schedule:', newTeacher.schedule);
    res.json(newTeacher);
});

// Delete a teacher and their votes
app.delete('/api/admin/teachers/:id', authenticateAdmin, (req, res) => {
    const id = req.params.id;
    const initialTeacherLength = teachers.length;
    const newTeachers = teachers.filter(t => t.id !== id);
    if (newTeachers.length < initialTeacherLength) {
        teachers.length = 0;
        teachers.push(...newTeachers);
        const newRatings = ratings.filter(r => r.teacher_id !== id);
        ratings.length = 0;
        ratings.push(...newRatings);
        saveTeachersToFile();
        console.log('Server - Deleted teacher ID:', id, 'Teachers remaining:', teachers.length);
        res.json({ message: 'Teacher and their votes deleted successfully!' });
    } else {
        res.status(404).json({ error: 'Teacher not found.' });
    }
});

app.get('/', (req, res) => {
    console.log('Server - Redirecting to home page...');
    res.sendFile(path.join(__dirname, 'pages/home/index.html'));
});

console.log('Server - Starting server on port', port);
app.listen(port, () => {
    console.log(`Server running on port ${port} - Version 1.15 - Started at ${new Date().toISOString()}`);
});

// Helper function to set cookies
function setCookie(res, name, value, days) {
    const date = new Date();
    date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
    res.setHeader('Set-Cookie', `${name}=${value}; Expires=${date.toUTCString()}; Path=/; SameSite=Strict`);
}