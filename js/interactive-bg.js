/**
 * Interactive Background Effects
 * - Floating particles on canvas
 * - Mouse-following glow
 * - Click ripple effects
 * - Parallax orbs on mouse move
 */


document.addEventListener('DOMContentLoaded', () => {

    // ===== 1. PARTICLE SYSTEM ON CANVAS =====
    const canvas = document.getElementById('particles-canvas');
    if (canvas) {
        const ctx = canvas.getContext('2d');
        let particles = [];
        let mouse = { x: null, y: null };
        let animationFrameId;

        function resizeCanvas() {
            const hero = document.getElementById('hero-section');
            if (hero) {
                canvas.width = hero.offsetWidth;
                canvas.height = hero.offsetHeight;
            }
        }

        resizeCanvas();
        window.addEventListener('resize', resizeCanvas);

        class Particle {
            constructor() {
                this.reset();
            }

            reset() {
                this.x = Math.random() * canvas.width;
                this.y = Math.random() * canvas.height;
                this.size = Math.random() * 3 + 1;
                this.speedX = (Math.random() - 0.5) * 0.8;
                this.speedY = (Math.random() - 0.5) * 0.8;
                this.opacity = Math.random() * 0.5 + 0.1;
                this.maxOpacity = this.opacity;
                // Blue color with varying saturation
                const blueVariant = Math.floor(Math.random() * 3);
                if (blueVariant === 0) {
                    this.color = `rgba(37, 99, 235, ${this.opacity})`; // Primary blue
                } else if (blueVariant === 1) {
                    this.color = `rgba(96, 165, 250, ${this.opacity})`; // Light blue
                } else {
                    this.color = `rgba(147, 197, 253, ${this.opacity})`; // Sky blue
                }
            }

            update() {
                this.x += this.speedX;
                this.y += this.speedY;

                // Mouse interaction — particles gently move away from cursor
                if (mouse.x !== null && mouse.y !== null) {
                    const dx = mouse.x - this.x;
                    const dy = mouse.y - this.y;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    if (dist < 120) {
                        const force = (120 - dist) / 120;
                        this.x -= dx * force * 0.02;
                        this.y -= dy * force * 0.02;
                        this.opacity = Math.min(this.maxOpacity + 0.3, 0.8);
                    } else {
                        this.opacity += (this.maxOpacity - this.opacity) * 0.05;
                    }
                }

                // Wrap around edges
                if (this.x > canvas.width + 10) this.x = -10;
                if (this.x < -10) this.x = canvas.width + 10;
                if (this.y > canvas.height + 10) this.y = -10;
                if (this.y < -10) this.y = canvas.height + 10;
            }

            draw() {
                ctx.beginPath();
                ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
                ctx.fillStyle = this.color.replace(/[\d.]+\)$/, `${this.opacity})`);
                ctx.fill();
            }
        }

        // Create particles
        function initParticles() {
            particles = [];
            const count = Math.min(Math.floor((canvas.width * canvas.height) / 8000), 100);
            for (let i = 0; i < count; i++) {
                particles.push(new Particle());
            }
        }

        // Draw connections between nearby particles
        function drawConnections() {
            for (let i = 0; i < particles.length; i++) {
                for (let j = i + 1; j < particles.length; j++) {
                    const dx = particles[i].x - particles[j].x;
                    const dy = particles[i].y - particles[j].y;
                    const dist = Math.sqrt(dx * dx + dy * dy);

                    if (dist < 150) {
                        const opacity = (1 - dist / 150) * 0.15;
                        ctx.beginPath();
                        ctx.strokeStyle = `rgba(37, 99, 235, ${opacity})`;
                        ctx.lineWidth = 0.5;
                        ctx.moveTo(particles[i].x, particles[i].y);
                        ctx.lineTo(particles[j].x, particles[j].y);
                        ctx.stroke();
                    }
                }
            }
        }

        function animateParticles() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            particles.forEach(p => {
                p.update();
                p.draw();
            });

            drawConnections();
            animationFrameId = requestAnimationFrame(animateParticles);
        }

        // Track mouse on hero section
        const heroSection = document.getElementById('hero-section');
        if (heroSection) {
            heroSection.addEventListener('mousemove', (e) => {
                const rect = canvas.getBoundingClientRect();
                mouse.x = e.clientX - rect.left;
                mouse.y = e.clientY - rect.top;
            });

            heroSection.addEventListener('mouseleave', () => {
                mouse.x = null;
                mouse.y = null;
            });
        }

        initParticles();
        animateParticles();

        // Re-init on resize
        window.addEventListener('resize', () => {
            resizeCanvas();
            initParticles();
        });
    }


    // ===== 2. MOUSE GLOW EFFECT =====
    const mouseGlow = document.getElementById('mouse-glow');
    if (mouseGlow) {
        let glowTimeout;

        document.addEventListener('mousemove', (e) => {
            mouseGlow.style.left = e.clientX + 'px';
            mouseGlow.style.top = e.clientY + 'px';
            mouseGlow.classList.add('visible');

            clearTimeout(glowTimeout);
            glowTimeout = setTimeout(() => {
                mouseGlow.classList.remove('visible');
            }, 2000);
        });
    }


    // ===== 3. CLICK RIPPLE EFFECT =====
    const heroSection = document.getElementById('hero-section');
    if (heroSection) {
        heroSection.addEventListener('click', (e) => {
            // Don't ripple on buttons/inputs
            if (e.target.closest('button, input, a, .glass-card')) return;

            const ripple = document.createElement('div');
            ripple.classList.add('ripple');
            ripple.style.left = e.clientX + 'px';
            ripple.style.top = e.clientY + 'px';
            document.body.appendChild(ripple);

            ripple.addEventListener('animationend', () => {
                ripple.remove();
            });
        });
    }


    // ===== 4. PARALLAX ON MOUSE MOVE =====
    const orbs = document.querySelectorAll('.floating-orb');
    const geoShapes = document.querySelectorAll('.geo-shape');

    if (orbs.length > 0 || geoShapes.length > 0) {
        document.addEventListener('mousemove', (e) => {
            const x = (e.clientX / window.innerWidth - 0.5) * 2;
            const y = (e.clientY / window.innerHeight - 0.5) * 2;

            orbs.forEach((orb, i) => {
                const depth = (i + 1) * 8;
                orb.style.transform = `translate(${x * depth}px, ${y * depth}px)`;
            });

            geoShapes.forEach((shape, i) => {
                const depth = (i + 1) * 5;
                const baseTransform = shape.style.getPropertyValue('--base-transform') || '';
                shape.style.transform = `${baseTransform} translate(${x * depth}px, ${y * depth}px)`;
            });
        });
    }


    // ===== 5. SCROLL-TRIGGERED ANIMATIONS =====
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('animate-in');
                observer.unobserve(entry.target);
            }
        });
    }, observerOptions);

    // Observe feature cards for staggered animation
    document.querySelectorAll('.feature-card').forEach((card, i) => {
        card.style.opacity = '0';
        card.style.transform = 'translateY(30px)';
        card.style.transition = `all 0.6s cubic-bezier(0.4, 0, 0.2, 1) ${i * 0.15}s`;
        observer.observe(card);
    });

    // Observe stats
    document.querySelectorAll('.stat').forEach((stat, i) => {
        stat.style.opacity = '0';
        stat.style.transform = 'translateY(20px)';
        stat.style.transition = `all 0.5s ease ${i * 0.1 + 0.3}s`;
        observer.observe(stat);
    });


    // ===== 6. ANIMATED COUNTER FOR STATS =====
    function animateCounter(element, target, suffix = '') {
        let current = 0;
        const increment = target / 60;
        const timer = setInterval(() => {
            current += increment;
            if (current >= target) {
                current = target;
                clearInterval(timer);
            }
            if (suffix === 'K+') {
                element.textContent = Math.floor(current) + 'K+';
            } else if (suffix === '/7') {
                element.textContent = '24/7';
            } else {
                element.textContent = Math.floor(current) + suffix;
            }
        }, 16);
    }

    // Trigger counter animation when stats come into view
    const statsObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const numbers = entry.target.querySelectorAll('.number');
                numbers.forEach(num => {
                    const text = num.textContent;
                    if (text.includes('K+')) {
                        const val = parseInt(text);
                        num.textContent = '0K+';
                        animateCounter(num, val, 'K+');
                    } else if (text === '24/7') {
                        animateCounter(num, 24, '/7');
                    }
                });
                statsObserver.unobserve(entry.target);
            }
        });
    }, { threshold: 0.5 });

    const heroStats = document.querySelector('.hero-stats');
    if (heroStats) {
        statsObserver.observe(heroStats);
    }


    // ===== 7. TILT EFFECT ON MOCKUP CARD =====
    const mockupCard = document.querySelector('.mockup-card');
    if (mockupCard) {
        mockupCard.addEventListener('mousemove', (e) => {
            const rect = mockupCard.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            const centerX = rect.width / 2;
            const centerY = rect.height / 2;

            const rotateX = (y - centerY) / centerY * -8;
            const rotateY = (x - centerX) / centerX * 8;

            mockupCard.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateY(-5px)`;
        });

        mockupCard.addEventListener('mouseleave', () => {
            mockupCard.style.transform = 'perspective(1000px) rotateY(-5deg) rotateX(5deg)';
        });
    }
});

// Animate-in class for intersection observer
document.addEventListener('DOMContentLoaded', () => {
    const style = document.createElement('style');
    style.textContent = `
        .animate-in {
            opacity: 1 !important;
            transform: translateY(0) !important;
        }
    `;
    document.head.appendChild(style);
});
