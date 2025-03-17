<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="csrf-token" content="">
    <title>Submit a Teacher - Rate Your Teachers</title>
    <link rel="stylesheet" href="/public/styles.css">
    <link rel="icon" href="/public/favicon.ico" type="image/x-icon">
</head>
<body>
    <header class="site-header">
        <div class="header-content">
            <img src="/public/images/logo.png" alt="Logo" class="logo" onclick="window.location.href='/'">
            <h1 class="header-title">Submit a Teacher</h1>
            <div class="header-buttons">
                <button class="admin-btn" onclick="window.location.href='/pages/admin/dashboard.html'">Admin Dashboard</button>
            </div>
        </div>
    </header>

    <main class="centered-container">
        <div class="content-container">
            <h2>Submit a New Teacher Proposal</h2>
            <p>Please fill out the form below to propose a new teacher. All fields are required unless marked optional.</p>
            <form id="submit-teacher-form" class="edit-form" enctype="multipart/form-data">
                <div class="form-group">
                    <label for="name">Name:</label>
                    <input type="text" id="name" name="name" required placeholder="e.g., John Doe">
                    <span class="tooltip">Full name of the teacher</span>
                </div>
                <div class="form-group">
                    <label for="email">Email:</label>
                    <input type="email" id="email" name="email" required placeholder="e.g., john.doe@example.com (Will be kept secret)">
                    <span class="tooltip">Your contact email to confirm details.</span>
                </div>
                <div class="form-group">
                    <label for="bio">Bio:</label>
                    <textarea id="bio" name="bio" required placeholder="Short biography"></textarea>
                    <span class="tooltip">Brief background about the teacher</span>
                </div>
                <div class="form-group">
                    <label for="description">Description:</label>
                    <input type="text" id="description" name="description" required placeholder="e.g., Math Teacher">
                    <span class="tooltip">Brief description (e.g., role or subject)</span>
                </div>
                <div class="form-group">
                    <label for="classes">Classes:</label>
                    <input type="text" id="classes" name="classes" required placeholder="e.g., Algebra, Calculus">
                    <span class="tooltip">Comma-separated list of classes</span>
                </div>
                <div class="form-group">
                    <label for="tags">Tags:</label>
                    <input type="text" id="tags" name="tags" required placeholder="e.g., math, stem">
                    <span class="tooltip">Comma-separated list of tags</span>
                </div>
                <div class="form-group">
                    <label for="room_number">Room Number:</label>
                    <input type="text" id="room_number" name="room_number" required placeholder="e.g., Room 101">
                    <span class="tooltip">Classroom identifier (e.g., Room 101)</span>
                </div>
                <div class="schedule-edit">
                    <label>Schedule:</label>
                    <div class="schedule-block">
                        <label>Block 1:</label>
                        <input type="text" name="schedule[0][subject]" placeholder="Subject">
                        <input type="text" name="schedule[0][grade]" placeholder="Grade">
                    </div>
                    <div class="schedule-block">
                        <label>Block 2:</label>
                        <input type="text" name="schedule[1][subject]" placeholder="Subject">
                        <input type="text" name="schedule[1][grade]" placeholder="Grade">
                    </div>
                    <div class="schedule-block">
                        <label>Block 3:</label>
                        <input type="text" name="schedule[2][subject]" placeholder="Subject">
                        <input type="text" name="schedule[2][grade]" placeholder="Grade">
                    </div>
                    <div class="schedule-block">
                        <label>Block 4:</label>
                        <input type="text" name="schedule[3][subject]" placeholder="Subject">
                        <input type="text" name="schedule[3][grade]" placeholder="Grade">
                    </div>
                    <span class="tooltip">Enter subject and grade for each block (optional)</span>
                </div>
                <div class="form-group">
                    <label for="image">Teacher Image:</label>
                    <input type="file" id="image" name="image" accept="image/jpeg, image/png">
                    <span class="tooltip">Upload a JPEG or PNG image (optional)</span>
                </div>
                <input type="hidden" id="csrf-token" name="_csrf">
                <button type="submit" class="submit-btn">Submit Proposal</button>
            </form>
            <p id="submit-message" class="info-message"></p>
        </div>
    </main>

    <footer class="site-footer">
        <p id="footer-email">Email: <a href="mailto:admin@example.com">admin@example.com</a></p>
        <p id="footer-message">Welcome to Rate Your Teachers!</p>
    </footer>

    <div id="notification" class="notification" style="display: none;"></div>

    <script>
        document.addEventListener('DOMContentLoaded', async () => {
            const form = document.getElementById('submit-teacher-form');
            const message = document.getElementById('submit-message');
            let csrfToken = null;

            // Fetch CSRF token
            async function fetchCsrfToken() {
                try {
                    const response = await fetch('/api/csrf-token', { credentials: 'include' });
                    if (!response.ok) throw new Error('Failed to fetch CSRF token');
                    const data = await response.json();
                    csrfToken = data.csrfToken;
                    document.querySelector('meta[name="csrf-token"]').content = csrfToken;
                    document.getElementById('csrf-token').value = csrfToken;
                    console.log('Client - CSRF token fetched:', csrfToken);
                } catch (error) {
                    console.error('Client - Error fetching CSRF token:', error.message);
                    showNotification('Error initializing security token', true);
                }
            }

            // Notification function
            function showNotification(messageText, isError = false) {
                const notification = document.getElementById('notification');
                notification.textContent = messageText;
                notification.className = `notification ${isError ? 'error' : 'success'}`;
                notification.style.display = 'block';
                setTimeout(() => notification.style.display = 'none', 3000);
            }

            // Validate room number
            function validateRoomNumber(roomNumber, tags) {
                const trimmedRoomNumber = roomNumber.trim();
                const trimmedTags = tags.trim();

                // Check if room_number matches tags
                if (trimmedRoomNumber === trimmedTags) {
                    return { valid: false, message: 'Room number cannot be the same as tags' };
                }

                // Check if room_number looks like a JSON array or list
                if (trimmedRoomNumber.startsWith('[') || trimmedRoomNumber.includes(',')) {
                    return { valid: false, message: 'Room number must be a single value (e.g., Room 101), not a list' };
                }

                return { valid: true };
            }

            // Form submission
            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                const formData = new FormData(form);

                // Extract room_number and tags for validation
                const roomNumber = formData.get('room_number')?.trim();
                const tags = formData.get('tags')?.trim();

                // Validate room_number
                const roomValidation = validateRoomNumber(roomNumber, tags);
                if (!roomValidation.valid) {
                    message.textContent = `Error: ${roomValidation.message}`;
                    message.className = 'error-message';
                    showNotification(roomValidation.message, true);
                    return;
                }

                // Build schedule array
                const schedule = [];
                for (let i = 0; i < 4; i++) {
                    const subject = formData.get(`schedule[${i}][subject]`)?.trim();
                    const grade = formData.get(`schedule[${i}][grade]`)?.trim();
                    if (subject || grade) {
                        schedule.push({ block: `Block ${i + 1}`, subject: subject || '', grade: grade || 'N/A' });
                    }
                }
                formData.set('schedule', JSON.stringify(schedule));
                formData.set('_csrf', csrfToken);

                try {
                    const response = await fetch('/api/teacher-proposals', {
                        method: 'POST',
                        credentials: 'include',
                        body: formData
                    });
                    const data = await response.json();
                    if (response.ok) {
                        message.textContent = 'Teacher proposal submitted successfully!';
                        message.className = 'info-message';
                        showNotification('Teacher proposal submitted successfully!');
                        form.reset();
                    } else {
                        throw new Error(data.error || 'Failed to submit proposal');
                    }
                } catch (error) {
                    console.error('Client - Error submitting teacher proposal:', error.message);
                    message.textContent = 'Error submitting proposal: ' + error.message;
                    message.className = 'error-message';
                    showNotification('Error submitting proposal: ' + error.message, true);
                }
            });

            // Fetch CSRF token on load
            await fetchCsrfToken();
        });
    </script>
</body>
</html>