/**
 * Enhanced message formatting utilities for RM Assistant
 * Place this in /static/js/formatting.js
 */

const formattingUtils = {
    /**
     * Initializes advanced formatting features
     */
    init() {
      // Add our additional CSS
      this.injectAdditionalCSS();
      
      // Set up event listeners for copy buttons
      document.addEventListener('click', (e) => {
        if (e.target.closest('.copy-message-btn')) {
          const messageEl = e.target.closest('.message');
          const textEl = messageEl.querySelector('.message-text');
          this.copyTextToClipboard(textEl.innerText);
          
          const btn = e.target.closest('.copy-message-btn');
          const originalHTML = btn.innerHTML;
          btn.innerHTML = '<i class="fas fa-check"></i>';
          btn.setAttribute('title', 'Copied!');
          
          setTimeout(() => {
            btn.innerHTML = originalHTML;
            btn.setAttribute('title', 'Copy message');
          }, 2000);
        }
      });
      
      // Add copy message functionality to all bot messages
      this.setupCopyMessageButtons();
    },
    
    /**
     * Injects additional CSS for enhanced formatting
     */
    injectAdditionalCSS() {
      const style = document.createElement('style');
      style.textContent = `
        /* Message footer styling */
        .message-footer {
          display: flex;
          justify-content: space-between;
          margin-top: 0.5rem;
          padding: 0 0.5rem;
        }
        
        .message-actions {
          display: flex;
          gap: 0.5rem;
        }
        
        .copy-message-btn {
          background: none;
          border: none;
          color: var(--light-text);
          cursor: pointer;
          padding: 0.25rem;
          border-radius: var(--radius-sm);
          opacity: 0.5;
          transition: var(--transition);
        }
        
        .message:hover .copy-message-btn {
          opacity: 1;
        }
        
        .copy-message-btn:hover {
          background-color: rgba(255, 255, 255, 0.1);
        }
        
        /* Table enhancements */
        .message-text table {
          border-collapse: collapse;
          width: 100%;
          margin: 1rem 0;
          overflow: hidden;
          border-radius: var(--radius-sm);
        }
        
        .message-text th {
          background-color: rgba(64, 65, 79, 0.6);
          font-weight: 600;
          text-align: left;
          padding: 0.75rem;
          border: 1px solid var(--border-color);
        }
        
        .message-text td {
          padding: 0.75rem;
          border: 1px solid var(--border-color);
          background-color: rgba(52, 53, 65, 0.3);
        }
        
        .message-text tr:nth-child(even) td {
          background-color: rgba(52, 53, 65, 0.5);
        }
        
        /* Code inline styling */
        .message-text code:not(pre code) {
          background-color: rgba(40, 42, 54, 0.7);
          padding: 0.2em 0.4em;
          border-radius: var(--radius-sm);
          font-family: 'Fira Code', monospace;
          font-size: 0.9em;
        }
        
        /* Better list styling */
        .message-text ul {
          list-style-type: disc;
        }
        
        .message-text ol {
          list-style-type: decimal;
        }
        
        /* Better blockquote styling */
        .message-text blockquote {
          margin: 1rem 0;
          padding: 0.5rem 1rem;
          border-left: 4px solid var(--primary-color);
          background-color: rgba(64, 65, 79, 0.3);
          border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
        }
      `;
      document.head.appendChild(style);
    },
    
    /**
     * Adds copy functionality to all bot messages
     */
    setupCopyMessageButtons() {
      // Set up a mutation observer to watch for new messages
      const chatContainer = document.getElementById('chat-container');
      if (!chatContainer) return;
      
      const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          if (mutation.type === 'childList') {
            mutation.addedNodes.forEach((node) => {
              if (node.nodeType === 1 && node.classList.contains('bot-message')) {
                this.setupCopyButtonForMessage(node);
              }
            });
          }
        });
      });
      
      observer.observe(chatContainer, { childList: true });
      
      // Also set up copy buttons for existing messages
      document.querySelectorAll('.bot-message').forEach((message) => {
        this.setupCopyButtonForMessage(message);
      });
    },
    
    /**
     * Sets up copy button for a specific message
     */
    setupCopyButtonForMessage(messageEl) {
      const footer = messageEl.querySelector('.message-footer');
      const copyBtn = messageEl.querySelector('.copy-message-btn');
      
      if (footer && !copyBtn) {
        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'message-actions';
        
        const copyBtn = document.createElement('button');
        copyBtn.className = 'copy-message-btn';
        copyBtn.title = 'Copy message';
        copyBtn.innerHTML = '<i class="fas fa-copy"></i>';
        
        actionsDiv.appendChild(copyBtn);
        footer.appendChild(actionsDiv);
      }
    },
    
    /**
     * Copies text to clipboard
     */
    copyTextToClipboard(text) {
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'fixed';
      textArea.style.left = '-999999px';
      textArea.style.top = '-999999px';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      
      try {
        document.execCommand('copy');
      } catch (err) {
        console.error('Failed to copy text: ', err);
      }
      
      document.body.removeChild(textArea);
    },
    
    /**
     * Enhances rendering of specific content types
     * @param {Element} element - The message element to enhance
     */
    enhanceRendering(element) {
      // Find all tables and add a wrapper for horizontal scrolling
      element.querySelectorAll('table').forEach(table => {
        const wrapper = document.createElement('div');
        wrapper.style.overflowX = 'auto';
        table.parentNode.insertBefore(wrapper, table);
        wrapper.appendChild(table);
      });
      
      // Add line numbers to code blocks
      element.querySelectorAll('pre code').forEach(codeBlock => {
        const code = codeBlock.innerHTML;
        const lines = code.split('\n');
        
        // Only add line numbers if there are multiple lines
        if (lines.length > 1) {
          let numberedCode = '';
          lines.forEach((line, i) => {
            numberedCode += `<span class="line-number">${i + 1}</span>${line}\n`;
          });
          
          codeBlock.innerHTML = numberedCode;
          codeBlock.parentElement.classList.add('with-line-numbers');
        }
      });
    }
  };
  
  // Initialize when DOM content is loaded
  document.addEventListener('DOMContentLoaded', () => {
    formattingUtils.init();
  });