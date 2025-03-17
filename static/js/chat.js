class ChatManager {
    constructor() {
        this.chatContainer = document.getElementById('chat-container');
        this.userInput = document.getElementById('user-input');
        this.sendBtn = document.getElementById('send-btn');
        this.categorySelect = document.getElementById('category-select');
        this.conversationsList = document.getElementById('conversations-list');
        this.welcomeMessage = document.getElementById('welcome-message');
  
        this.userMessageTemplate = document.getElementById('user-message-template');
        this.botMessageTemplate = document.getElementById('bot-message-template');
        this.loadingTemplate = document.getElementById('loading-template');
  
        this.currentCategory = 'general';
        this.markdownParser = window.markdownit({
            highlight: function (code, language) {
                if (language && hljs.getLanguage(language)) {
                    try {
                        return hljs.highlight(code, { language }).value;
                    } catch (error) { }
                }
                return hljs.highlightAuto(code).value;
            },
            linkify: true,
            breaks: true
        });
  
        this.isProcessing = false;
        
        // Add streaming control properties
        this.streamingBuffer = "";
        this.streamingInterval = null;
        
        // Add responsive sidebar properties
        this.sidebar = document.getElementById('sidebar');
        this.sidebarToggle = document.getElementById('sidebar-toggle');
        this.chatInterface = document.getElementById('chat-interface');
        this.isSidebarVisible = true;
        
        // Add scroll control properties
        this.userScrolledUp = false;
        this.lastScrollPosition = 0;
        this.scrollThreshold = 100; // pixels from bottom to consider "scrolled up"
  
        this.initialize();
    }
  
    async initialize() {
        const urlParams = new URLSearchParams(window.location.search);
        const categoryParam = urlParams.get('category');
        if (categoryParam && ['general', 'math', 'coding', 'philosophy'].includes(categoryParam)) {
            this.currentCategory = categoryParam;
        } else {
            const storedCategory = localStorage.getItem('selectedCategory');
            if (storedCategory) {
                this.currentCategory = storedCategory;
            }
        }
  
        this.categorySelect.value = this.currentCategory;
  
        await this.loadCategories();
        await this.loadChatHistory();
        await this.loadConversations();
  
        this.setupEventListeners();
        this.setupScrollDetection();
        this.updateUIState();
        this.addScrollToBottomButton();
        
        // Initialize sidebar based on screen size
        this.checkScreenSize();
    }
    
    // Improved scroll detection that properly respects user scrolling during streaming
setupScrollDetection() {
    // Monitor user scrolling to detect when they've scrolled up
    this.chatContainer.addEventListener('scroll', () => {
        const scrollPosition = this.chatContainer.scrollTop;
        const maxScroll = this.chatContainer.scrollHeight - this.chatContainer.clientHeight;
        
        // Detect scroll direction
        const isScrollingUp = scrollPosition < this.lastScrollPosition;
        
        // Consider user as "scrolled up" if they're not near the bottom and scrolling up
        if (isScrollingUp && (maxScroll - scrollPosition) > this.scrollThreshold) {
            this.userScrolledUp = true;
            // Show the scroll-to-bottom button when user scrolls up
            const scrollButton = document.getElementById('scroll-to-bottom');
            if (scrollButton) scrollButton.style.display = 'block';
        }
        
        // Reset "scrolled up" state if user manually scrolls to (near) bottom
        if ((maxScroll - scrollPosition) < 30) {
            this.userScrolledUp = false;
            // Hide the scroll-to-bottom button when at bottom
            const scrollButton = document.getElementById('scroll-to-bottom');
            if (scrollButton) scrollButton.style.display = 'none';
        }
        
        this.lastScrollPosition = scrollPosition;
    });
}
  
    async loadCategories() {
        try {
            this.categorySelect.addEventListener('change', () => {
                this.currentCategory = this.categorySelect.value;
                localStorage.setItem('selectedCategory', this.currentCategory);
                this.updateUIForCategory(this.currentCategory);
            });
            this.updateUIForCategory(this.currentCategory);
        } catch (error) {
            console.error('Failed to set up categories:', error);
        }
    }
  
    updateUIForCategory(category) {
        document.body.classList.remove('category-general', 'category-math', 'category-coding', 'category-philosophy');
        document.body.classList.add(`category-${category}`);
        const categoryName = apiService.getCategoryName(category);
        this.userInput.placeholder = `Ask the ${categoryName || 'Assistant'}...`;
        const categoryIcon = this.getCategoryIcon(category);
        const iconElement = document.querySelector('.category-selector label i');
        if (iconElement) {
            iconElement.className = categoryIcon;
        }
    }
  
    getCategoryIcon(category) {
      // Return image paths instead of Font Awesome classes
      switch (category) {
          case 'math': return '<img src="/static/img/wlcopy.png" alt="Math Expert" class="category-icon">';
          case 'coding': return '<img src="static/img/wlcopy.png" alt="Code Assistant" class="category-icon">';
          case 'philosophy': return '<img src="static/img/wlcopy.png" alt="Deep Thinker" class="category-icon">';
          default: return '<img src="static/img/wlcopy.png" alt="General Assistant" class="category-icon">';
      }
    }
  
    async loadChatHistory() {
        try {
            const chatHistory = await apiService.getChatHistory();
            if (chatHistory.messages && chatHistory.messages.length > 0) {
                this.welcomeMessage.style.display = 'none';
                if (chatHistory.category) {
                    this.currentCategory = chatHistory.category;
                    this.categorySelect.value = this.currentCategory;
                    this.updateUIForCategory(this.currentCategory);
                }
                chatHistory.messages.forEach(message => {
                    if (message.role === 'user') {
                        this.addUserMessage(message.content);
                    } else {
                        this.addBotMessage(message.content, message.category || this.currentCategory);
                    }
                });
  
                // Apply consistent styling after chat history is loaded
                this.applyConsistentStyling();
                this.fixMessageLayout();
            }
        } catch (error) {
            console.error('Failed to load chat history:', error);
        }
    }
  
    async loadConversations() {
        try {
            const conversations = await apiService.getAllChats();
            this.conversationsList.innerHTML = '';
            conversations.forEach(chat => {
                const li = document.createElement('li');
                li.className = 'conversation-item';
                if (chat.id === apiService.sessionId) {
                    li.classList.add('active');
                }
                if (chat.category) {
                    li.classList.add(`category-${chat.category}`);
                }
                const categoryIcon = this.getCategoryIcon(chat.category || 'general');
                
                li.innerHTML = `
                      <div class="conversation-title">
                      ${categoryIcon} ${chat.title}
                      </div>
                      <button class="delete-chat-btn" data-id="${chat.id}">
                      <i class="fas fa-trash"></i>
                      </button>
                      `;
                li.addEventListener('click', (e) => {
                    if (!e.target.closest('.delete-chat-btn')) {
                        this.switchConversation(chat.id);
                    }
                });
                const deleteBtn = li.querySelector('.delete-chat-btn');
                deleteBtn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    await this.deleteConversation(chat.id);
                });
                this.conversationsList.appendChild(li);
            });
        } catch (error) {
            console.error('Failed to load conversations:', error);
        }
    }
  
    setupEventListeners() {
        this.sendBtn.addEventListener('click', () => this.sendMessage());
        this.userInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });
        this.userInput.addEventListener('input', () => {
            this.userInput.style.height = 'auto';
            this.userInput.style.height = Math.min(120, this.userInput.scrollHeight) + 'px';
            this.updateUIState();
        });
        document.getElementById('new-chat-btn').addEventListener('click', async () => {
            await this.startNewChat();
        });
  
        // Listen for changes in the chat container to apply consistent styling
        const observer = new MutationObserver(() => {
            this.applyConsistentStyling();
            this.fixMessageLayout();
        });
        observer.observe(this.chatContainer, { childList: true, subtree: true });
        
        // Add sidebar responsive functionality
        if (this.sidebarToggle) {
            this.sidebarToggle.addEventListener('click', () => {
                this.toggleSidebar();
            });
        }
        
        const sidebarClose = document.getElementById('sidebar-close');
        if (sidebarClose) {
            sidebarClose.addEventListener('click', () => {
                this.toggleSidebar();
            });
        }
        
        // Listen for screen size changes
        window.addEventListener('resize', () => {
            this.checkScreenSize();
        });
        
        // Add a keyboard shortcut (Escape) to cancel AI response generation
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isProcessing) {
                console.log('Attempting to cancel AI response...');
                // TODO: Add cancel functionality if API supports it
            }
        });
    }
  
    updateUIState() {
        this.sendBtn.disabled = this.userInput.value.trim() === '' || this.isProcessing;
        if (this.isProcessing) {
            this.userInput.setAttribute('disabled', 'disabled');
        } else {
            this.userInput.removeAttribute('disabled');
            this.userInput.focus();
        }
    }
  
    addUserMessage(message) {
        const messageNode = this.userMessageTemplate.content.cloneNode(true);
        const messageText = messageNode.querySelector('.message-text');
        
        this.renderUserMessageContent(messageText, message);
  
        this.chatContainer.appendChild(messageNode);
        this.scrollToBottom();
    }
  
    renderUserMessageContent(messageTextElement, message) {
        // Render Markdown for User Message
        messageTextElement.innerHTML = this.markdownParser.render(message);
  
        // Syntax Highlighting for Code Blocks in User Message
        const codeBlocks = messageTextElement.querySelectorAll('pre code');
        codeBlocks.forEach(block => {
            hljs.highlightElement(block);
        });
  
        // Keyword Highlighting in User Message
        this.highlightKeywords(messageTextElement);
    }
  
    /**
     * Highlight important keywords in user messages.
     * @param {HTMLElement} messageElement - The message content element
     */
    highlightKeywords(messageElement) {
        const keywords = ['RM', 'you', 'your', 'solve', 'write', 'explain', 'calculate',  // Example Keywords - Expand this list
            'General Assistant', 'Math Expert', 'Code Assistant', 'Deep Thinker', // Category names
        ];
        let textContent = messageElement.innerHTML; // Use innerHTML to preserve markdown rendering
  
        keywords.forEach(keyword => {
            // Create a regex to find keywords, case-insensitive, and whole word only to avoid partial matches within words.
            const regex = new RegExp(`\\b(${keyword})\\b`, 'gi'); // \\b for word boundary
  
            textContent = textContent.replace(regex, '<span class="highlight-keyword">$1</span>');
        });
        messageElement.innerHTML = textContent; // Set back modified innerHTML
    }
  
    // Enhanced bot message with better code formatting and consistent layout
    addBotMessage(message, category = 'general') {
        const messageNode = this.botMessageTemplate.content.cloneNode(true);
        const messageElement = messageNode.querySelector('.message');
        const messageAvatar = messageNode.querySelector('.message-avatar');
        const messageText = messageNode.querySelector('.message-text');
        const codeDisplayArea = messageNode.querySelector('.code-display-area');
        const messageSource = messageNode.querySelector('.message-source');
  
        messageAvatar.innerHTML = this.getCategoryIcon(category);
        messageElement.classList.add(`category-${category}`);
  
        // Parse and render content with consistent layout
        this.parseAndRenderContent(message, messageText, codeDisplayArea);
  
        if (messageSource) {
            messageSource.style.display = 'none';
        }
  
        this.chatContainer.appendChild(messageNode);
  
        // Apply syntax highlighting
        setTimeout(() => {
            this.applyCodeHighlighting(messageElement);
            this.setupCopyButtons(messageElement);
        }, 0);
  
        this.scrollToBottom();
        this.fixMessageLayout();
    }
  
    // Method to parse and render content consistently
    parseAndRenderContent(content, textElement, codeElement) {
        let regularText = '';
        let codeText = '';
        let inCodeBlock = false;
        
        const lines = content.split('\n');
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            
            // Check for code block markers
            if (line.trim().startsWith('```')) {
                if (inCodeBlock) {
                    // End of code block
                    codeText += line + '\n';
                    inCodeBlock = false;
                    
                    // Render this code block
                    const codeBlock = this.renderCodeBlock(codeText);
                    codeElement.appendChild(codeBlock);
                    codeText = '';
                } else {
                    // Start of code block
                    inCodeBlock = true;
                    codeText += line + '\n';
                }
            } else if (inCodeBlock) {
                // Within code block
                codeText += line + '\n';
            } else {
                // Regular text
                regularText += line + '\n';
            }
        }
        
        // Render any remaining regular text with markdown
        if (regularText.trim()) {
            textElement.innerHTML = this.markdownParser.render(regularText);
        }
    }

    // Fix message layout to ensure avatar is at the top left
    fixMessageLayout() {
        // Find all messages and ensure they have proper structure
        const messages = document.querySelectorAll('.message');
        messages.forEach(message => {
            // Make sure avatar is at the top
            const avatar = message.querySelector('.message-avatar');
            const content = message.querySelector('.message-content');
            
            if (avatar && content) {
                // Ensure avatar is the first child
                if (message.firstChild !== avatar) {
                    message.insertBefore(avatar, message.firstChild);
                }
                
                // Make sure content is right after avatar
                if (avatar.nextSibling !== content) {
                    message.insertBefore(content, avatar.nextSibling);
                }
            }
        });
    }
    
    // Apply consistent styling for all messages
    applyConsistentStyling() {
        // Apply consistent font size and spacing to all message elements
        const allMessages = this.chatContainer.querySelectorAll('.message');
        allMessages.forEach(message => {
            // Ensure message text has consistent width
            const messageText = message.querySelector('.message-text');
            if (messageText) {
                messageText.style.display = 'block';
                messageText.style.width = '100%';
            }

            // Ensure code blocks have consistent styling
            const codeBlocks = message.querySelectorAll('pre, .code-display-area pre');
            codeBlocks.forEach(pre => {
                pre.style.margin = '10px 0';
                pre.style.borderRadius = '8px';
                pre.style.overflow = 'auto';
            });
            
            // Remove any remaining cursor elements in non-streaming messages
            if (!message.classList.contains('streaming-message')) {
                const cursors = message.querySelectorAll('.cursor');
                cursors.forEach(cursor => cursor.remove());
            }
        });
    }

    // Apply code highlighting consistently
    applyCodeHighlighting(messageElement) {
        const codeBlocks = messageElement.querySelectorAll('.code-display-area pre code');
        codeBlocks.forEach(block => {
            try {
                hljs.highlightElement(block);
            } catch (error) {
                console.error('Failed to highlight code block:', error);
            }
        });
    }

    // Set up copy buttons for code blocks
    setupCopyButtons(messageElement) {
        const codeBlocks = messageElement.querySelectorAll('.code-display-area pre');
        codeBlocks.forEach(pre => {
            if (!pre.querySelector('.copy-code-btn')) {
                const codeElement = pre.querySelector('code');
                const copyButton = document.createElement('button');
                copyButton.className = 'copy-code-btn';
                copyButton.innerHTML = '<i class="fas fa-copy"></i>';
                copyButton.setAttribute('data-tooltip', 'Copy code');
                copyButton.onclick = (e) => {
                    e.preventDefault();
                    if (codeElement) {
                        navigator.clipboard.writeText(codeElement.textContent);
                        copyButton.innerHTML = '<i class="fas fa-check"></i>';
                        copyButton.setAttribute('data-tooltip', 'Copied!');
                        setTimeout(() => {
                            copyButton.innerHTML = '<i class="fas fa-copy"></i>';
                            copyButton.setAttribute('data-tooltip', 'Copy code');
                        }, 2000);
                    }
                };
                pre.insertBefore(copyButton, codeElement);
            }
        });
        
        // Add copy full message button
        const messageFooter = messageElement.querySelector('.message-footer');
        if (messageFooter && !messageFooter.querySelector('.copy-message-btn')) {
            const actionsDiv = messageFooter.querySelector('.message-actions') || document.createElement('div');
            if (!actionsDiv.classList.contains('message-actions')) {
                actionsDiv.className = 'message-actions';
                messageFooter.appendChild(actionsDiv);
            }

            const copyMsgBtn = document.createElement('button');
            copyMsgBtn.className = 'copy-message-btn';
            copyMsgBtn.title = 'Copy message';
            copyMsgBtn.innerHTML = '<i class="fas fa-copy"></i>';
            copyMsgBtn.onclick = () => {
                const textContent = messageElement.querySelector('.message-text')?.innerText || '';
                const codeContent = messageElement.querySelector('.code-display-area')?.textContent || '';
                navigator.clipboard.writeText(textContent + "\n" + codeContent);
                copyMsgBtn.innerHTML = '<i class="fas fa-check"></i>';
                setTimeout(() => {
                    copyMsgBtn.innerHTML = '<i class="fas fa-copy"></i>';
                }, 2000);
            };
            actionsDiv.appendChild(copyMsgBtn);
        }
    }

    renderCodeBlock(codeContent) {
        const preElement = document.createElement('pre');
        const codeElement = document.createElement('code');
        preElement.appendChild(codeElement);

        // Parse code content to extract language
        const lines = codeContent.trim().split('\n');
        let language = 'plaintext';
        
        if (lines.length > 0 && lines[0].trim().startsWith('```')) {
            const firstLine = lines[0].trim();
            const langMatch = firstLine.substring(3).trim();
            if (langMatch) {
                language = langMatch.toLowerCase();
                codeContent = lines.slice(1, -1).join('\n'); // Remove first and last lines (```lang and ```)
            } else {
                codeContent = lines.slice(1, -1).join('\n');
            }
        }

        codeElement.textContent = codeContent.trim();
        codeElement.className = `language-${language}`;
        preElement.className = 'code-block-wrapper';

        // Add language badge
        const languageBadge = document.createElement('div');
        languageBadge.className = 'code-language-badge';
        languageBadge.textContent = language;
        preElement.insertBefore(languageBadge, codeElement);

        return preElement;
    }

    // Improved streaming message implementation
    addStreamingBotMessage() {
        const messageNode = this.botMessageTemplate.content.cloneNode(true);
        const messageElement = messageNode.querySelector('.message');
        const messageAvatar = messageNode.querySelector('.message-avatar');
        const messageText = messageNode.querySelector('.message-text');
        const codeDisplayArea = messageNode.querySelector('.code-display-area');

        messageAvatar.innerHTML = this.getCategoryIcon(this.currentCategory);
        messageElement.classList.add(`category-${this.currentCategory}`, 'streaming-message');
        
        // Add blinking cursor for a more dynamic typing effect
        messageText.innerHTML = '<span class="cursor"></span>';
        codeDisplayArea.innerHTML = "";

        this.chatContainer.appendChild(messageNode);
        this.fixMessageLayout();
        this.scrollToBottom();
        return messageElement;
    }

    // Improved streaming implementation that properly respects user's scroll position
updateStreamingMessage(messageElement, content) {
    // Clear any existing streaming interval
    if (this.streamingInterval) {
        clearInterval(this.streamingInterval);
        this.streamingInterval = null;
    }
    
    // Track streaming state
    if (!this.streamingState) {
        this.streamingState = {
            lastRenderedContent: "",
            currentPosition: 0
        };
    }
    
    // Reset if this is a new message or content doesn't start with what we've already rendered
    if (!content.startsWith(this.streamingState.lastRenderedContent)) {
        this.streamingState.lastRenderedContent = "";
        this.streamingState.currentPosition = 0;
    }
    
    // Get only the new content since the last render
    const newContentStartPosition = this.streamingState.lastRenderedContent.length;
    const newContent = content.substring(newContentStartPosition);
    
    // If no new content, just exit
    if (!newContent) return;
    
    // Set up character-by-character rendering
    let charIndex = 0;
    const charsPerFrame = 3; // Adjust for speed
    
    // Save scroll position before updating content
    const wasScrolledUp = this.userScrolledUp;
    
    this.streamingInterval = setInterval(() => {
        if (charIndex < newContent.length) {
            // Add the next few characters to the content we've already rendered
            const charsToAdd = Math.min(charsPerFrame, newContent.length - charIndex);
            const nextChars = newContent.substring(charIndex, charIndex + charsToAdd);
            
            // Update our tracking state
            this.streamingState.lastRenderedContent += nextChars;
            charIndex += charsToAdd;
            
            // Render the complete content so far
            this.renderStreamingContent(messageElement, this.streamingState.lastRenderedContent);
            
            // IMPORTANT: Only auto-scroll if user wasn't already scrolled up
            if (!wasScrolledUp) {
                this.scrollToBottom(false); // Pass false to avoid forced scrolling
            }
        } else {
            // We've rendered all new content, clear the interval
            clearInterval(this.streamingInterval);
            this.streamingInterval = null;
        }
    }, 15); // 15ms for a smooth typing effect
}

    // Improved rendering of streaming content
    renderStreamingContent(messageElement, content) {
        const messageText = messageElement.querySelector('.message-text');
        const codeDisplayArea = messageElement.querySelector('.code-display-area');
        
        // Reset both areas to prevent duplicated content
        messageText.innerHTML = '';
        codeDisplayArea.innerHTML = '';
        
        // Process content - separating code blocks from regular text
        let textContent = '';
        let codeBlocks = [];
        let currentCodeBlock = '';
        let inCodeBlock = false;
        
        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            
            if (line.trim().startsWith('```')) {
                if (inCodeBlock) {
                    // End of code block
                    currentCodeBlock += line + '\n';
                    codeBlocks.push(currentCodeBlock);
                    currentCodeBlock = '';
                    inCodeBlock = false;
                } else {
                    // Start of code block
                    if (textContent && !textContent.endsWith('\n\n')) {
                        textContent += '\n\n';
                    }
                    inCodeBlock = true;
                    currentCodeBlock = line + '\n';
                }
            } else if (inCodeBlock) {
                // Inside code block
                currentCodeBlock += line + '\n';
            } else {
                // Regular text
                textContent += line + '\n';
            }
        }
        
        // Render regular text content with proper markdown
        if (textContent.trim()) {
            messageText.innerHTML = this.markdownParser.render(textContent);
            
            // Ensure lists are properly formatted
            this.fixListRendering(messageText);
        }
        
        // Only add cursor if we're actually streaming
        if (this.streamingInterval) {
            // Add cursor to the end of text
            const cursor = document.createElement('span');
            cursor.className = 'cursor';
            messageText.appendChild(cursor);
        }
        
        // Render any completed code blocks
        codeBlocks.forEach(codeBlock => {
            const preElement = document.createElement('pre');
            const codeElement = document.createElement('code');
            preElement.appendChild(codeElement);
            
            // Extract language from first line
            const firstLine = codeBlock.split('\n')[0].trim();
            let language = 'plaintext';
            if (firstLine.startsWith('```')) {
                const langMatch = firstLine.substring(3).trim();
                if (langMatch) language = langMatch;
            }
            
            // Extract code content (remove first and last lines with ```)
            const codeContent = codeBlock.split('\n').slice(1, -1).join('\n');
            
            codeElement.className = `language-${language}`;
            codeElement.textContent = codeContent;
            
            // Add language badge
            const langBadge = document.createElement('div');
            langBadge.className = 'code-language-badge';
            langBadge.textContent = language;
            preElement.insertBefore(langBadge, codeElement);
            
            codeDisplayArea.appendChild(preElement);
        });
        
        // If we're still in a code block, render the partial block
        if (inCodeBlock && currentCodeBlock) {
            const preElement = document.createElement('pre');
            const codeElement = document.createElement('code');
            preElement.appendChild(codeElement);
            
            // Extract language from first line
            const firstLine = currentCodeBlock.split('\n')[0].trim();
            let language = 'plaintext';
            if (firstLine.startsWith('```')) {
                const langMatch = firstLine.substring(3).trim();
                if (langMatch) language = langMatch;
            }
            
            // Extract partial code content
            const codeContent = currentCodeBlock.split('\n').slice(1).join('\n');
            
            codeElement.className = `language-${language}`;
            codeElement.textContent = codeContent;
            
            // Add language badge
            const langBadge = document.createElement('div');
            langBadge.className = 'code-language-badge';
            langBadge.textContent = language;
            preElement.insertBefore(langBadge, codeElement);
            
            codeDisplayArea.appendChild(preElement);
        }
    }

    // Helper method for improving list formatting
    fixListRendering(element) {
        // Fix numbered lists
        const numberedLists = element.querySelectorAll('ol');
        numberedLists.forEach(list => {
            list.style.paddingLeft = '1.5rem';
            
            const items = list.querySelectorAll('li');
            items.forEach(item => {
                item.style.marginBottom = '0.5rem';
                item.style.position = 'relative';
            });
        });
        
        // Fix bullet lists
        const bulletLists = element.querySelectorAll('ul');
        bulletLists.forEach(list => {
            list.style.paddingLeft = '1.5rem';
            
            const items = list.querySelectorAll('li');
            items.forEach(item => {
                item.style.marginBottom = '0.5rem';
                item.style.position = 'relative';
            });
        });
        
        // Fix heading styles in lists
        const listHeadings = element.querySelectorAll('li strong:first-child');
        listHeadings.forEach(heading => {
            const li = heading.closest('li');
            if (li) {
                li.style.fontWeight = 'normal';
                li.style.marginTop = '1rem';
            }
        });
    }

   // Improved scrollToBottom that respects user choice and allows override option
    scrollToBottom(force = false) {
    // Only auto-scroll if user hasn't manually scrolled up or if forced
        if (this.chatContainer && (!this.userScrolledUp || force)) {
         this.chatContainer.scrollTop = this.chatContainer.scrollHeight;
     }
    }

    // Add "scroll to bottom" button with improved functionality
addScrollToBottomButton() {
    // Create the button if it doesn't exist
    if (!document.getElementById('scroll-to-bottom')) {
        const scrollButton = document.createElement('button');
        scrollButton.id = 'scroll-to-bottom';
        scrollButton.className = 'scroll-bottom-btn';
        scrollButton.innerHTML = '<i class="fas fa-arrow-down"></i>';
        scrollButton.title = 'Scroll to bottom';
        
        // Initially hidden
        scrollButton.style.display = 'none';
        
        // Position it fixed at bottom right
        scrollButton.style.position = 'fixed';
        scrollButton.style.bottom = '80px';
        scrollButton.style.right = '20px';
        scrollButton.style.zIndex = '1000';
        scrollButton.style.borderRadius = '50%';
        scrollButton.style.width = '40px';
        scrollButton.style.height = '40px';
        scrollButton.style.backgroundColor = '#007bff';
        scrollButton.style.color = 'white';
        scrollButton.style.border = 'none';
        scrollButton.style.boxShadow = '0 2px 5px rgba(0,0,0,0.2)';
        scrollButton.style.cursor = 'pointer';
        scrollButton.style.opacity = '0.8';
        scrollButton.style.transition = 'opacity 0.3s';
        
        // Hover effect
        scrollButton.onmouseover = () => {
            scrollButton.style.opacity = '1';
        };
        
        scrollButton.onmouseout = () => {
            scrollButton.style.opacity = '0.8';
        };
        
        // Add click handler - FIXED VERSION
        scrollButton.addEventListener('click', () => {
            this.userScrolledUp = false;
            this.scrollToBottom(true); // Force scroll to bottom
            scrollButton.style.display = 'none';
        });
        
        // Add to body
        document.body.appendChild(scrollButton);
    }
}

    // Reset scroll state (for new chat or switching conversations)
    resetScrollState() {
        this.userScrolledUp = false;
        this.scrollToBottom();
    }

    // Properly finalize the streaming message with consistent formatting
    finalizeStreamingMessage(messageElement, content, category) {
        // Store current scroll state before applying changes
        const wasScrolledUp = this.userScrolledUp;
        
        // Stop streaming animation
        messageElement.classList.remove('streaming-message');
        
        // Reset the message content
        const messageText = messageElement.querySelector('.message-text');
        const codeDisplayArea = messageElement.querySelector('.code-display-area');
        messageText.innerHTML = "";
        codeDisplayArea.innerHTML = "";
        
        // Parse and render the final content
        this.parseAndRenderContent(content, messageText, codeDisplayArea);
        
        // Apply highlighting and set up copy buttons
        setTimeout(() => {
            this.applyCodeHighlighting(messageElement);
            this.setupCopyButtons(messageElement);
            this.applyConsistentStyling();
            this.fixMessageLayout();
            
            // Remove any remaining cursor elements
            const cursors = messageElement.querySelectorAll('.cursor');
            cursors.forEach(cursor => cursor.remove());
            
            // Only scroll to bottom if user wasn't scrolled up before
            if (!wasScrolledUp) {
                this.scrollToBottom();
            }
        }, 10);
    }

    // Improved sendMessage method with proper error handling
    async sendMessage() {
        const message = this.userInput.value.trim();
        if (message === '' || this.isProcessing) return;
        
        // Store scroll state before sending
        const wasScrolledUp = this.userScrolledUp;
        
        this.isProcessing = true;
        this.updateUIState();
        
        // Add user message to UI
        this.addUserMessage(message);
        
        // Clear input
        this.userInput.value = '';
        this.userInput.style.height = 'auto';
        
        // Add streaming message placeholder
        const streamingMessage = this.addStreamingBotMessage();
        
        try {
            // Stream message from API
            apiService.streamMessage(
                message,
                this.currentCategory,
                (content) => {
                    // Update UI with streaming content
                    requestAnimationFrame(() => {
                        this.updateStreamingMessage(streamingMessage, content);
                    });
                },
                (finalContent, messageId, category) => {
                    // Finalize message when streaming complete
                    if (this.streamingInterval) {
                        clearInterval(this.streamingInterval);
                        this.streamingInterval = null;
                    }
                    
                    // Restore scroll state from before sending
                    this.userScrolledUp = wasScrolledUp;
                    
                    this.finalizeStreamingMessage(streamingMessage, finalContent, category);
                },
                (error) => {
                    console.error('Streaming error:', error);
                    if (this.streamingInterval) {
                        clearInterval(this.streamingInterval);
                        this.streamingInterval = null;
                    }
                    
                    // Restore scroll state from before sending
                    this.userScrolledUp = wasScrolledUp;
                    
                    this.finalizeStreamingMessage(streamingMessage, `Error: ${error.message}`, this.currentCategory);
                }
            ).then(() => {
                // Update conversation list after message is complete
                this.loadConversations();
            }).catch(error => {
                console.error('Failed to stream message:', error);
            }).finally(() => {
                this.isProcessing = false;
                this.updateUIState();
            });
        } catch (error) {
            console.error('Error in sendMessage:', error);
            this.isProcessing = false;
            this.updateUIState();
        }
    }

    // Responsive sidebar methods
    checkScreenSize() {
        const isMobile = window.innerWidth < 768; // Define mobile breakpoint
        
        if (isMobile) {
            // On mobile, default to hidden sidebar
            if (this.sidebar) {
                this.sidebar.classList.add('sidebar-hidden');
                this.chatInterface.classList.add('full-width');
            }
            if (this.sidebarToggle) {
                this.sidebarToggle.style.display = 'block';
            }
            this.isSidebarVisible = false;
        } else {
            // On desktop, show sidebar by default
            if (this.sidebar) {
                this.sidebar.classList.remove('sidebar-hidden');
                this.chatInterface.classList.remove('full-width');
            }
            if (this.sidebarToggle) {
                this.sidebarToggle.style.display = 'none';
            }
            this.isSidebarVisible = true;
        }
    }

    toggleSidebar() {
        if (this.isSidebarVisible) {
            // Hide sidebar
            this.sidebar.classList.add('sidebar-hidden');
            this.chatInterface.classList.add('full-width');
            document.body.classList.remove('sidebar-visible');
        } else {
            // Show sidebar
            this.sidebar.classList.remove('sidebar-hidden');
            this.chatInterface.classList.remove('full-width');
            if (window.innerWidth < 768) {
                document.body.classList.add('sidebar-visible');
            }
        }
        
        this.isSidebarVisible = !this.isSidebarVisible;
    }

    async startNewChat() {
        try {
            await apiService.createNewChat(this.currentCategory);
            this.chatContainer.innerHTML = '';
            this.welcomeMessage.style.display = 'block';
            this.userInput.value = '';
            this.userInput.style.height = 'auto';
            await this.loadConversations();
            this.isProcessing = false;
            this.updateUIState();
            this.resetScrollState(); // Reset scroll state for new chat
        } catch (error) {
            console.error('Failed to start new chat:', error);
        }
    }

    async switchConversation(chatId) {
        try {
            apiService.switchChat(chatId);
            this.chatContainer.innerHTML = '';
            this.welcomeMessage.style.display = 'none';
            await this.loadChatHistory();
            await this.loadConversations();
            this.isProcessing = false;
            this.updateUIState();
            this.resetScrollState(); // Reset scroll state when switching chats
        } catch (error) {
            console.error('Failed to switch conversation:', error);
        }
    }

    async deleteConversation(chatId) {
        if (!confirm('Are you sure you want to delete this conversation?')) return;
        try {
            await apiService.deleteChat(chatId);
            if (chatId === apiService.sessionId) {
                this.chatContainer.innerHTML = '';
                this.welcomeMessage.style.display = 'block';
            }
            await this.loadConversations();
        } catch (error) {
            console.error('Failed to delete conversation:', error);
        }
    }
}

const chatManager = new ChatManager();

// Add CSS for scroll to bottom button
const style = document.createElement('style');
style.textContent = `
.scroll-bottom-btn {
    position: fixed;
    bottom: 80px;
    right: 20px;
    z-index: 1000;
    border-radius: 50%;
    width: 40px;
    height: 40px;
    background-color: #007bff;
    color: white;
    border: none;
    box-shadow: 0 2px 5px rgba(0,0,0,0.2);
    cursor: pointer;
    opacity: 0.8;
    transition: opacity 0.3s;
    display: none;
}

.scroll-bottom-btn:hover {
    opacity: 1;
}

.cursor {
    display: inline-block;
    width: 8px;
    height: 16px;
    background-color: #333;
    margin-left: 2px;
    animation: blink 1s infinite;
}

/* Hide cursor in non-streaming messages */
.message:not(.streaming-message) .cursor {
    display: none;
}

@keyframes blink {
    0%, 100% { opacity: 1; }
    50% { opacity: 0; }
}

/* When streaming is happening but user scrolled up, show indicator */
.streaming-indicator {
    position: fixed;
    bottom: 130px;
    right: 20px;
    background-color: rgba(0, 0, 0, 0.7);
    color: white;
    padding: 5px 10px;
    border-radius: 5px;
    font-size: 12px;
    z-index: 1000;
    display: none;
}

/* Animation for the streaming message */
.streaming-message .message-text:after {
    content: '';
    display: none; /* Changed from inline-block to prevent duplicate cursors */
}
`;

document.head.appendChild(style);
