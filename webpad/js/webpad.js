// A tiny localStorage demo: whatever you type persists across visits.
const STORAGE_KEY = 'webpad';

document.addEventListener('DOMContentLoaded', () => {
    const pad = document.getElementById('textInput');

    pad.value = localStorage.getItem(STORAGE_KEY) || '';

    pad.addEventListener('input', () => {
        localStorage.setItem(STORAGE_KEY, pad.value);
    });
});
