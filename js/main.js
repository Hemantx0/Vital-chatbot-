
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

    // Geolocation button setup
    const geoBtn = document.querySelector('.geo-btn');
    const locationInput = document.querySelector('input[name="location"]');
    if (geoBtn && locationInput) {
        geoBtn.addEventListener('click', () => {
            geoBtn.innerHTML = "<i class='bx bx-loader-alt bx-spin'></i>";
            if ("geolocation" in navigator) {
                navigator.geolocation.getCurrentPosition(
                    (position) => {
                        const lat = position.coords.latitude;
                        const lng = position.coords.longitude;
                        // For a real app, you'd reverse geocode here using Google Maps API
                        locationInput.value = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
                        geoBtn.innerHTML = "<i class='bx bx-check-circle' style='color: var(--primary);'></i>";
                    },
                    (error) => {
                        alert("Could not detect location. Please type it in manually.");
                        geoBtn.innerHTML = "<i class='bx bx-current-location'></i>";
                    }
                );
            } else {
                alert("Geolocation is not supported by your browser.");
                geoBtn.innerHTML = "<i class='bx bx-current-location'></i>";
            }
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
