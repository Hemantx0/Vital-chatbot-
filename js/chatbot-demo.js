document.addEventListener('DOMContentLoaded', () => {
    const promptChips = document.querySelectorAll('.prompt-chip');
    const inputField = document.getElementById('chat-input-field');
    const sendBtn = document.getElementById('chat-send-btn');

    promptChips.forEach((chip) => {
        chip.addEventListener('click', () => {
            if (!inputField) return;
            inputField.value = chip.dataset.prompt || '';
            inputField.focus();
        });
    });

    const autoFillButton = document.querySelector('.assistant-actions .btn-primary');
    if (autoFillButton && inputField) {
        autoFillButton.addEventListener('click', () => {
            setTimeout(() => inputField.focus(), 120);
        });
    }

    const stepCards = document.querySelectorAll('.step-card');
    if (inputField) {
        inputField.addEventListener('focus', () => {
            stepCards.forEach((card, index) => card.classList.toggle('active', index === 0));
        });
    }

    if (sendBtn && inputField) {
        sendBtn.addEventListener('click', () => {
            stepCards.forEach((card, index) => card.classList.toggle('active', index === 1));
        });
    }
});
