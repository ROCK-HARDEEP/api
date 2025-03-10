document.addEventListener('DOMContentLoaded', () => {
  const userInput = document.getElementById('user-input');
  if (userInput) {
    userInput.style.height = 'auto';
    userInput.style.height = Math.min(120, userInput.scrollHeight) + 'px';
    userInput.focus();
  }
  
  const prefersDarkMode = window.matchMedia('(prefers-color-scheme: dark)').matches;
  document.body.classList.toggle('dark-mode', prefersDarkMode);
  
  const logo = document.querySelector('.app-title');
  if (logo) {
    logo.addEventListener('click', () => {
      window.location.href = '/';
    });
  }
  
  const urlParams = new URLSearchParams(window.location.search);
  const categoryParam = urlParams.get('category');
  if (categoryParam && ['general', 'math', 'coding', 'philosophy'].includes(categoryParam)) {
    const categorySelect = document.getElementById('category-select');
    if (categorySelect) {
      categorySelect.value = categoryParam;
      const event = new Event('change');
      categorySelect.dispatchEvent(event);
    }
  }
  
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
    document.body.classList.toggle('dark-mode', e.matches);
  });
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && typeof chatManager !== 'undefined') {
    chatManager.loadConversations().catch(err => {
      console.error('Failed to refresh conversations:', err);
    });
  }
});

document.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.key === '/') {
    const userInput = document.getElementById('user-input');
    if (userInput) {
      e.preventDefault();
      userInput.focus();
    }
  }
  if (e.ctrlKey && e.key === 'n') {
    const newChatBtn = document.getElementById('new-chat-btn');
    if (newChatBtn) {
      e.preventDefault();
      newChatBtn.click();
    }
  }
});

const addCategoryStyles = () => {
  const styleEl = document.createElement('style');
  styleEl.innerHTML = `
    .conversation-item:hover.category-general { border-left: 3px solid var(--general-color); }
    .conversation-item:hover.category-math { border-left: 3px solid var(--math-color); }
    .conversation-item:hover.category-coding { border-left: 3px solid var(--coding-color); }
    .conversation-item:hover.category-philosophy { border-left: 3px solid var(--philosophy-color); }
    body.category-general .new-chat-btn { background-color: var(--general-color); }
    body.category-math .new-chat-btn { background-color: var(--math-color); }
    body.category-coding .new-chat-btn { background-color: var(--coding-color); }
    body.category-philosophy .new-chat-btn { background-color: var(--philosophy-color); }
    body.category-general .category-selector label i { color: var(--general-color); }
    body.category-math .category-selector label i { color: var(--math-color); }
    body.category-coding .category-selector label i { color: var(--coding-color); }
    body.category-philosophy .category-selector label i { color: var(--philosophy-color); }
  `;
  document.head.appendChild(styleEl);
};

const enhanceSendButton = () => {
  const sendBtn = document.getElementById('send-btn');
  if (sendBtn) {
    const originalHTML = sendBtn.innerHTML;
    const setLoading = (isLoading) => {
      if (isLoading) {
        sendBtn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i>';
        sendBtn.setAttribute('disabled', 'disabled');
      } else {
        sendBtn.innerHTML = originalHTML;
        sendBtn.removeAttribute('disabled');
      }
    };
    window.setSendButtonLoading = setLoading;
  }
};

document.addEventListener('DOMContentLoaded', () => {
  addCategoryStyles();
  enhanceSendButton();
});