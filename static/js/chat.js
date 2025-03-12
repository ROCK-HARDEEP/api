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
      this.updateUIState();
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

              // Fix code blocks alignment after chat history is loaded
              this.fixCodeBlocksAlignment();
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

      // Listen for changes in the chat container to fix code blocks
      const observer = new MutationObserver(() => {
          this.fixCodeBlocksAlignment();
      });
      observer.observe(this.chatContainer, { childList: true, subtree: true });
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
      
      // ** Call renderUserMessageContent instead of directly setting textContent **
      this.renderUserMessageContent(messageText, message);

      this.chatContainer.appendChild(messageNode);
      this.scrollToBottom();
  }

  // ** New method: renderUserMessageContent for handling Markdown and keywords **
  renderUserMessageContent(messageTextElement, message) {
      // 1. Render Markdown for User Message
      messageTextElement.innerHTML = this.markdownParser.render(message);

      // 2. Syntax Highlighting for Code Blocks in User Message
      const codeBlocks = messageTextElement.querySelectorAll('pre code');
      codeBlocks.forEach(block => {
          hljs.highlightElement(block);
      });

      // 3. Keyword Highlighting in User Message
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


  // Enhanced bot message with better code formatting
  addBotMessage(message, category = 'general') {
      const messageNode = this.botMessageTemplate.content.cloneNode(true);
      const messageElement = messageNode.querySelector('.message');
      const messageAvatar = messageNode.querySelector('.message-avatar');
      const messageText = messageNode.querySelector('.message-text');
      const codeDisplayArea = messageNode.querySelector('.code-display-area'); // Get codeDisplayArea
      const messageSource = messageNode.querySelector('.message-source');
      const messageFooter = messageNode.querySelector('.message-footer');

      messageAvatar.innerHTML = this.getCategoryIcon(category);
      messageElement.classList.add(`category-${category}`);
      messageAvatar.className = this.getCategoryIcon(category);

      // Clear both text and code areas initially
      messageText.innerHTML = "";
      codeDisplayArea.innerHTML = "";

      let regularTextContent = "";
      let codeBlockContent = "";
      let inCodeBlock = false;

      const lines = message.split('\n');
      for (const line of lines) {
          if (line.trim().startsWith("```")) {
              if (inCodeBlock) {
                  codeBlockContent += line.trim() + "\n";
                  inCodeBlock = false;
                  codeDisplayArea.appendChild(this.renderCodeBlock(codeBlockContent)); // Append rendered code block to code area
                  codeBlockContent = "";
              } else {
                  codeBlockContent += line.trim() + "\n";
                  inCodeBlock = true;
              }
          } else if (inCodeBlock) {
              codeBlockContent += line + "\n";
          } else {
              regularTextContent += line + "\n";
          }
      }

      // Render regular text in message-text area
      if (regularTextContent.trim()) {
          messageText.innerHTML = this.markdownParser.render(regularTextContent);
      }


      if (messageSource) {
          messageSource.style.display = 'none';
      }

      this.chatContainer.appendChild(messageNode);

      // Apply syntax highlighting to all code blocks
      setTimeout(() => {
          hljs.highlightAll();
          // this.fixCodeBlocksAlignment(); // Likely not needed for separate area
      }, 0);

      this.scrollToBottom();
  }


  // Fix code blocks alignment - Likely not needed, can be kept or removed
  fixCodeBlocksAlignment() {
      // ... (Likely can remove this function now) ...
  }

  preprocessMessageContent(message) {
      return message; // Basic version for this example, enhance as needed
  }

  detectCodeLanguage(code) {
      code = code.toLowerCase();
      if (code.includes('def ') || code.includes('import ') || code.includes('print(')) {
          return 'python';
      } else if (code.includes('function') || code.includes('const ') || code.includes('let ') || code.includes('var ')) {
          return 'javascript';
      } else if (code.includes('<html') || code.includes('<div') || code.includes('<body')) {
          return 'html';
      } else if (code.includes('public class') || code.includes('public static void')) {
          return 'java';
      } else if (code.includes('#include')) {
          return 'cpp';
      } else if (code.includes('select ') || code.includes('from ') || code.includes('where ')) {
          return 'sql';
      } else if (code.includes(':root') || code.includes('@media') || code.includes('body {')) {
          return 'css';
      } else {
          return 'plaintext';
      }
  }


  addStreamingBotMessage() {
      const messageNode = this.botMessageTemplate.content.cloneNode(true);
      const messageElement = messageNode.querySelector('.message');
      const messageAvatar = messageNode.querySelector('.message-avatar');
      const messageText = messageNode.querySelector('.message-text');
      const codeDisplayArea = messageNode.querySelector('.code-display-area'); // Get codeDisplayArea

      messageAvatar.innerHTML = this.getCategoryIcon(this.currentCategory);
      messageElement.classList.add(`category-${this.currentCategory}`, 'streaming-message');
      messageAvatar.className = this.getCategoryIcon(this.currentCategory);
      messageText.innerHTML = '<span class="cursor"></span>'; // Cursor in text area
      codeDisplayArea.innerHTML = ""; // Ensure code area starts empty

      this.chatContainer.appendChild(messageNode);
      this.scrollToBottom();
      return messageElement;
  }


  formatStreamingContent(content) {
      let formattedContent = "";
      let codeBlockContent = "";
      let inCodeBlock = false;

      const lines = content.split('\n');
      for (const line of lines) {
          if (line.trim().startsWith("```")) {
              if (inCodeBlock) {
                  codeBlockContent += line.trim() + "\n"; // Include closing ``` in code content
                  inCodeBlock = false;
                  formattedContent += `<div class="code-display-area">${this.renderCodeBlock(codeBlockContent)}</div>`;
                  codeBlockContent = ""; // Reset for next code block
              } else {
                  codeBlockContent += line.trim() + "\n"; // Include opening ``` in code content
                  inCodeBlock = true;
              }
          } else if (inCodeBlock) {
              codeBlockContent += line + "\n";
          } else {
              formattedContent += line + "\n";
          }
      }

      if (formattedContent.trim()) {
          formattedContent = this.markdownParser.render(formattedContent);
      } else {
          formattedContent = "";
      }

      return formattedContent;
  }


  finalizeStreamingMessage(messageElement, content, category) {
      messageElement.classList.remove('streaming-message');
      const messageText = messageElement.querySelector('.message-text');
      const codeDisplayArea = messageElement.querySelector('.code-display-area');
      messageText.innerHTML = "";
      codeDisplayArea.innerHTML = "";

      let regularTextContent = "";
      let codeBlockContent = "";
      let inCodeBlock = false;

      const lines = content.split('\n');
      for (const line of lines) {
          if (line.trim().startsWith("```")) {
              if (inCodeBlock) {
                  codeBlockContent += line.trim() + "\n";
                  inCodeBlock = false;
                  codeDisplayArea.innerHTML += this.renderCodeBlock(codeBlockContent).outerHTML;
                  codeBlockContent = "";
              } else {
                  codeBlockContent += line.trim() + "\n";
                  inCodeBlock = true;
              }
          } else if (inCodeBlock) {
              codeBlockContent += line + "\n";
          } else {
              regularTextContent += line + "\n";
          }
      }

      if (regularTextContent.trim()) {
          messageText.innerHTML = this.markdownParser.render(regularTextContent);
      }


      const codeBlocks = codeDisplayArea.querySelectorAll('pre code');
      codeBlocks.forEach((block, index) => {
          const pre = block.parentNode;
          if (!pre.querySelector('.copy-code-btn')) {
              const copyButton = document.createElement('button');
              copyButton.className = 'copy-code-btn';
              copyButton.innerHTML = '<i class="fas fa-copy"></i>';
              copyButton.setAttribute('data-tooltip', 'Copy code');
              copyButton.onclick = (e) => {
                  e.preventDefault();
                  navigator.clipboard.writeText(block.textContent);
                  copyButton.innerHTML = '<i class="fas fa-check"></i>';
                  copyButton.setAttribute('data-tooltip', 'Copied!');
                  setTimeout(() => {
                      copyButton.innerHTML = '<i class="fas fa-copy"></i>';
                      copyButton.setAttribute('data-tooltip', 'Copy code');
                  }, 2000);
              };
              pre.insertBefore(copyButton, block);
          }
      });


      const messageFooter = messageElement.querySelector('.message-footer');
      if (messageFooter) {
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
              let fullContent = messageText.innerText + "\n" + codeDisplayArea.textContent;
              navigator.clipboard.writeText(fullContent);
              copyMsgBtn.innerHTML = '<i class="fas fa-check"></i>';
              setTimeout(() => {
                  copyMsgBtn.innerHTML = '<i class="fas fa-copy"></i>';
              }, 2000);
          };
          actionsDiv.appendChild(copyMsgBtn);
      }


      setTimeout(() => {
          hljs.highlightAll(codeDisplayArea);

          messageText.style.display = 'none';
          void messageText.offsetHeight;
          messageText.style.display = 'block';
      }, 10);

      this.scrollToBottom();
  }


  renderCodeBlock(codeContent) {
      const tempContainer = document.createElement('div');
      tempContainer.innerHTML = codeContent;
      const preElement = document.createElement('pre');
      const codeElement = document.createElement('code');
      preElement.appendChild(codeElement);

      const lines = codeContent.trim().split('\n');
      let language = 'plaintext';
      if (lines.length > 0) {
          const firstLine = lines[0].trim();
          if (firstLine.startsWith('```')) {
              const langMatch = firstLine.substring(3).trim();
              if (langMatch) {
                  language = langMatch.toLowerCase();
                  codeContent = lines.slice(1).join('\n');
              } else {
                  codeContent = lines.slice(1).join('\n');
              }
          }
      }

      codeElement.textContent = codeContent.trim();
      codeElement.className = `language-${language}`;
      preElement.className = 'code-block-wrapper';

      const languageBadge = document.createElement('div');
      languageBadge.className = 'code-language-badge';
      languageBadge.textContent = language;
      preElement.insertBefore(languageBadge, codeElement);


      const copyButton = document.createElement('button');
      copyButton.className = 'copy-code-btn';
      copyButton.innerHTML = '<i class="fas fa-copy"></i>';
      copyButton.setAttribute('data-tooltip', 'Copy code');
      copyButton.onclick = (e) => {
          e.preventDefault();
          navigator.clipboard.writeText(codeElement.textContent);
          copyButton.innerHTML = '<i class="fas fa-check"></i>';
          copyButton.setAttribute('data-tooltip', 'Copied!');
          setTimeout(() => {
              copyButton.innerHTML = '<i class="fas fa-copy"></i>';
              copyButton.setAttribute('data-tooltip', 'Copy code');
          }, 2000);
      };
      preElement.insertBefore(copyButton, codeElement);
      return preElement;
  }


  updateStreamingMessage(messageElement, content) {
      const messageText = messageElement.querySelector('.message-text');
      const codeDisplayArea = messageElement.querySelector('.code-display-area');

      let formattedTextContent = "";
      let formattedCodeContent = "";
      let inCodeBlock = false;
      let currentCodeBlock = "";

      const lines = content.split('\n');
      for (const line of lines) {
          if (line.trim().startsWith("```")) {
              if (inCodeBlock) {
                  currentCodeBlock += line.trim() + "\n";
                  inCodeBlock = false;
                  formattedCodeContent += this.renderStreamingCodeBlock(currentCodeBlock).outerHTML;
                  currentCodeBlock = "";
              } else {
                  currentCodeBlock += line.trim() + "\n";
                  inCodeBlock = true;
              }
          } else if (inCodeBlock) {
              currentCodeBlock += line + "\n";
          } else {
              formattedTextContent += line + "\n";
          }
      }

      if (formattedTextContent.trim()) {
          messageText.innerHTML = this.markdownParser.render(formattedTextContent) + '<span class="cursor"></span>';
      } else {
          messageText.innerHTML = '<span class="cursor"></span>';
      }

      codeDisplayArea.innerHTML = formattedCodeContent;

      this.scrollToBottom();
  }


  renderStreamingCodeBlock(codeContent) {
      const tempContainer = document.createElement('div');
      tempContainer.innerHTML = codeContent;
      const preElement = document.createElement('pre');
      preElement.className = 'streaming-code';
      const codeElement = document.createElement('code');
      preElement.appendChild(codeElement);

      const lines = codeContent.trim().split('\n');
      let language = 'plaintext';
      if (lines.length > 0) {
          const firstLine = lines[0].trim();
          if (firstLine.startsWith('```')) {
              const langMatch = firstLine.substring(3).trim();
              if (langMatch) {
                  language = langMatch.toLowerCase();
                  codeContent = lines.slice(1).join('\n');
              } else {
                  codeContent = lines.slice(1).join('\n');
              }
          }
      }

      codeElement.textContent = codeContent.trim();
      codeElement.className = `language-${language}`;

      const languageBadge = document.createElement('div');
      languageBadge.className = 'code-language';
      languageBadge.textContent = language;
      preElement.insertBefore(languageBadge, codeElement);

      try {
          const highlightedCode = hljs.highlight(codeElement.textContent, { language: language }).value;
          codeElement.innerHTML = highlightedCode;
      } catch (e) {
          console.error("Highlighting error during streaming:", e);
      }
      return preElement;
  }


  scrollToBottom() {
      if (this.chatContainer) {
          this.chatContainer.scrollTop = this.chatContainer.scrollHeight;
      }
  }

  async sendMessage() {
      const message = this.userInput.value.trim();
      if (message === '' || this.isProcessing) return;

      this.isProcessing = true;
      this.updateUIState();

      this.addUserMessage(message);
      this.userInput.value = '';
      this.userInput.style.height = 'auto';

      const streamingMessage = this.addStreamingBotMessage();

      try {
          await apiService.streamMessage(
              message,
              this.currentCategory,
              (content, messageId, codeBlockOpen, currentLanguage) => {
                  requestAnimationFrame(() => this.updateStreamingMessage(streamingMessage, content));
              },
              (content, messageId, category) => this.finalizeStreamingMessage(streamingMessage, content, category),
              (error) => {
                  console.error('Streaming error:', error);
                  this.finalizeStreamingMessage(streamingMessage, `Error: ${error.message}`, this.currentCategory);
              }
          );
          await this.loadConversations();
      } catch (error) {
          console.error('Failed to stream message:', error);
          this.finalizeStreamingMessage(streamingMessage, `Error: ${error.message}`, this.currentCategory);
      } finally {
          this.isProcessing = false;
          this.updateUIState();
      }
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
