const express = require('express');
const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse');
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

app.get('/favicon.ico', (req, res) => {
    const faviconPath = path.join(__dirname, 'public', 'favicon.ico');
    if (fs.existsSync(faviconPath)) {
        console.log('Server - Serving favicon.ico');
        res.sendFile(faviconPath);
    } else {
        console.log('Server - No favicon.ico found, returning 204');
        res.status(204).end();
    }
});

let teachers = [];
const teachersFilePath = path.join(__dirname, 'teachers.csv');
let teacherProposals = [];
const teacherProposalsFilePath = path.join(__dirname, 'teacher-proposals.csv');
let footerSettings = { email: 'admin@example.com', message: 'Welcome to Rate Your Teachers!', showMessage: true };
const footerSettingsFilePath = path.join(__dirname, 'footer-settings.json');

function loadTeachersFromFile() {
    try {
        if (fs.existsSync(teachersFilePath)) {
            const records = [];
            fs.createReadStream(teachersFilePath)
                .pipe(parse({ columns: true, trim: true, skip_empty_lines: true, quote: '"', escape: '\\', relax_column_count: true }))
                .on('data', (row) => {
                    if (row.id && row.name && row.description && row.bio && row.classes && row.tags && row.room_number) {
                        const classes = row.classes.split(',').map(c => c.trim()).filter(c => c);
                        const tags = row.tags.split(',').map(t => t.trim()).filter(t => t);
                        const id = row.id.trim();
                        const roomNumber = row.room_number.trim();
                        const imageLink = row.image_link || ''; // Optional image link
                        let schedule = [];
                        try {
                            schedule = row.schedule ? JSON.parse(row.schedule) : [];
                        } catch (error) {
                            console.warn(`Server - Invalid schedule JSON for teacher ${row.name}:`, error.message);
                            schedule = [];
                        }
                        records.push({ id, name: row.name, description: row.description, bio: row.bio, classes, tags, room_number: roomNumber, schedule, image_link: imageLink });
                    } else {
                        console.warn('Server - Incomplete data for teacher, skipping:', row);
                    }
                })
                .on('end', () => {
                    teachers = records.sort((a, b) => a.id.localeCompare(b.id));
                    console.log('Server - Loaded teachers from CSV:', teachers.length);
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
        teachers = [];
    }
}

function loadTeacherProposalsFromFile() {
    try {
        if (fs.existsSync(teacherProposalsFilePath)) {
            const records = [];
            fs.createReadStream(teacherProposalsFilePath)
                .pipe(parse({ columns: true, trim: true, skip_empty_lines: true, quote: '"', escape: '\\', relax_column_count: true }))
                .on('data', (row) => {
                    if (row.id && row.name && row.description && row.bio && row.classes && row.tags && row.room_number && row.email) {
                        const classes = row.classes.split(',').map(c => c.trim()).filter(c => c);
                        const tags = row.tags.split(',').map(t => t.trim()).filter(t => t);
                        const id = row.id.trim();
                        const roomNumber = row.room_number.trim();
                        const imageLink = row.image_link || ''; // Optional image link
                        let schedule = [];
                        try {
                            schedule = row.schedule ? JSON.parse(row.schedule) : [];
                        } catch (error) {
                            console.warn(`Server - Invalid schedule JSON for proposal ${row.name}:`, error.message);
                            schedule = [];
                        }
                        records.push({ id, name: row.name, description: row.description, bio: row.bio, classes, tags, room_number: roomNumber, email: row.email, schedule, image_link: imageLink });
                    } else {
                        console.warn('Server - Incomplete data for teacher proposal, skipping:', row);
                    }
                })
                .on('end', () => {
                    teacherProposals = records.sort((a, b) => a.id.localeCompare(b.id));
                    console.log('Server - Loaded teacher proposals from CSV:', teacherProposals.length);
                })
                .on('error', (error) => {
                    throw new Error(`Error parsing teacher proposals CSV: ${error.message}`);
                });
        } else {
            console.log('Server - teacher-proposals.csv not found, starting with empty proposals array');
            teacherProposals = [];
        }
    } catch (error) {
        console.error('Server - Error loading teacher proposals from CSV:', error.message);
        teacherProposals = [];
    }
}

function loadFooterSettingsFromFile() {
    try {
        if (fs.existsSync(footerSettingsFilePath)) {
            footerSettings = JSON.parse(fs.readFileSync(footerSettingsFilePath, 'utf8'));
            console.log('Server - Loaded footer settings:', footerSettings);
        } else {
            saveFooterSettingsToFile();
            console.log('Server - No footer settings file found, using defaults');
        }
    } catch (error) {
        console.error('Server - Error loading footer settings:', error.message);
        footerSettings = { email: 'admin@example.com', message: 'Welcome to Rate Your Teachers!', showMessage: true };
        saveFooterSettingsToFile();
    }
}

function saveTeachersToFile() {
    try {
        const headers = ['id', 'name', 'description', 'bio', 'classes', 'tags', 'room_number', 'schedule', 'image_link'];
        const csvContent = [
            headers.join(','),
            ...teachers.map(t => {
                const scheduleString = JSON.stringify(t.schedule).replace(/"/g, '\\"');
                return `"${t.id}","${t.name}","${t.description.replace(/,/g, ';')}","${t.bio.replace(/,/g, ';')}","${t.classes.join(',')}","${t.tags.join(',')}","${t.room_number}","${scheduleString}","${t.image_link || ''}"`;
            })
        ].join('\n');
        fs.writeFileSync(teachersFilePath, csvContent, 'utf8');
        console.log('Server - Saved teachers to CSV');
    } catch (error) {
        console.error('Server - Error saving teachers to CSV:', error.message);
    }
}

function saveTeacherProposalsToFile() {
    try {
        const headers = ['id', 'name', 'description', 'bio', 'classes', 'tags', 'room_number', 'email', 'schedule', 'image_link'];
        const csvContent = [
            headers.join(','),
            ...teacherProposals.map(t => {
                const scheduleString = JSON.stringify(t.schedule).replace(/"/g, '\\"');
                return `"${t.id}","${t.name}","${t.description.replace(/,/g, ';')}","${t.bio.replace(/,/g, ';')}","${t.classes.join(',')}","${t.tags.join(',')}","${t.room_number}","${t.email}","${scheduleString}","${t.image_link || ''}"`;
            })
        ].join('\n');
        fs.writeFileSync(teacherProposalsFilePath, csvContent, 'utf8');
        console.log('Server - Saved teacher proposals to CSV');
    } catch (error) {
        console.error('Server - Error saving teacher proposals to CSV:', error.message);
    }
}

function saveFooterSettingsToFile() {
    try {
        fs.writeFileSync(footerSettingsFilePath, JSON.stringify(footerSettings, null, 2), 'utf8');
        console.log('Server - Saved footer settings to JSON:', footerSettings);
    } catch (error) {
        console.error('Server - Error saving footer settings to JSON:', error.message);
        throw error; // Re-throw to catch in endpoint
    }
}

loadTeachersFromFile();
loadTeacherProposalsFromFile();
loadFooterSettingsFromFile();

const ratings = [];

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
    console.log('Server - Fetching all votes');
    res.json(ratings);
});

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
            schedule: teacher.schedule,
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

    console.log('Server - Fetched teachers:', paginatedTeachers.length, 'Total:', totalTeachers);
    res.json({ teachers: paginatedTeachers, total: totalTeachers });
});

app.get('/api/teachers/:id', (req, res) => {
    const id = req.params.id;
    const teacher = teachers.find(t => t.id === id);
    if (!teacher) return res.status(404).json({ error: 'Teacher not found.' });
    
    const teacherRatings = ratings.filter(r => r.teacher_id === id);
    const avgRating = teacherRatings.length
        ? teacherRatings.reduce((sum, r) => sum + r.rating, 0) / teacherRatings.length
        : null;
    console.log('Server - Fetched teacher ID:', id, 'Avg rating:', avgRating);
    res.json({ 
        id: teacher.id, 
        name: teacher.name, 
        bio: teacher.bio, 
        classes: teacher.classes, 
        tags: teacher.tags, 
        room_number: teacher.room_number, 
        description: teacher.description,
        avg_rating: avgRating, 
        ratings: teacherRatings,
        rating_count: teacherRatings.length,
        schedule: teacher.schedule,
        image_link: teacher.image_link
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
        res.status(400).json({ error: 'You have already voted for this teacher.' });
        return;
    }

    ratings.push({ teacher_id: teacherId, rating: parseInt(rating), comment: comment || '' });
    votedArray.push(teacherId);
    setCookie(res, 'votedTeachers', votedArray.join(','), 365);
    console.log('Server - Added rating for teacher:', teacherId);
    res.json({ message: 'Rating submitted!' });
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
        classes, 
        tags: tags.map(t => t.trim()).filter(t => t), 
        room_number: room_number.trim(),
        schedule,
        image_link: image_link || ''
    };
    teachers.push(newTeacher);
    saveTeachersToFile();
    console.log('Server - Added new teacher:', newTeacher.name);
    res.json(newTeacher);
});

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
        console.log('Server - Deleted teacher ID:', id);
        res.json({ message: 'Teacher and their votes deleted successfully!' });
    } else {
        res.status(404).json({ error: 'Teacher not found.' });
    }
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

    const teacherIndex = teachers.findIndex(t => t.id === id);
    if (teacherIndex === -1) {
        return res.status(404).json({ error: 'Teacher not found.' });
    }

    teachers[teacherIndex] = {
        id,
        name,
        bio,
        classes,
        description,
        tags: tags.map(t => t.trim()).filter(t => t),
        room_number: room_number.trim(),
        schedule,
        image_link: image_link || ''
    };

    saveTeachersToFile();
    console.log('Server - Updated teacher:', id);
    res.json({ message: 'Teacher updated successfully!', teacher: teachers[teacherIndex] });
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
        classes,
        tags: tags.map(t => t.trim()).filter(t => t),
        room_number: room_number.trim(),
        email,
        schedule,
        image_link: image_link || ''
    };

    teacherProposals.push(newProposal);
    saveTeacherProposalsToFile();
    console.log('Server - Added teacher proposal:', newProposal.name);
    res.json({ message: 'Teacher proposal submitted successfully!' });
});

app.get('/api/admin/teacher-proposals', authenticateAdmin, (req, res) => {
    console.log('Server - Fetching all teacher proposals');
    res.json(teacherProposals);
});

app.post('/api/admin/teacher-proposals/approve/:id', authenticateAdmin, (req, res) => {
    const id = req.params.id;
    const proposalIndex = teacherProposals.findIndex(p => p.id === id);
    if (proposalIndex === -1) {
        return res.status(404).json({ error: 'Teacher proposal not found.' });
    }

    const approvedTeacher = teacherProposals[proposalIndex];
    teachers.push({
        id: approvedTeacher.id,
        name: approvedTeacher.name,
        description: approvedTeacher.description,
        bio: approvedTeacher.bio,
        classes: approvedTeacher.classes,
        tags: approvedTeacher.tags,
        room_number: approvedTeacher.room_number,
        schedule: approvedTeacher.schedule,
        image_link: approvedTeacher.image_link || ''
    });
    teacherProposals.splice(proposalIndex, 1);
    saveTeachersToFile();
    saveTeacherProposalsToFile();
    console.log('Server - Approved teacher proposal:', approvedTeacher.name);
    res.json({ message: 'Teacher proposal approved!' });
});

app.delete('/api/admin/teacher-proposals/:id', authenticateAdmin, (req, res) => {
    const id = req.params.id;
    const initialLength = teacherProposals.length;
    const newProposals = teacherProposals.filter(p => p.id !== id);
    if (newProposals.length < initialLength) {
        teacherProposals.length = 0;
        teacherProposals.push(...newProposals);
        saveTeacherProposalsToFile();
        console.log('Server - Deleted teacher proposal ID:', id);
        res.json({ message: 'Teacher proposal deleted successfully!' });
    } else {
        res.status(404).json({ error: 'Teacher proposal not found.' });
    }
});

app.get('/api/footer-settings', (req, res) => {
    console.log('Server - Fetching footer settings');
    res.json(footerSettings);
});

app.put('/api/admin/footer-settings', authenticateAdmin, (req, res) => {
    const { email, message, showMessage } = req.body;
    if (!email || typeof message !== 'string' || typeof showMessage !== 'boolean') {
        console.log('Server - Invalid footer settings data:', req.body);
        return res.status(400).json({ error: 'Email, message (string), and showMessage (boolean) are required.' });
    }
    footerSettings = { email, message, showMessage };
    try {
        saveFooterSettingsToFile();
        console.log('Server - Updated footer settings:', footerSettings);
        res.json({ message: 'Footer settings updated successfully!' });
    } catch (error) {
        console.error('Server - Failed to save footer settings:', error.message);
        res.status(500).json({ error: 'Failed to save footer settings to file.' });
    }
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
    console.log(`Server running on port ${port} - Version 1.18 - Started at ${new Date().toISOString()}`);
});