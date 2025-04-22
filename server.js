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
let port = process.env.PORT || 3000;

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
    limits: { fileSize: 5 * 1024 * 1020 },
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
    if (err) {
        console.error('Server - Database connection error:', err.message);
        console.log('Server - Retrying database connection in 5 seconds...');
        setTimeout(() => {
            const retryDb = new sqlite3.Database('./database.sqlite', sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (retryErr) => {
                if (retryErr) {
                    console.error('Server - Database retry failed:', retryErr.message);
                    process.exit(1);
                } else {
                    console.log('Server - Connected to SQLite database after retry');
                }
            });
        }, 5000);
    } else {
        console.log('Server - Connected to SQLite database');
    }
});

function generateTempId() {
    return `TEMP-${uuidv4().slice(0, 8)}`;
}

// Badge definitions
const BADGES = {
    // Voting Badges
    BRONZE_VOTER: { name: 'Bronze Voter', description: 'Cast 1 vote', icon: '⭐', level: 1, type: 'voting' },
    SILVER_VOTER: { name: 'Silver Voter', description: 'Cast 10 votes', icon: '⭐⭐', level: 2, type: 'voting' },
    GOLD_VOTER: { name: 'Gold Voter', description: 'Cast 50 votes', icon: '⭐⭐⭐', level: 3, type: 'voting' },
    PLATINUM_VOTER: { name: 'Platinum Voter', description: 'Cast 100 votes', icon: '⭐⭐⭐⭐', level: 4, type: 'voting' },
    DIAMOND_VOTER: { name: 'Diamond Voter', description: 'Cast 250 votes', icon: '💎', level: 5, type: 'voting' },
    
    // Teacher Submission Badges
    TEACHER_SCOUT: { name: 'Teacher Scout', description: 'Submitted 1 teacher', icon: '🔍', level: 1, type: 'teacher' },
    TEACHER_GUIDE: { name: 'Teacher Guide', description: 'Submitted 5 teachers', icon: '🗺️', level: 2, type: 'teacher' },
    TEACHER_MASTER: { name: 'Teacher Master', description: 'Submitted 7 teachers', icon: '👑', level: 3, type: 'teacher' },
    TEACHER_LEGEND: { name: 'Teacher Legend', description: 'Submitted 15 teachers', icon: '🔥', level: 4, type: 'teacher' },
    TEACHER_HALL_OF_FAME: { name: 'Teacher Hall of Fame', description: 'Submitted 50 teachers', icon: '🏆', level: 5, type: 'teacher' },

    // Streak Badges
    DAILY_VOTER: { name: 'Daily Voter', description: 'Voted every day for 7 days', icon: '📅', level: 1, type: 'streak' },
    WEEKLY_VOTER: { name: 'Weekly Voter', description: 'Voted every week for 4 weeks', icon: '📅📅', level: 2, type: 'streak' },
    MONTHLY_VOTER: { name: 'Monthly Voter', description: 'Voted every month for 3 months', icon: '📅📅📅', level: 3, type: 'streak' },

    // Engagement Badges
    COMMENTATOR: { name: 'Commentator', description: 'Left 5 comments', icon: '💬', level: 1, type: 'engagement' },
    REVIEWER: { name: 'Reviewer', description: 'Left 20 comments', icon: '📝', level: 2, type: 'engagement' },
    CRITIC: { name: 'Critic', description: 'Left 50 comments', icon: '⭐📝', level: 3, type: 'engagement' },

    // Community Badges
    HELPFUL: { name: 'Helpful', description: 'Reported 3 inappropriate comments', icon: '🛡️', level: 1, type: 'community' },
    PROTECTOR: { name: 'Protector', description: 'Reported 10 inappropriate comments', icon: '🛡️🛡️', level: 2, type: 'community' },
    GUARDIAN: { name: 'Guardian', description: 'Reported 25 inappropriate comments', icon: '🛡️🛡️🛡️', level: 3, type: 'community' },

    // Spotlight Badges
    SPOTLIGHT_SEEKER: { name: 'Spotlight Seeker', description: 'Voted on spotlight teacher', icon: '✨', level: 1, type: 'spotlight' },
    SPOTLIGHT_SUPPORTER: { name: 'Spotlight Supporter', description: 'Voted on spotlight teacher 5 times', icon: '✨✨', level: 2, type: 'spotlight' },
    SPOTLIGHT_CHAMPION: { name: 'Spotlight Champion', description: 'Voted on spotlight teacher 20 times', icon: '✨✨✨', level: 3, type: 'spotlight' }
};

// Badge thresholds
const VOTING_THRESHOLDS = {
    BRONZE_VOTER: 1,
    SILVER_VOTER: 5,
    GOLD_VOTER: 10,
    PLATINUM_VOTER: 25,
    DIAMOND_VOTER: 50
};

const TEACHER_THRESHOLDS = {
    TEACHER_SCOUT: 1,
    TEACHER_GUIDE: 3,
    TEACHER_MASTER: 5,
    TEACHER_LEGEND: 10,
    TEACHER_HALL_OF_FAME: 15
};

// Define all database tables
const tables = [
    {
        name: 'users',
        sql: `CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            email TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            name TEXT,
            role TEXT DEFAULT 'user',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`
    },
    {
        name: 'teachers',
        sql: `CREATE TABLE IF NOT EXISTS teachers (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            bio TEXT,
            description TEXT,
            department TEXT,
            classes TEXT,
            tags TEXT,
            room_number TEXT,
            schedule TEXT,
            image_link TEXT,
            avg_rating REAL DEFAULT 0,
            rating_count INTEGER DEFAULT 0,
            is_spotlight BOOLEAN DEFAULT FALSE,
            created_by TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`
    },
    {
        name: 'badges',
        sql: `CREATE TABLE IF NOT EXISTS badges (
            name TEXT PRIMARY KEY,
            icon TEXT NOT NULL,
            description TEXT NOT NULL,
            type TEXT NOT NULL,
            level INTEGER NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`
    },
    {
        name: 'user_badges',
        sql: `CREATE TABLE IF NOT EXISTS user_badges (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            badge_name TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id),
            FOREIGN KEY (badge_name) REFERENCES badges(name)
        )`
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
            timestamp TIMESTAMP,
            FOREIGN KEY (teacher_id) REFERENCES teachers(id),
            FOREIGN KEY (user_id) REFERENCES users(id)
        )`
    }
];

// Function to initialize badges in the database
function initializeBadges() {
    console.log('Server - Initializing badges...');
    
    // Insert all badges from the BADGES object
    db.serialize(() => {
        db.run('BEGIN TRANSACTION');
        
        // First check if there are any badges
        db.get('SELECT COUNT(*) as count FROM badges', (err, row) => {
            if (err) {
                console.error('Server - Error committing transaction:', err);
                db.run('ROLLBACK');
                return;
            }
            console.log('Server - Badges initialized successfully');
        });
    });
}

// Function to migrate existing tables
function migrateTable(tableName, newColumns) {
    console.log(`Server - Migrating table ${tableName}`);
    
    // Get existing columns
    db.all(`PRAGMA table_info(${tableName})`, (err, columns) => {
        if (err) {
            console.error(`Server - Error getting table info for ${tableName}:`, err);
            return;
        }
        
        const existingColumns = columns.map(col => col.name);
        const columnsToAdd = newColumns.filter(col => !existingColumns.includes(col.name));
        
        if (columnsToAdd.length === 0) {
            console.log(`Server - No columns to add for ${tableName}`);
            return;
        }
        
        // Create temporary table
        const tempTableName = `${tableName}_temp`;
        const createTempSql = `CREATE TABLE ${tempTableName} (
            ${existingColumns.map(col => `${col} ${col.type}`).join(', ')}
        )`;
        
        db.run(createTempSql, (err) => {
            if (err) {
                console.error(`Server - Error creating temp table:`, err);
                return;
            }
            
            // Copy data
            const copyDataSql = `INSERT INTO ${tempTableName} SELECT * FROM ${tableName}`;
            db.run(copyDataSql, (err) => {
                if (err) {
                    console.error(`Server - Error copying data:`, err);
                    return;
                }
                
                // Drop original table
                db.run(`DROP TABLE ${tableName}`, (err) => {
                    if (err) {
                        console.error(`Server - Error dropping table:`, err);
                        return;
                    }
                    
                    // Create new table with all columns
                    db.run(`CREATE TABLE ${tableName} (
                        ${existingColumns.map(col => `${col} ${col.type}`).join(', ')},
                        ${columnsToAdd.map(col => `${col.name} ${col.type}`).join(', ')}
                    )`, (err) => {
                        if (err) {
                            console.error(`Server - Error creating new table:`, err);
                            return;
                        }
                        
                        // Copy data back
                        db.run(`INSERT INTO ${tableName} SELECT * FROM ${tempTableName}`, (err) => {
                            if (err) {
                                console.error(`Server - Error copying data back:`, err);
                                return;
                            }
                            
                            // Drop temp table
                            db.run(`DROP TABLE ${tempTableName}`, (err) => {
                                if (err) {
                                    console.error(`Server - Error dropping temp table:`, err);
                                    return;
                                }
                                console.log(`Server - Successfully migrated table ${tableName}`);
                            });
                        });
                    });
                });
            });
        });
    });
}

// Function to initialize tables in order
const initializeNextTable = (index = 0) => {
    if (index >= tables.length) {
        console.log('Server - Database initialization completed');
        // After all tables are created, initialize badges and run retroactive badge awarding
        db.serialize(() => {
            initializeBadges();
            retroactiveBadgeAwarding().catch(err => {
                console.error('Server - Error during retroactive badge awarding:', err);
            });
        });
        return;
    }

    const table = tables[index];
    
    // Drop the table if it exists
    db.run(`DROP TABLE IF EXISTS ${table.name}`, (err) => {
        if (err) {
            console.error(`Server - Error dropping table ${table.name}:`, err);
            return;
        }
        
        // Create the table
        db.run(table.sql, (err) => {
            if (err) {
                console.error(`Server - Error creating table ${table.name}:`, err);
                return;
            }
            console.log(`Server - Table ${table.name} created`);
            initializeNextTable(index + 1);
        });
    });
};

// Function to award badges based on user activity
async function retroactiveBadgeAwarding() {
    console.log('Server - Starting retroactive badge awarding');
    
    // Get all users
    const users = await new Promise((resolve, reject) => {
        db.all('SELECT id FROM users WHERE role = ?', ['user'], (err, rows) => {
            if (err) reject(err);
            resolve(rows);
        });
    });

    if (!users.length) {
        console.log('Server - No users found for badge awarding');
        return;
    }

    console.log(`Server - Checking badges for ${users.length} users`);

    for (const user of users) {
        const userId = user.id;
        
        // Check voting badges
        const votes = await new Promise((resolve, reject) => {
            db.all('SELECT COUNT(*) as count FROM votes WHERE user_id = ?', [userId], (err, rows) => {
                if (err) reject(err);
                resolve(rows[0].count);
            });
        });

        console.log(`Server - User ${userId} has ${votes} votes`);

        // Award voting badges
        const votingBadges = ['BRONZE_VOTER', 'SILVER_VOTER', 'GOLD_VOTER', 'PLATINUM_VOTER', 'DIAMOND_VOTER'];
        for (const badgeName of votingBadges) {
            if (votes >= VOTING_THRESHOLDS[badgeName]) {
                await awardBadge(userId, badgeName);
            }
        }

        // Check teacher submission badges
        const teacherCount = await new Promise((resolve, reject) => {
            db.all('SELECT COUNT(*) as count FROM teachers WHERE created_by = ?', [userId], (err, rows) => {
                if (err) reject(err);
                resolve(rows[0].count);
            });
        });

        const teacherBadges = ['TEACHER_SCOUT', 'TEACHER_GUIDE', 'TEACHER_MASTER', 'TEACHER_LEGEND', 'TEACHER_HALL_OF_FAME'];
        for (const badgeName of teacherBadges) {
            if (teacherCount >= TEACHER_THRESHOLDS[badgeName]) {
                await awardBadge(userId, badgeName);
            }
        }
    }
}

// Function to award a specific badge to a user
async function awardBadge(userId, badgeName) {
    return new Promise((resolve, reject) => {
        // Check if user already has this badge
        db.get('SELECT id FROM user_badges WHERE user_id = ? AND badge_name = ?', [userId, badgeName], (err, row) => {
            if (err) return reject(err);
            if (row) {
                console.log(`Server - User ${userId} already has badge ${badgeName}`);
                return resolve();
            }

            // Award new badge
            db.run('INSERT INTO user_badges (user_id, badge_name) VALUES (?, ?)', [userId, badgeName], function(err) {
                if (err) return reject(err);
                console.log(`Server - Awarded badge ${badgeName} to user ${userId}`);
                resolve();
            });
        });
    });
}

// Function to check and award badges
async function checkAndAwardBadges(userId) {
    return new Promise((resolve, reject) => {
        // Get user's vote count
        db.get('SELECT COUNT(*) as vote_count FROM votes WHERE user_id = ?', [userId], (err, voteResult) => {
            if (err) return reject(err);

            // Get user's teacher count (counting only approved submissions)
            db.get('SELECT COUNT(*) as teacher_count FROM teacher_proposals WHERE user_id = ? AND status = ?', [userId, 'approved'], (err, teacherResult) => {
                if (err) return reject(err);

                // Get existing badges for this user
                db.all('SELECT badge_name, level FROM user_badges ub JOIN badges b ON ub.badge_name = b.name WHERE user_id = ?', [userId], (err, existingBadges) => {
                    if (err) return reject(err);

                    const existingBadgeLevels = {};
                    existingBadges.forEach(badge => {
                        existingBadgeLevels[badge.badge_name] = badge.level;
                    });

                    const badgesToAward = [];

                    // Check voting badges
                    if (!existingBadgeLevels['Bronze Voter'] && voteResult.vote_count >= 1) {
                        badgesToAward.push({ name: 'Bronze Voter', level: 1 });
                    }
                    if (!existingBadgeLevels['Silver Voter'] && voteResult.vote_count >= 10) {
                        badgesToAward.push({ name: 'Silver Voter', level: 2 });
                    }
                    if (!existingBadgeLevels['Gold Voter'] && voteResult.vote_count >= 25) {
                        badgesToAward.push({ name: 'Gold Voter', level: 3 });
                    }
                    if (!existingBadgeLevels['Platinum Voter'] && voteResult.vote_count >= 50) {
                        badgesToAward.push({ name: 'Platinum Voter', level: 4 });
                    }
                    if (!existingBadgeLevels['Diamond Voter'] && voteResult.vote_count >= 100) {
                        badgesToAward.push({ name: 'Diamond Voter', level: 5 });
                    }

                    // Check teacher badges
                    if (!existingBadgeLevels['Teacher Scout'] && teacherResult.teacher_count >= 1) {
                        badgesToAward.push({ name: 'Teacher Scout', level: 1 });
                    }
                    if (!existingBadgeLevels['Teacher Guide'] && teacherResult.teacher_count >= 5) {
                        badgesToAward.push({ name: 'Teacher Guide', level: 2 });
                    }
                    if (!existingBadgeLevels['Teacher Master'] && teacherResult.teacher_count >= 7) {
                        badgesToAward.push({ name: 'Teacher Master', level: 3 });
                    }
                    if (!existingBadgeLevels['Teacher Legend'] && teacherResult.teacher_count >= 10) {
                        badgesToAward.push({ name: 'Teacher Legend', level: 4 });
                    }
                    if (!existingBadgeLevels['Teacher Hall of Fame'] && teacherResult.teacher_count >= 15) {
                        badgesToAward.push({ name: 'Teacher Hall of Fame', level: 5 });
                    }

                    const insertBadge = (index) => {
                        if (index >= badgesToAward.length) {
                            resolve();
                            return;
                        }

                        const { name, level } = badgesToAward[index];
                        db.run('INSERT OR IGNORE INTO user_badges (user_id, badge_name) VALUES (?, ?)',
                            [userId, name], (err) => {
                                if (err) {
                                    console.error('Server - Error inserting badge:', err);
                                    reject(err);
                                }
                                console.log('Server - Awarded badge:', name);
                                insertBadge(index + 1);
                            }
                        );
                    };

                    insertBadge(0);
                });
            });
        });
    });
}

function initializeBadges() {
    console.log('Server - Initializing badges');
    
    // First check if badges table exists
    db.get('SELECT name FROM sqlite_master WHERE type="table" AND name="badges"', (err, table) => {
        if (err) {
            console.error('Server - Error checking badges table:', err);
            return;
        }

        if (!table) {
            console.log('Server - Creating badges table');
            db.run(`CREATE TABLE badges (
                name TEXT PRIMARY KEY,
                icon TEXT NOT NULL,
                description TEXT NOT NULL,
                type TEXT NOT NULL,
                level INTEGER NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`, (err) => {
                if (err) {
                    console.error('Server - Error creating badges table:', err);
                    return;
                }
                console.log('Server - Badges table created');
                initializeBadgesData();
            });
        } else {
            console.log('Server - Badges table exists, checking data');
            initializeBadgesData();
        }
    });
}

function initializeBadgesData() {
    // Start transaction
    db.run('BEGIN TRANSACTION', (err) => {
        if (err) {
            console.error('Server - Error starting transaction:', err);
            return;
        }

        // Insert all badges
        Object.values(BADGES).forEach(badge => {
            const level = badge.level || 1; // Get level directly from the badge object
            db.run('INSERT OR REPLACE INTO badges (name, icon, description, type, level) VALUES (?, ?, ?, ?, ?)',
                [badge.name, badge.icon, badge.description, badge.type, level],
                (err) => {
                    if (err) {
                        console.error('Server - Error inserting badge:', badge.name, err);
                        db.run('ROLLBACK');
                        return;
                    }
                    console.log('Server - Badge inserted:', badge.name);
                }
            );
        });

        // Commit transaction
        db.run('COMMIT', (err) => {
            if (err) {
                console.error('Server - Error committing transaction:', err);
                db.run('ROLLBACK');
                return;
            }
            console.log('Server - Badges initialized successfully');
        });
    });
}

// Database Initialization with Migration Support
db.serialize(() => {
    // Drop and recreate badges table to ensure proper schema
    db.run('DROP TABLE IF EXISTS badges', (err) => {
        if (err) {
            console.error('Server - Error dropping badges table:', err);
        } else {
            console.log('Server - Dropped existing badges table');
            
            // Create badges table with level column
            db.run(`CREATE TABLE badges (
                name TEXT PRIMARY KEY,
                icon TEXT NOT NULL,
                description TEXT NOT NULL,
                type TEXT NOT NULL,
                level INTEGER NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`, (err) => {
                if (err) {
                    console.error('Server - Error creating badges table:', err);
                } else {
                    console.log('Server - Created badges table');
                    
                    // Initialize badges data
                    initializeBadges();
                }
            });
        }
    });

    // Create user_badges table
    db.run(`CREATE TABLE IF NOT EXISTS user_badges (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        badge_name TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id),
        FOREIGN KEY (badge_name) REFERENCES badges(name),
        UNIQUE(user_id, badge_name)
    )`, (err) => {
        if (err) {
            console.error('Server - Error creating user_badges table:', err);
        } else {
            console.log('Server - Created user_badges table');
        }
    });

    // Helper function to check if table exists
    const tableExists = (tableName, callback) => {
        db.get(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`, [tableName], (err, row) => {
            if (err) {
                console.error(`Server - Error checking table ${tableName}:`, err.message);
                callback(false);
            } else {
                callback(!!row);
            }
        });
    };

    // Helper function to check if a column exists in a table
    const columnExists = (tableName, columnName, callback) => {
        db.all(`PRAGMA table_info(${tableName})`, (err, columns) => {
            if (err) {
                console.error(`Server - Error checking columns for ${tableName}:`, err.message);
                callback(false);
            } else {
                callback(columns.some(col => col.name === columnName));
            }
        });
    };

    // Helper function to add a column if it doesn't exist
    const addColumn = (tableName, columnDef, callback) => {
        columnExists(tableName, columnDef.split(' ')[0], (exists) => {
            if (!exists) {
                db.run(`ALTER TABLE ${tableName} ADD COLUMN ${columnDef}`, (err) => {
                    if (err) {
                        console.error(`Server - Error adding column to ${tableName}:`, err.message);
                    } else {
                        console.log(`Server - Added column ${columnDef.split(' ')[0]} to ${tableName}`);
                    }
                    callback(err);
                });
            } else {
                callback(null);
            }
        });
    };

    // Function to create table if it doesn't exist
    const createTableIfNotExists = (tableName, sql, callback) => {
        tableExists(tableName, (exists) => {
            if (!exists) {
                db.run(sql, (err) => {
                    if (err) {
                        console.error(`Server - Error creating table ${tableName}:`, err.message);
                        callback(err);
                    } else {
                        console.log(`Server - Created table ${tableName}`);
                        callback(null);
                    }
                });
            } else {
                callback(null);
            }
        });
    };

    // Create user_badges table if it doesn't exist
    createTableIfNotExists('user_badges', `CREATE TABLE IF NOT EXISTS user_badges (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        badge_name TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`, (err) => {
        if (err) {
            console.error('Server - Error creating user_badges table:', err);
            return;
        }

        // Check for and remove badge_id column if it exists
        columnExists('user_badges', 'badge_id', (exists) => {
            if (exists) {
                // Create a temporary table to preserve data
                db.run('CREATE TEMPORARY TABLE temp_user_badges AS SELECT * FROM user_badges', (err) => {
                    if (err) {
                        console.error('Server - Error creating temporary table:', err);
                        return;
                    }

                    // Drop the original table
                    db.run('DROP TABLE user_badges', (err) => {
                        if (err) {
                            console.error('Server - Error dropping original table:', err);
                            return;
                        }

                        // Recreate the table with badge_name
                        db.run(`CREATE TABLE user_badges (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            user_id TEXT NOT NULL,
                            badge_name TEXT NOT NULL,
                            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                        )`, (err) => {
                            if (err) {
                                console.error('Server - Error recreating table:', err);
                                return;
                            }

                            // Copy data back from temporary table
                            db.run('INSERT INTO user_badges SELECT id, user_id, badge_name, created_at FROM temp_user_badges', (err) => {
                                if (err) {
                                    console.error('Server - Error copying data back:', err);
                                    return;
                                }
                                console.log('Server - Successfully migrated from badge_id to badge_name');
                            });
                            console.log('Server - Made badge_name column NOT NULL');
                        });
                    });
                });
            } else {
                // If badge_id doesn't exist, just add badge_name if needed
                columnExists('user_badges', 'badge_name', (exists) => {
                    if (!exists) {
                        db.run('ALTER TABLE user_badges ADD COLUMN badge_name TEXT', (err) => {
                            if (err) {
                                console.error('Server - Error adding badge_name column:', err);
                                return;
                            }
                            console.log('Server - Added badge_name column to user_badges table');
                        });
                    }
                });
            }
        });
    });

    // Run retroactive badge awarding only once after all tables are created
    const runRetroactiveBadges = () => {
        console.log('Server - Starting retroactive badge awarding...');
        
        // Get all users
        db.all('SELECT id FROM users', [], (err, users) => {
            if (err) {
                console.error('Server - Error getting users:', err);
                return;
            }

            // Process users one by one
            const processUser = (index) => {
                if (index >= users.length) {
                    console.log('Server - Completed retroactive badge awarding');
                    return;
                }

                const userId = users[index].id;
                console.log(`Server - Processing user ${userId} for retroactive badges`);

                // Get user's existing badges
                db.all('SELECT badge_name FROM user_badges WHERE user_id = ?', [userId], (err, existingBadges) => {
                    if (err) {
                        console.error(`Server - Error getting badges for user ${userId}:`, err);
                        processUser(index + 1);
                        return;
                    }

                    // Get user's vote count
                    db.get('SELECT COUNT(*) as vote_count FROM votes WHERE user_id = ?', [userId], (err, voteResult) => {
                        if (err) {
                            console.error(`Server - Error getting vote count for user ${userId}:`, err);
                            processUser(index + 1);
                            return;
                        }

                        // Get user's teacher count
                        db.get('SELECT COUNT(DISTINCT teacher_id) as teacher_count FROM votes WHERE user_id = ?', [userId], (err, teacherResult) => {
                            if (err) {
                                console.error(`Server - Error getting teacher count for user ${userId}:`, err);
                                processUser(index + 1);
                                return;
                            }

                            // Determine new badges to award
                            const badgesToAward = [];
                            const existingBadgeNames = existingBadges.map(b => b.badge_name);

                            // Check voting badges
                            Object.entries(VOTING_THRESHOLDS).forEach(([badgeName, threshold]) => {
                                if (voteResult.vote_count >= threshold && 
                                    !existingBadgeNames.includes(badgeName)) {
                                    badgesToAward.push(badgeName);
                                }
                            });

                            // Check teacher badges
                            Object.entries(TEACHER_THRESHOLDS).forEach(([badgeName, threshold]) => {
                                if (teacherResult.teacher_count >= threshold && 
                                    !existingBadgeNames.includes(badgeName)) {
                                    badgesToAward.push(badgeName);
                                }
                            });

                            // Award new badges
                            if (badgesToAward.length > 0) {
                                console.log(`Server - Awarding ${badgesToAward.length} retroactive badges to user ${userId}`);
                                
                                const insertBadge = (index) => {
                                    if (index >= badgesToAward.length) {
                                        processUser(index + 1);
                                        return;
                                    }

                                    db.run('INSERT INTO user_badges (user_id, badge_name) VALUES (?, ?)', 
                                        [userId, badgesToAward[index]],
                                        (err) => {
                                            if (err) {
                                                console.error(`Server - Error inserting badge ${badgesToAward[index]} for user ${userId}:`, err);
                                                insertBadge(index + 1);
                                                return;
                                            }
                                            console.log(`Server - Awarded badge ${badgesToAward[index]} to user ${userId}`);
                                            insertBadge(index + 1);
                                        }
                                    );
                                };

                                insertBadge(0);
                            } else {
                                console.log(`Server - No new badges to award for user ${userId}`);
                                processUser(index + 1);
                            }
                        });
                    });
                });
            };

            processUser(0);
        });
    };

    // Run retroactive badge awarding only once at startup
    db.get('SELECT COUNT(*) as count FROM user_badges', [], (err, row) => {
        if (err) {
            console.error('Server - Error checking user_badges:', err);
            return;
        }
        
        if (row.count === 0) {
            // Only run if there are no badges in the database
            runRetroactiveBadges();
        } else {
            console.log('Server - Skipping retroactive badge awarding - badges already exist');
        }
    });

    // Define table structures (only create if they don’t exist)
    const tables = [
        {
            name: 'teachers',
            sql: `CREATE TABLE IF NOT EXISTS teachers (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                department TEXT,
                classes TEXT,
                tags TEXT,
                schedule TEXT,
                is_spotlight BOOLEAN DEFAULT FALSE,
                created_by TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`
        },
        {
            name: 'user_badges',
            sql: `CREATE TABLE IF NOT EXISTS user_badges (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                badge_name TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id)
            )`
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
                timestamp TIMESTAMP,
                FOREIGN KEY (teacher_id) REFERENCES teachers(id),
                FOREIGN KEY (user_id) REFERENCES users(id))`,
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
        },
        {
            name: 'settings',
            sql: `CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL)`,
        },
        {
            name: 'stats',
            sql: `CREATE TABLE IF NOT EXISTS stats (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                visitor_id TEXT NOT NULL,
                timestamp TEXT NOT NULL)`,
        },
        {
            name: 'admins',
            sql: `CREATE TABLE IF NOT EXISTS admins (
                username TEXT PRIMARY KEY,
                password_hash TEXT NOT NULL)`,
        },
        {
            name: 'suggestions',
            sql: `CREATE TABLE IF NOT EXISTS suggestions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT NOT NULL,
                suggestion TEXT NOT NULL,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`,
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
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                theme TEXT DEFAULT 'light')`,
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
        },
        {
            name: 'badges',
            sql: `CREATE TABLE IF NOT EXISTS badges (
                id INTEGER PRIMARY KEY,
                name TEXT NOT NULL UNIQUE,
                description TEXT)`,
        },
        {
            name: 'user_badges',
            sql: `CREATE TABLE IF NOT EXISTS user_badges (
                user_id INTEGER NOT NULL,
                badge_name TEXT NOT NULL,
                awarded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id),
                PRIMARY KEY (user_id, badge_name))`,
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
        `CREATE INDEX IF NOT EXISTS idx_users_email ON users (email)`,
        `CREATE INDEX IF NOT EXISTS idx_point_transactions_user_id ON point_transactions (user_id)`,
        `CREATE INDEX IF NOT EXISTS idx_user_badges_user_id ON user_badges (user_id)`,
        `CREATE INDEX IF NOT EXISTS idx_teachers_spotlight ON teachers (is_spotlight)`,
    ];

    // Initialize tables and apply migrations
    let tableIndex = 0;
    function initializeNextTable() {
        if (tableIndex >= tables.length) {
            applyMigrations();
            return;
        }
        const table = tables[tableIndex];
        tableExists(table.name, (exists) => {
            if (!exists) {
                db.run(table.sql, (err) => {
                    if (err) {
                        console.error(`Server - Error creating table ${table.name}:`, err.message);
                    } else {
                        console.log(`Server - Created table ${table.name}`);
                    }
                    tableIndex++;
                    initializeNextTable();
                });
            } else {
                console.log(`Server - Table ${table.name} already exists`);
                tableIndex++;
                initializeNextTable();
            }
        });
    }

    function applyMigrations() {
        // Add missing columns to existing tables
        const migrations = [
            // Ensure users table has necessary columns
            () => addColumn('users', 'points INTEGER DEFAULT 0', (err) => {
                if (err) return console.error('Server - Failed to migrate users.points:', err.message);
                addColumn('users', 'last_login DATE', (err) => {
                    if (err) return console.error('Server - Failed to migrate users.last_login:', err.message);
                    addColumn('users', 'is_locked INTEGER DEFAULT 0', (err) => {
                        if (err) return console.error('Server - Failed to migrate users.is_locked:', err.message);
                        addColumn('users', 'created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP', (err) => {
                            if (err) return console.error('Server - Failed to migrate users.created_at:', err.message);
                            addColumn('users', 'theme TEXT DEFAULT "light"', (err) => {
                                if (err) return console.error('Server - Failed to migrate users.theme:', err.message);
                                // Add is_spotlight to teachers table
                                addColumn('teachers', 'is_spotlight INTEGER DEFAULT 0', (err) => {
                                    if (err) return console.error('Server - Failed to migrate teachers.is_spotlight:', err.message);
                                    console.log('Server - Added is_spotlight column to teachers table');
                                    // Add timestamp to votes table
                                    addColumn('votes', 'timestamp TIMESTAMP', (err) => {
                                        if (err) return console.error('Server - Failed to migrate votes.timestamp:', err.message);
                                        db.run('UPDATE votes SET timestamp = CURRENT_TIMESTAMP WHERE timestamp IS NULL', (err) => {
                                            if (err) {
                                                console.error('Server - Error backfilling votes.timestamp:', err.message);
                                            } else {
                                                console.log('Server - Backfilled timestamp for existing votes');
                                            }
                                            // Add user_id to notifications table
                                            addColumn('notifications', 'user_id INTEGER', (err) => {
                                                if (err) return console.error('Server - Failed to migrate notifications.user_id:', err.message);
                                                console.log('Server - Migrated notifications.user_id');
                                                createIndexes();
                                            });
                                        });
                                    });
                                });
                            });
                        });
                    });
                });
            }),
        ];

        let migrationIndex = 0;
        function runNextMigration() {
            if (migrationIndex >= migrations.length) {
                insertInitialData();
                return;
            }
            migrations[migrationIndex]();
            migrationIndex++;
            runNextMigration();
        }

        runNextMigration();
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
        // Initial settings
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

        // Default admin
        const adminUsername = process.env.ADMIN_USERNAME || 'admin';
        const adminPassword = process.env.ADMIN_PASSWORD || 'password123';
        bcrypt.hash(adminPassword, 10, (err, hash) => {
            if (err) return console.error('Server - Error hashing admin password:', err.message);
            db.run('INSERT OR IGNORE INTO admins (username, password_hash) VALUES (?, ?)', [adminUsername, hash],
                err => err ? console.error('Server - Error inserting admin:', err.message) : console.log('Server - Default admin initialized:', adminUsername));
        });


        // Insert initial badges with specific IDs
        const initialBadges = [
            [1, 'First Vote', 'Awarded for casting your first vote'],
            [2, 'Streak Master', 'Achieved a 5-day login streak'],
            [3, 'Teacher Contributor', 'Submitted a teacher proposal that was approved'],
            [4, 'Frequent Voter', 'Cast 5 votes'],
            [5, 'Voting Veteran', 'Cast 10 votes'],
            [6, 'Point Dictator', 'Top of the leaderboard'],
            [7, 'Half-Century Club', 'Earned 50 points'],
            [8, 'Century Master', 'Earned 100 points'],
            [9, 'Engaged Contributor', 'Voted 3 times and submitted a teacher'],
        ];
        initialBadges.forEach(([id, name, description]) => {
            db.run('INSERT OR IGNORE INTO badges (name, description) VALUES (?, ?)', [name, description], err => {
                if (err) console.error('Server - Error inserting badge:', err.message);
                else console.log('Server - Inserted badge:', name);
            });
        });
    }

    // Function to retroactively award badges to all users
    async function retroactiveBadgeAwarding() {
        return new Promise((resolve, reject) => {
            // Get all users
            db.all('SELECT id FROM users', [], (err, users) => {
                if (err) return reject(err);

                // Process users one by one
                const processUser = (index) => {
                    if (index >= users.length) {
                        console.log('Server - Completed retroactive badge awarding');
                        resolve();
                        return;
                    }

                    const userId = users[index].id;
                    console.log(`Server - Processing user ${userId} for retroactive badges`);

                    // Get user's vote count
                    db.get('SELECT COUNT(*) as vote_count FROM votes WHERE user_id = ?', [userId], (err, voteResult) => {
                        if (err) return reject(err);

                        // Get user's teacher count (using votes table)
                        db.get('SELECT COUNT(DISTINCT teacher_id) as teacher_count FROM votes WHERE user_id = ?', [userId], (err, teacherResult) => {
                            if (err) return reject(err);

                            // Check existing badges for this user
                            db.all('SELECT badge_name FROM user_badges WHERE user_id = ?', [userId], (err, existingBadges) => {
                                if (err) return reject(err);

                                // Get all possible badges
                                const allBadges = [...Object.values(VOTING_THRESHOLDS), ...Object.values(TEACHER_THRESHOLDS)];
                                const badgesToAward = [];

                                // Check voting badges
                                Object.entries(VOTING_THRESHOLDS).forEach(([badgeKey, threshold]) => {
                                    if (voteResult.vote_count >= threshold && 
                                        !existingBadges.find(b => b.badge_name === badgeKey)) {
                                        badgesToAward.push(BADGES[badgeKey]);
                                    }
                                });

                                // Check teacher badges
                                Object.entries(TEACHER_THRESHOLDS).forEach(([badgeKey, threshold]) => {
                                    if (teacherResult.teacher_count >= threshold && 
                                        !existingBadges.find(b => b.badge_name === badgeKey)) {
                                        badgesToAward.push(BADGES[badgeKey]);
                                    }
                                });

                                // Award new badges
                                if (badgesToAward.length > 0) {
                                    console.log(`Server - Awarding ${badgesToAward.length} retroactive badges to user ${userId}`);
                                    const badgeNames = badgesToAward.map(badge => badge.name);
                                    const badgeInserts = badgeNames.map(badgeName => [userId, badgeName]);

                                    const insertBadge = (index) => {
                                        if (index >= badgeInserts.length) {
                                            processUser(index + 1);
                                            return;
                                        }
                                        
                                        const [userId, badgeName] = badgeInserts[index];
                                        db.run('INSERT INTO user_badges (user_id, badge_name) VALUES (?, ?)', 
                                            [userId, badgeName],
                                            function(err) {
                                                if (err) {
                                                    console.error('Server - Error inserting retroactive badge:', err);
                                                    reject(err);
                                                    return;
                                                }
                                                insertBadge(index + 1);
                                            }
                                        );
                                    };

                                    insertBadge(0);
                                } else {
                                    processUser(index + 1);
                                }
                            });
                        });
                    });
                };

                processUser(0);
            });
        });
    }

    console.log('Server - Starting database initialization');
    initializeNextTable();

    // Initialize tables using the function defined at the top
    console.log('Server - Starting database initialization');
    initializeNextTable();
});

// Function to check if a port is in use and find an available one
let server; // Declare server at the top level

function findAvailablePort(startPort, callback) {
    const net = require('net');
    server = net.createServer(); // Assign to the global server variable

    server.listen(startPort, '0.0.0.0', () => {
        server.close(() => {
            callback(startPort);
        });
    });

    server.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            findAvailablePort(startPort + 1, callback);
        } else {
            callback(startPort);
        }
    });
}

findAvailablePort(port, (availablePort) => {
    port = availablePort; // Update port to the available one
    const server = app.listen(port, () => {
        console.log(`Server running on port ${port} - Version 1.25 - Started at ${new Date().toISOString()}`);
    }).on('error', (err) => {
        console.error(`Server - Failed to start on port ${port}:`, err.message);
        if (err.code === 'EADDRINUSE') {
            console.log(`Server - Port ${port} is in use, try a different port or free up port ${port}.`);
        }
        process.exit(1);
    });
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

// Login endpoint
app.post('/api/users/login', publicLimiter, csrfProtection, async (req, res) => {
    const { username, password } = req.body;
    
    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required' });
    }

    try {
        db.get('SELECT id, username, password_hash, is_locked FROM users WHERE username = ?', [username], async (err, user) => {
            if (err) {
                console.error('Server - Database error in login:', err.message);
                return res.status(500).json({ error: 'Database error' });
            }

            if (!user) {
                return res.status(401).json({ error: 'Invalid username or password' });
            }

            if (user.is_locked) {
                return res.status(403).json({ error: 'Account is locked. Please contact accounts@teachertally.com.' });
            }

            const validPassword = await bcrypt.compare(password, user.password_hash);
            if (!validPassword) {
                return res.status(401).json({ error: 'Invalid username or password' });
            }

            const token = jwt.sign({ id: user.id, role: 'user' }, JWT_SECRET, { expiresIn: '1d' });
            req.session.user = { id: user.id, username: user.username, isAdmin: false };

            // Set the cookie with proper options
            res.cookie('userToken', token, {
                httpOnly: true,
                sameSite: 'Strict',
                secure: process.env.NODE_ENV === 'production',
                maxAge: 24 * 60 * 60 * 1000,
                path: '/',
                domain: process.env.NODE_ENV === 'production' ? '.teachertally.com' : undefined
            });

            // Update last login timestamp
            db.run('UPDATE users SET last_login = ? WHERE id = ?', [Date.now(), user.id], (err) => {
                if (err) {
                    console.error('Server - Error updating last login:', err.message);
                }
            });

            console.log('Server - Login successful for user:', user.username);
            res.json({ message: 'Login successful' });
        });
    } catch (err) {
        console.error('Server - Error during login:', err.message);
        res.status(500).json({ error: 'Server error' });
    }
});

// Points Helper Function
function updateUserPoints(userId, points, reason, db, callback) {
    db.serialize(() => {
        db.run('BEGIN TRANSACTION');
        db.run(
            'UPDATE users SET points = points + ? WHERE id = ?',
            [points, userId],
            (err) => {
                if (err) {
                    db.run('ROLLBACK');
                    return callback(err);
                }
                db.run(
                    'INSERT INTO point_transactions (user_id, points, reason, timestamp) VALUES (?, ?, ?, ?)',
                    [userId, points, reason, Date.now()],
                    (err) => {
                        if (err) {
                            db.run('ROLLBACK');
                            return callback(err);
                        }
                        db.run('COMMIT', (commitErr) => {
                            if (commitErr) {
                                db.run('ROLLBACK');
                                return callback(commitErr);
                            }
                            callback(null);
                        });
                    }
                );
            }
        );
    });
}

function awardBadge(userId, badgeName, bonusPoints = 0, callback = () => {}) {
    db.run('INSERT OR IGNORE INTO user_badges (user_id, badge_name) VALUES (?, ?)', [userId, badgeName], (err) => {
        if (err) {
            console.error('Server - Error awarding badge:', err.message);
            return callback(err);
        }

        // Send notification
        db.run('INSERT INTO notifications (visitor_id, message, type) VALUES (?, ?, ?)',
            [userId, `You earned the "${badgeName}" badge!`, 'success'], (err) => {
                if (err) console.error('Server - Error sending badge notification:', err.message);
            });

        if (bonusPoints > 0) {
            updateUserPoints(userId, bonusPoints, `Bonus for earning "${badgeName}" badge`, db, (err) => {
                if (err) {
                    console.error('Server - Error awarding bonus points:', err.message);
                    return callback(err);
                }
                callback(null);
            });
        } else {
            callback(null);
        }
    });
}

function checkPointDictator(userId, userPoints) {
    db.get('SELECT id, points FROM users WHERE points > ? ORDER BY points DESC LIMIT 1', [userPoints], (err, topUser) => {
        if (err) return console.error('Server - Error checking Point Dictator:', err.message);
        if (!topUser || topUser.id === userId) {
            db.run('SELECT user_id FROM user_badges WHERE badge_name = ?', ['Point Dictator'], (err, currentDictator) => {
                if (err) return;
                if (!currentDictator || currentDictator.user_id !== userId) {
                    if (currentDictator) {
                        db.run('DELETE FROM user_badges WHERE user_id = ? AND badge_name = ?', [currentDictator.user_id, 'Point Dictator']);
                    }
                    awardBadge(userId, 'Point Dictator', 20);
                    awardBadge(userId, 6, 'Point Dictator', 20);
                }
            });
        }
    });
}

function handleLoginStreak(userId, callback) {
    const today = new Date().toISOString().split('T')[0];
    db.get('SELECT last_login, points FROM users WHERE id = ?', [userId], (err, user) => {
        if (err) {
            console.error('Server - Error fetching user for streak:', err.message);
            return callback(err);
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
        db.run('UPDATE users SET last_login = ?, points = points + ? WHERE id = ?', 
            [today, streakPoints, userId], (err) => {
                if (err) return callback(err);
                if (streakPoints > 0) {
                    db.run('INSERT INTO point_transactions (user_id, points, reason) VALUES (?, ?, ?)',
                        [userId, streakPoints, 'Login streak bonus'], (err) => {
                            if (err) {
                                console.error('Server - Error logging streak points:', err.message);
                                return callback(err);
                            }
                            console.log('Server - Login streak points logged:', { userId, streakPoints });
                        });
                }
                db.get('SELECT id, username, email, points FROM users WHERE id = ?', [userId], (err, updatedUser) => {
                    if (err) return callback(err);
                    callback(null, updatedUser);
                });
            });
    });
}

app.get('/api/vote/check/:teacherId', authenticateUser, (req, res) => {
    const teacherId = req.params.teacherId;
    const userId = req.user.id; // From JWT via authenticateUser middleware

    // Validate teacherId
    if (!teacherId) {
        return res.status(400).json({ error: 'Teacher ID is required' });
    }

    // Query the votes table to check if a vote exists for this user and teacher
    const query = `
        SELECT COUNT(*) as voteCount 
        FROM votes 
        WHERE user_id = ? AND teacher_id = ?
    `;
    
    db.get(query, [userId, teacherId], (err, row) => {
        if (err) {
            console.error('Database error checking vote status:', err.message);
            return res.status(500).json({ error: 'Internal server error' });
        }

        const hasVoted = row.voteCount > 0;
        res.status(200).json({ hasVoted });
    });
});

function checkEngagedContributor(userId, voteCount) {
    db.get('SELECT COUNT(*) as count FROM teacher_proposals WHERE user_id = ?', [userId], (err, row) => {
        if (err) return console.error('Server - Error checking Engaged Contributor:', err.message);
        const proposalCount = row.count;
        if (voteCount >= 3 && proposalCount >= 1) {
            awardBadge(userId, 9, 'Engaged Contributor', 5);
        }
    });
}

app.get('/api/badges', (req, res) => {
    res.json(BADGES);
});

// Get user's badges with full badge info
app.get('/api/user/badges', authenticateUser, (req, res) => {
    console.log('Server - Badge endpoint called');
    
    // Get user ID from token
    const token = req.headers['x-csrf-token'];
    console.log('Server - CSRF token:', token);
    
    // Get user ID from session
    const userId = req.user.id;
    if (!userId) {
        console.error('Server - No user ID found in session');
        return res.status(401).json({ error: 'Not authenticated' });
    }
    console.log('Server - Request: GET /api/user/badges for user:', userId);
    
    // First check if the badges table exists
    db.get('SELECT name FROM sqlite_master WHERE type="table" AND name="badges"', (err, table) => {
        if (err) {
            console.error('Server - Error checking badges table:', err.message);
            return res.status(500).json({ error: 'Database error' });
        }
        
        if (!table) {
            console.error('Server - Badges table does not exist');
            return res.status(500).json({ error: 'Badges table missing' });
        }
        
        // Now fetch the badges
        db.all('SELECT ub.badge_name, ub.created_at, b.description, b.level FROM user_badges ub JOIN badges b ON ub.badge_name = b.name WHERE ub.user_id = ?', [userId], (err, rows) => {
            if (err) {
                console.error('Server - Error fetching user badges:', err.message, 'Stack:', err.stack);
                return res.status(500).json({ error: 'Database error', details: err.message });
            }
            
            console.log('Server - Found badges:', rows.length, 'for user:', userId);
            if (rows.length > 0) {
                console.log('Server - First badge:', rows[0]);
            } else {
                console.log('Server - No badges found for user:', userId);
            }
            
            // If no badges found, return empty array
            if (!rows) rows = [];
            
            res.json(rows);
        });
    });
});

app.get('/api/user', authenticateUser, async (req, res) => {
    console.log('Server - Request: GET /api/user');
    const userId = req.user.id;

    try {
        // Fetch user data
        const user = await new Promise((resolve, reject) => {
            db.get('SELECT id, username, email, points, theme FROM users WHERE id = ?', [userId], (err, row) => {
                if (err) reject(err);
                else if (!row) reject(new Error('User not found'));
                else resolve(row);
            });
        });

        // Fetch user badges
        const badges = await new Promise((resolve, reject) => {
            db.all('SELECT ub.badge_name, ub.created_at FROM user_badges ub WHERE ub.user_id = ?', [userId], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });

        // Update login streak and points
        const updatedUser = await new Promise((resolve, reject) => {
            const today = new Date().toISOString().split('T')[0];
            db.get('SELECT last_login, points FROM users WHERE id = ?', [userId], (err, user) => {
                if (err) return reject(err);
                const lastLogin = user.last_login ? new Date(user.last_login) : null;
                let streakPoints = 0;
                if (lastLogin) {
                    const yesterday = new Date(today);
                    yesterday.setDate(yesterday.getDate() - 1);
                    if (lastLogin.toISOString().split('T')[0] === yesterday.toISOString().split('T')[0]) {
                        streakPoints = 5;
                    }
                }
                db.run('UPDATE users SET last_login = ?, points = points + ? WHERE id = ?', [today, streakPoints, userId], (err) => {
                    if (err) return reject(err);
                    if (streakPoints > 0) {
                        db.run('INSERT INTO point_transactions (user_id, points, reason) VALUES (?, ?, ?)', 
                            [userId, streakPoints, 'Login streak bonus'], (err) => {
                                if (err) console.error('Server - Error logging streak points:', err.message);
                            });
                    }
                    db.get('SELECT id, username, email, points, theme FROM users WHERE id = ?', [userId], (err, updatedUser) => {
                        if (err) return reject(err);
                        resolve(updatedUser);
                    });
                });
            });
        });

        res.json({ ...updatedUser, badges });
    } catch (err) {
        console.error('Server - Error in /api/user:', err.message);
        if (err.message === 'User not found') {
            res.status(404).json({ error: 'User not found' });
        } else {
            res.status(500).json({ error: 'Server error' });
        }
    }
});

app.post('/api/admin/teacher-proposals/:id/approve', authenticateAdmin, csrfProtection, async (req, res) => {
    const proposalId = req.params.id;

    try {
        const proposal = await new Promise((resolve, reject) => {
            db.get('SELECT * FROM teacher_proposals WHERE id = ?', [proposalId], (err, row) => {
                if (err) reject(err);
                else if (!row) reject(new Error('Proposal not found'));
                else resolve(row);
            });
        });

        const teacherData = {
            id: proposal.id.startsWith('TEMP-') ? `T${uuidv4().slice(0, 8)}` : proposal.id,
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
            is_spotlight: 0,
        };

        await new Promise((resolve, reject) => {
            db.run('INSERT INTO teachers (id, name, bio, description, classes, tags, room_number, schedule, image_link, avg_rating, rating_count, is_spotlight) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                Object.values(teacherData), (err) => {
                    if (err) reject(err);
                    else resolve();
                });
        });

        await new Promise((resolve, reject) => {
            db.run('DELETE FROM teacher_proposals WHERE id = ?', [proposalId], (err) => {
                if (err) reject(err);
                else resolve();
            });
        });

        if (proposal.user_id) {
            await new Promise((resolve, reject) => {
                updateUserPoints(proposal.user_id, 10, `Teacher proposal approved for ${proposal.name}`, (err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });
            await new Promise((resolve, reject) => {
                awardBadge(proposal.user_id, 3, 'Teacher Contributor', 5, (err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });
            const voteCount = await new Promise((resolve, reject) => {
                db.get('SELECT COUNT(*) as count FROM votes WHERE user_id = ?', [proposal.user_id], (err, row) => {
                    if (err) reject(err);
                    else resolve(row.count);
                });
            });
            checkEngagedContributor(proposal.user_id, voteCount);
        }

        res.json({ message: 'Teacher proposal approved', teacherId: teacherData.id });
    } catch (err) {
        console.error('Server - Error in /api/admin/teacher-proposals/:id/approve:', err.message);
        res.status(500).json({ error: 'Database error' });
    }
});

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

app.get('/api/spotlight', (req, res) => {
    // First check if the teachers table exists and has the is_spotlight column
    db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='teachers'", (err, tableExists) => {
        if (err) {
            console.error('Server - Error checking teachers table:', err.message);
            return res.json({ show: false, teacherId: null, name: '', bio: '', image: '/public/images/default-teacher.jpg' });
        }
        
        if (!tableExists) {
            console.log('Server - Teachers table does not exist yet');
            return res.json({ show: false, teacherId: null, name: '', bio: '', image: '/public/images/default-teacher.jpg' });
        }
        
        // Check if is_spotlight column exists
        db.get("PRAGMA table_info(teachers)", (err, tableInfo) => {
            if (err) {
                console.error('Server - Error getting teachers table info:', err.message);
                return res.json({ show: false, teacherId: null, name: '', bio: '', image: '/public/images/default-teacher.jpg' });
            }
            
            // Now try to get a spotlight teacher
            try {
                // First try to get a teacher marked as spotlight
                db.get('SELECT id, name, bio, image_link FROM teachers WHERE is_spotlight = 1', (err, teacher) => {
                    if (err) {
                        console.error('Server - Error fetching spotlight teacher:', err.message);
                        // If there's an error with the query, just return a default response
                        return res.json({ show: false, teacherId: null, name: '', bio: '', image: '/public/images/default-teacher.jpg' });
                    }
                    
                    // If no spotlight teacher is set, try to get a random teacher with good ratings
                    if (!teacher) {
                        console.log('Server - No spotlight teacher found, selecting a random teacher');
                        // First try to get a teacher with good ratings
                        db.get('SELECT id, name, bio, image_link FROM teachers WHERE avg_rating >= 3 AND rating_count >= 1 ORDER BY RANDOM() LIMIT 1', (err, randomTeacher) => {
                            if (err) {
                                console.error('Server - Error fetching random teacher with good ratings:', err.message);
                                // If there's an error, try to get any teacher
                                getAnyTeacher();
                                return;
                            }
                            
                            if (!randomTeacher) {
                                console.log('Server - No teachers with good ratings found, selecting any teacher');
                                // If no teachers with good ratings, try to get any teacher
                                getAnyTeacher();
                                return;
                            }
                            
                            res.json({
                                show: true,
                                teacherId: randomTeacher.id,
                                name: randomTeacher.name,
                                bio: randomTeacher.bio,
                                image: randomTeacher.image_link || '/public/images/default-teacher.jpg'
                            });
                        });
                    } else {
                        // Return the spotlight teacher
                        res.json({
                            show: true,
                            teacherId: teacher.id,
                            name: teacher.name,
                            bio: teacher.bio,
                            image: teacher.image_link || '/public/images/default-teacher.jpg'
                        });
                    }
                });
            } catch (error) {
                console.error('Server - Unexpected error in spotlight endpoint:', error);
                return res.json({ show: false, teacherId: null, name: '', bio: '', image: '/public/images/default-teacher.jpg' });
            }
        });
    });
    
    // Helper function to get any teacher if there are no teachers with good ratings
    function getAnyTeacher() {
        db.get('SELECT id, name, bio, image_link FROM teachers ORDER BY RANDOM() LIMIT 1', (err, anyTeacher) => {
            if (err) {
                console.error('Server - Error fetching any teacher:', err.message);
                return res.json({ show: false, teacherId: null, name: '', bio: '', image: '/public/images/default-teacher.jpg' });
            }
            
            if (!anyTeacher) {
                return res.json({ show: false, teacherId: null, name: '', bio: '', image: '/public/images/default-teacher.jpg' });
            }
            
            res.json({
                show: true,
                teacherId: anyTeacher.id,
                name: anyTeacher.name,
                bio: anyTeacher.bio,
                image: anyTeacher.image_link || '/public/images/default-teacher.jpg'
            });
        });
    }
});

// Admin endpoint to set a teacher as the spotlight teacher
app.post('/api/admin/spotlight/:teacherId', authenticateAdmin, (req, res) => {
    const teacherId = req.params.teacherId;
    
    // First, reset all teachers' spotlight status
    db.run('UPDATE teachers SET is_spotlight = 0', (err) => {
        if (err) {
            console.error('Server - Error resetting spotlight status:', err.message);
            return res.status(500).json({ error: 'Database error' });
        }
        
        // Then set the selected teacher as spotlight
        db.run('UPDATE teachers SET is_spotlight = 1 WHERE id = ?', [teacherId], (err) => {
            if (err) {
                console.error('Server - Error setting spotlight teacher:', err.message);
                return res.status(500).json({ error: 'Database error' });
            }
            
            res.json({ success: true, message: 'Spotlight teacher updated successfully' });
        });
    });
});

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

app.get('/api/spotlight', publicLimiter, (req, res) => {
    db.get('SELECT id, name, bio, image_link FROM teachers WHERE is_spotlight = 1', (err, teacher) => {
        if (err) {
            console.error('Server - Error fetching spotlight teacher:', err.message);
            return res.status(500).json({ error: 'Database error' });
        }
        if (!teacher) {
            console.log('Server - No spotlight teacher found');
            return res.json({ teacherId: null, show: false, name: '', bio: '', image: '' });
        }
        console.log('Server - Spotlight teacher fetched:', teacher.id);
        res.json({
            teacherId: teacher.id,
            show: true,
            name: teacher.name,
            bio: teacher.bio,
            image: teacher.image_link || '/public/images/default-teacher.jpg',
        });
    });
});

app.get('/api/badges', publicLimiter, (req, res) => {
    db.all('SELECT id, name, description FROM badges', (err, badges) => {
        if (err) {
            console.error('Server - Error fetching badges:', err.message);
            return res.status(500).json({ error: 'Database error' });
        }
        console.log('Server - Badges fetched:', badges.length);
        res.json(badges);
    });
});

app.post('/api/admin/spotlight', authenticateAdmin, csrfProtection, (req, res) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private'); // Force no caching
    console.log('Server - POST /api/admin/spotlight received:', req.body); // Log request
    const { teacherId, isSpotlight } = req.body;
    if (!teacherId || typeof isSpotlight !== 'boolean') {
        return res.status(400).json({ error: 'teacherId and isSpotlight (boolean) required' });
    }

    db.serialize(() => {
        if (isSpotlight) {
            db.run('UPDATE teachers SET is_spotlight = 0 WHERE is_spotlight = 1', (err) => {
                if (err) {
                    console.error('Server - Error clearing spotlight:', err.message);
                    return res.status(500).json({ error: 'Database error clearing spotlight' });
                }
            });
        }
        db.run('UPDATE teachers SET is_spotlight = ? WHERE id = ?', [isSpotlight ? 1 : 0, teacherId], function(err) {
            if (err) {
                console.error('Server - Error updating spotlight:', err.message);
                return res.status(500).json({ error: 'Database error updating spotlight' });
            }
            if (this.changes === 0) {
                return res.status(404).json({ error: 'Teacher not found' });
            }
            console.log('Server - Spotlight updated successfully:', { teacherId, isSpotlight });
            res.status(200).json({ message: `Teacher ${isSpotlight ? 'set as' : 'unset from'} spotlight`, teacherId });
        });
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
            req.session.user = { id: this.lastID, username: username, isAdmin: false };
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

    db.get('SELECT id, username, email, points, last_login FROM users WHERE id = ?', [userId], (err, user) => {
        if (err) {
            console.error('Server - Error fetching user:', err.message);
            return res.status(500).json({ error: 'Database error' });
        }
        if (!user) return res.status(404).json({ error: 'User not found' });

        // Fetch user badges
        db.all('SELECT ub.badge_name, ub.created_at FROM user_badges ub WHERE ub.user_id = ?', [userId], (err, badges) => {
            if (err) {
                console.error('Server - Error fetching badges:', err.message);
                return res.status(500).json({ error: 'Database error' });
            }

            // Handle login streak
            const today = new Date().toISOString().split('T')[0];
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            const yesterdayISO = yesterday.toISOString().split('T')[0];
            const lastLogin = user.last_login ? user.last_login.split('T')[0] : null;

            const handleLoginStreak = (callback) => {
                if (lastLogin === yesterdayISO) {
                    updateUserPoints(userId, 5, 'Login streak bonus', db, (err) => {
                        if (err) {
                            console.error('Server - Error awarding streak points:', err.message);
                            return callback(err);
                        }
                        // Update last_login and fetch updated user data
                        db.run('UPDATE users SET last_login = ? WHERE id = ?', [new Date().toISOString(), userId], (err) => {
                            if (err) return callback(err);
                            db.get('SELECT id, username, email, points FROM users WHERE id = ?', [userId], (err, updatedUser) => {
                                if (err) return callback(err);
                                callback(null, updatedUser);
                            });
                        });
                    });
                } else {
                    // Just update last_login if no streak
                    db.run('UPDATE users SET last_login = ? WHERE id = ?', [Date.now(), userId], (err) => {
                        if (err) return callback(err);
                        callback(null, user);
                    });
                }
            };

            handleLoginStreak((err, updatedUser) => {
                if (err) return res.status(500).json({ error: 'Login streak error' });
                res.json({ ...updatedUser, badges });
            });
        });
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
        res.json({ message: 'Login successful', isAdmin: false }); // Include isAdmin in response
    });
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

function updateTeacherStats(teacherId) {
    db.all('SELECT rating FROM votes WHERE teacher_id = ?', [teacherId], (err, rows) => {
        if (err) {
            return console.error('Server - Error fetching ratings:', err.message);
        }
        const avgRating = rows.length ? rows.reduce((sum, r) => sum + r.rating, 0) / rows.length : 0;
        const ratingCount = rows.length;

        db.run('UPDATE teachers SET avg_rating = ?, rating_count = ? WHERE id = ?', [avgRating, ratingCount, teacherId], (err) => {
            if (err) {
                return console.error('Server - Error updating teacher stats:', err.message);
            }
            console.log('Server - Teacher stats updated:', { teacherId, avgRating, ratingCount });
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
            return res.redirect('/pages/user/user-dashboard.html');
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
            return res.redirect('/pages/user/user-dashboard.html');
        } catch {
            res.clearCookie('userToken');
        }
    }
    res.sendFile(path.join(__dirname, 'pages', 'signup.html'));
});

app.get('/pages/user/user-dashboard.html', authenticateUser, (req, res) => {
    if (!req.user) return res.redirect('/pages/auth/login.html');
    res.sendFile(path.join(__dirname, 'pages', 'user', 'user-dashboard.html'));
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
    // Set admin session for CSRF and dashboard persistence
    req.session.admin = { id: admin.id, username: admin.username, isAdmin: true };
    console.log('Server - Admin login successful:', username, 'Token:', token);
    res.json({ message: 'Login successful', isAdmin: true });
  });
});

app.get('/pages/admin/admin-dashboard.html', authenticateAdmin, (req, res) => {
    res.sendFile(path.join(__dirname, 'pages', 'admin', 'admin-dashboard.html'));
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
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required' });
    }

    // Check if username already exists in admins table
    db.get('SELECT * FROM admins WHERE username = ?', [username], (err, row) => {
        if (err) {
            console.error('Server - Error checking admin existence:', err.message);
            return res.status(500).json({ error: 'Database error' });
        }
        if (row) {
            return res.status(400).json({ error: 'Username already taken' });
        }

        // Hash password and insert admin
        bcrypt.hash(password, 10, (err, hash) => {
            if (err) {
                console.error('Server - Error hashing password:', err.message);
                return res.status(500).json({ error: 'Password hashing failed' });
            }

            db.run(
                'INSERT INTO admins (username, password_hash) VALUES (?, ?)',
                [username, hash],
                function (err) {
                    if (err) {
                        console.error('Server - Error creating admin:', err.message);
                        return res.status(500).json({ error: 'Database error' });
                    }
                    console.log('Server - Admin created:', { username });
                    res.status(201).json({ message: 'Admin created successfully', username });
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


app.get('/api/admin/spotlight', authenticateAdmin, (req, res) => {
    db.get('SELECT id, name, bio, image_link FROM teachers WHERE is_spotlight = 1', (err, teacher) => {
        if (err) {
            console.error('Server - Error fetching spotlight teacher for admin:', err.message);
            return res.status(500).json({ error: 'Database error' });
        }
        if (!teacher) {
            return res.json({ teacherId: null, name: '', bio: '', image: '/public/images/default-teacher.jpg' });
        }
        res.json({
            teacherId: teacher.id,
            name: teacher.name,
            bio: teacher.bio,
            image: teacher.image_link || '/public/images/default-teacher.jpg',
        });
    });
});

app.post('/api/vote', authenticateUser, csrfProtection, async (req, res) => {
    const { teacher_id, rating, comment } = req.body;
    const userId = req.user.id;

    if (!teacher_id || !rating || rating < 1 || rating > 5) {
        return res.status(400).json({ error: 'Teacher ID and rating (1-5) are required' });
    }

    try {
        // Check for existing vote
        const existingVote = await new Promise((resolve, reject) => {
            db.get('SELECT * FROM votes WHERE teacher_id = ? AND user_id = ?', [teacher_id, userId], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
        if (existingVote) return res.status(403).json({ error: 'Already voted' });

        // Verify teacher exists
        const teacher = await new Promise((resolve, reject) => {
            db.get('SELECT name FROM teachers WHERE id = ?', [teacher_id], (err, row) => {
                if (err) reject(err);
                else if (!row) reject(new Error('Teacher not found'));
                else resolve(row);
            });
        });

        // Filter comment
        const { cleanedComment, isExplicit } = filterComment(comment);

        // Insert vote
        await new Promise((resolve, reject) => {
            db.run(
                'INSERT INTO votes (teacher_id, rating, comment, user_id, is_explicit) VALUES (?, ?, ?, ?, ?)',
                [teacher_id, rating, cleanedComment || null, userId, isExplicit ? 1 : 0],
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });

        // Award points for voting
        await new Promise((resolve, reject) => {
            updateUserPoints(userId, 2, `Voted for ${teacher.name}`, db, (err) => {
                if (err) {
                    console.error('Server - Failed to award vote points:', err.message);
                    reject(err);
                } else {
                    console.log('Server - Points awarded for vote');
                    resolve();
                }
            });
        });

        // Check and award badges after voting
        await checkAndAwardBadges(userId);

        // Get user's current badges
        const userBadges = await new Promise((resolve, reject) => {
            db.all('SELECT badge_name FROM user_badges WHERE user_id = ?', [userId], (err, rows) => {
                if (err) reject(err);
                else resolve(rows.map(row => row.badge_name));
            });
        });

        // Update teacher stats
        await updateTeacherStats(teacher_id, res);

        // Check vote-based badges
        const voteCount = await new Promise((resolve, reject) => {
            db.get('SELECT COUNT(*) as count FROM votes WHERE user_id = ?', [userId], (err, row) => {
                if (err) reject(err);
                else resolve(row.count);
            });
        });
        if (voteCount === 1) await awardBadge(userId, 1, 'First Vote');
        if (voteCount === 5) await awardBadge(userId, 4, 'Frequent Voter', 5);
        if (voteCount === 10) await awardBadge(userId, 5, 'Voting Veteran', 10);
        await checkEngagedContributor(userId);

        // Update teacher stats and respond
        updateTeacherStats(teacher_id, res);
    } catch (err) {
        console.error('Server - Error in /api/vote:', err.message);
        res.status(500).json({ error: 'Database error' });
    }
});

// Helper function to award badges
function awardBadge(userId, badgeId, badgeName) {
    db.run('INSERT OR IGNORE INTO user_badges (user_id, badge_name) VALUES (?, ?)', [userId, badgeName], (err) => {
        if (err) console.error('Server - Error awarding badge:', err.message);
        else console.log('Server - Badge awarded:', { userId, badgeName });
    });
}

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

    db.get('SELECT user_id FROM teacher_proposals WHERE id = ?', [submissionId], (err, submission) => {
        if (err || !submission) {
            console.error('Server - Error fetching submission:', err?.message);
            return res.status(404).json({ error: 'Submission not found' });
        }
        if (approved) {
            db.get('SELECT name FROM teacher_proposals WHERE id = ?', [submissionId], (err, proposal) => {
                if (err) {
                    console.error('Server - Error fetching proposal name:', err.message);
                    return res.status(500).json({ error: 'Database error' });
                }
                db.run('UPDATE teacher_proposals SET approved = 1 WHERE id = ?', [submissionId], (err) => {
                    if (err) {
                        console.error('Server - Error approving submission:', err.message);
                        return res.status(500).json({ error: 'Database error' });
                    }
                    updateUserPoints(submission.user_id, 10, `Submitted profile for ${proposal.name}`, (err) => {
                        if (err) {
                            console.error('Server - Error updating points:', err.message);
                            return res.status(500).json({ error: 'Points update failed' });
                        }
                        res.json({ message: 'Submission processed' });
                    });
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

    db.get('SELECT * FROM teacher_proposals WHERE id = ?', [proposalId], (err, proposal) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        if (!proposal) return res.status(404).json({ error: 'Teacher proposal not found' });

        const teacherData = {
            id: proposal.id.startsWith('TEMP-') ? `T${uuidv4().slice(0, 8)}` : proposal.id,
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
            is_spotlight: 0
        };

        if (proposal.user_id) {
            updateUserPoints(proposal.user_id, 10, `Teacher proposal approved for ${proposal.name}`, db, (err) => {
                if (err) {
                    console.error('Server - Error updating points:', err.message);
                    return res.status(500).json({ error: 'Points update failed' });
                }

                // Award badge after points are successfully updated
                awardBadge(proposal.user_id, 3, 'Teacher Contributor', 5, (err) => {
                    if (err) console.error('Server - Error awarding badge:', err.message);
                });

                // Send notification
                db.run(
                    'INSERT INTO notifications (visitor_id, message, type) VALUES (?, ?, ?)',
                    [proposal.user_id, `Your teacher proposal for ${proposal.name} has been approved!`, 'success'],
                    (err) => {
                        if (err) console.error('Server - Error adding notification:', err.message);
                    }
                );

                res.json({ message: 'Teacher proposal approved', teacherId: teacherData.id });
            });
        } else {
            res.json({ message: 'Teacher proposal approved', teacherId: teacherData.id });
        }
    });
});

app.post('/api/user/theme', authenticateUser, csrfProtection, (req, res) => {
    const { theme } = req.body;
    if (!['light', 'dark'].includes(theme)) {
        return res.status(400).json({ error: 'Theme must be "light" or "dark"' });
    }
    db.run('UPDATE users SET theme = ? WHERE id = ?', [theme, req.user.id], function(err) {
        if (err) {
            console.error('Server - Error updating user theme:', err.message);
            return res.status(500).json({ error: 'Database error' });
        }
        if (this.changes === 0) return res.status(404).json({ error: 'User not found' });
        console.log('Server - User theme updated:', { userId: req.user.id, theme });
        res.json({ success: true, theme });
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