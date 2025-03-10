document.addEventListener('DOMContentLoaded', () => {
    const submitForm = document.getElementById('teacher-submit-form');
    const submitMessage = document.getElementById('submit-message');
    const notification = document.getElementById('notification');

    if (!submitForm || !submitMessage || !notification) {
        console.error('Client - Required elements for submit teacher page not found');
        return;
    }

    function showNotification(messageText, isError = false) {
        notification.textContent = messageText;
        notification.style.display = 'block';
        notification.style.backgroundColor = isError ? '#FF0000' : '#00B7D1';
        setTimeout(() => notification.style.display = 'none', 3000);
    }

    submitForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(submitForm);
        const schedule = [];
        for (let i = 0; i < 4; i++) {
            const subject = formData.get(`schedule[${i}][subject]`);
            const grade = formData.get(`schedule[${i}][grade]`);
            if (subject || grade) {
                schedule.push({ block: `Block ${i + 1}`, subject: subject || '', grade: grade || 'N/A' });
            }
        }
        const teacherData = {
            name: formData.get('name'),
            bio: formData.get('bio'),
            description: formData.get('description'),
            classes: formData.get('classes').split(',').map(c => c.trim()),
            tags: formData.get('tags').split(',').map(t => t.trim()),
            room_number: formData.get('room_number'),
            email: formData.get('email'),
            schedule: schedule,
            image_link: formData.get('image_link') || ''
        };

        try {
            const response = await fetch('/api/teacher-proposals', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(teacherData)
            });
            const data = await response.json();
            if (response.ok) {
                submitMessage.textContent = 'Teacher proposal submitted successfully! Awaiting admin approval.';
                submitMessage.className = 'info-message';
                showNotification('Proposal submitted!');
                submitForm.reset();
            } else {
                throw new Error(data.error || 'Failed to submit proposal');
            }
        } catch (error) {
            console.error('Client - Error submitting teacher proposal:', error.message);
            submitMessage.textContent = 'Error submitting proposal.';
            submitMessage.className = 'error-message';
            showNotification('Error submitting proposal.', true);
        }
    });
});