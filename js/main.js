
document.addEventListener('DOMContentLoaded', () => {
    // Navbar scroll effect
    const navbar = document.querySelector('.navbar');
    window.addEventListener('scroll', () => {
        if (window.scrollY > 50) {
            navbar.classList.add('scrolled');
        } else {
            navbar.classList.remove('scrolled');
        }
    });

    // Mobile menu toggle
    const menuToggle = document.getElementById('mobile-menu');
    const navLinks = document.querySelector('.nav-links');
    if (menuToggle && navLinks) {
        menuToggle.addEventListener('click', () => {
            navLinks.classList.toggle('active');
        });
    }

    // Route chatbot entry points to the full assistant page
    const triggerBtn = document.getElementById('chatbot-trigger');
    const heroAiTrigger = document.getElementById('hero-ai-trigger');
    const assistantPageUrl = 'chatbot.html';

    if (triggerBtn) {
        triggerBtn.addEventListener('click', () => {
            window.location.href = assistantPageUrl;
        });
    }

    if (heroAiTrigger) {
        heroAiTrigger.addEventListener('click', (e) => {
            e.preventDefault();
            window.location.href = assistantPageUrl;
        });
    }
});
