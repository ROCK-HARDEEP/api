const getApiUrl = () => {
  const hostname = window.location.hostname;
  if (hostname.includes('huggingface.co') || hostname.includes('hf.space')) {
    return window.location.origin;
  }
  return window.location.origin;
};

const API_URL = getApiUrl();
console.log("Using API URL:", API_URL);

class ApiService {
  constructor() {
    this.sessionId = localStorage.getItem('currentSessionId') || null;
    this.categoryDetails = {};
    this.loadCategories();
  }

  async loadCategories() {
    try {
      const response = await fetch(`${API_URL}/api/categories`);
      if (!response.ok) throw new Error('Failed to fetch categories');
      const data = await response.json();
      this.categoryDetails = data.details || {};
      return data;
    } catch (error) {
      console.error('Error fetching categories:', error);
      return {
        categories: ["general", "math", "coding", "philosophy"],
        details: {
          "general": { name: "General Assistant" },
          "math": { name: "Math Expert" },
          "coding": { name: "Code Assistant" },
          "philosophy": { name: "Deep Thinker" }
        }
      };
    }
  }

  async createNewChat(category = 'general') {
    try {
      const response = await fetch(`${API_URL}/api/chat/new`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ category })
      });
      if (!response.ok) throw new Error('Failed to create new chat');
      const data = await response.json();
      this.sessionId = data.session_id;
      localStorage.setItem('currentSessionId', this.sessionId);
      return data;
    } catch (error) {
      console.error('Error creating new chat:', error);
      throw error;
    }
  }

  // Enhanced streaming method for better code handling
  async streamMessage(message, category = 'general', onChunk = () => {}, onComplete = () => {}, onError = () => {}) {
    if (!this.sessionId) {
      await this.createNewChat(category);
    }

    try {
      const response = await fetch(`${API_URL}/api/chat/${this.sessionId}/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ message, category })
      });

      if (!response.ok) {
        throw new Error(`Failed to stream message: ${response.status} ${response.statusText}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullMessage = '';
      let messageId = null;
      let codeBlockOpen = false;
      let currentLanguage = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              
              if (data.status === 'streaming' && !messageId) {
                messageId = data.id;
              } else if (data.chunk) {
                fullMessage += data.chunk;
                
                // Detect code block openings and closings for better rendering
                if (data.chunk.includes('```')) {
                  const matches = data.chunk.match(/```([a-zA-Z]*)/g);
                  if (matches) {
                    for (const match of matches) {
                      if (!codeBlockOpen) {
                        codeBlockOpen = true;
                        currentLanguage = match.replace('```', '') || 'plaintext';
                      } else {
                        codeBlockOpen = false;
                        currentLanguage = '';
                      }
                    }
                  }
                }
                
                onChunk(fullMessage, messageId, codeBlockOpen, currentLanguage);
              } else if (data.status === 'complete') {
                onComplete(data.final_content || fullMessage, messageId, category);
              }
            } catch (err) {
              console.error('Error parsing streaming data:', err, line);
            }
          }
        }
      }
    } catch (error) {
      console.error('Error in API stream:', error);
      onError(error);
      throw error;
    }
  }

  async sendMessage(message, category = 'general') {
    try {
      if (!this.sessionId) {
        await this.createNewChat(category);
      }
      const response = await fetch(`${API_URL}/api/chat/${this.sessionId}/message`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message,
          category
        })
      });
      if (!response.ok) throw new Error('Failed to send message');
      return await response.json();
    } catch (error) {
      console.error('Error sending message:', error);
      throw error;
    }
  }

  async getChatHistory() {
    if (!this.sessionId) return { messages: [] };
    try {
      const response = await fetch(`${API_URL}/api/chat/${this.sessionId}`);
      if (!response.ok) {
        if (response.status === 404) {
          localStorage.removeItem('currentSessionId');
          this.sessionId = null;
          return { messages: [] };
        }
        throw new Error('Failed to fetch chat history');
      }
      return await response.json();
    } catch (error) {
      console.error('Error fetching chat history:', error);
      return { messages: [] };
    }
  }

  async getAllChats() {
    try {
      const response = await fetch(`${API_URL}/api/chats`);
      if (!response.ok) throw new Error('Failed to fetch chats');
      return await response.json();
    } catch (error) {
      console.error('Error fetching all chats:', error);
      return [];
    }
  }

  async deleteChat(chatId) {
    try {
      const response = await fetch(`${API_URL}/api/chat/${chatId}`, {
        method: 'DELETE'
      });
      if (!response.ok) throw new Error('Failed to delete chat');
      if (this.sessionId === chatId) {
        localStorage.removeItem('currentSessionId');
        this.sessionId = null;
      }
      return await response.json();
    } catch (error) {
      console.error('Error deleting chat:', error);
      throw error;
    }
  }

  switchChat(chatId) {
    this.sessionId = chatId;
    localStorage.setItem('currentSessionId', chatId);
  }

  getCategoryName(categoryId) {
    return this.categoryDetails[categoryId]?.name || "Assistant";
  }
}

const apiService = new ApiService();