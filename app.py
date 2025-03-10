import os
import re
import random
from flask import Flask, request, jsonify, send_from_directory, Response
from flask_cors import CORS
from dotenv import load_dotenv
import google.generativeai as genai
import json
import uuid
from datetime import datetime
import logging

# Set up logging for debugging and error tracking
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

# Load environment variables
load_dotenv()

app = Flask(__name__, static_folder='static')
CORS(app)  # Enable CORS for all routes
app.secret_key = os.getenv("FLASK_SECRET_KEY", "your_default_secret_key")  # Set a secret key for session management if needed

# Configure Google Generative AI API
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")
if not GOOGLE_API_KEY:
    GOOGLE_API_KEY = "AIzaSyD2wxDcpA-V5fAIHLIeRi2_NSpRRmOYhqs"  # Fallback - Replace with a safer mechanism in production
    logging.warning("Using fallback Google API key. Please set GOOGLE_API_KEY environment variable for production.")
else:
    logging.info(f"Loaded Google API key from environment (starts with {GOOGLE_API_KEY[:4]}...)")

# Configure the Generative AI client
try:
    genai.configure(api_key=GOOGLE_API_KEY)
    logging.info("Successfully configured Google Generative AI client")
    # List available models for debugging
    available_models = genai.list_models()
    logging.debug("Available models: %s", [model.name for model in available_models])  # Debug level logging
except Exception as e:
    logging.error(f"Failed to configure Google Generative AI client: {str(e)}")

# Store chat sessions in memory (consider persistent storage for production)
chat_sessions = {}

# Assistant Categories - Updated System Prompts with RMH as developer
ASSISTANT_CATEGORIES = {
    "general": {
        "name": "General Assistant",
        "system_prompt": """You are IND ChatAI, a helpful, knowledgeable, and versatile AI assistant. When asked about your identity, mention that you are IND ChatAI, developed by RMH at Scube Innovation. Aim to provide balanced, accurate, and thoughtful responses to a wide range of questions and topics."""
    },
    "math": {
        "name": "Math Expert",
        "system_prompt": """You are IND ChatAI's Math Expert mode, developed by RMH at Scube Innovation. Your primary role is to answer mathematical questions with accuracy and precision. Provide step-by-step solutions to math problems whenever possible, showing your work clearly. Ensure your calculations and reasoning are correct. If a user asks anything unrelated to mathematics, politely suggest they switch to a different mode or clarify that you are specialized in math."""
    },
    "coding": {
        "name": "Code Assistant",
        "system_prompt": """You are IND ChatAI's Coding Assistant mode, developed by RMH at Scube Innovation. Focus on providing clean, efficient, and functional code solutions. Accuracy and best practices in coding are paramount. Always format your code snippets using markdown code blocks with the appropriate language specified. For example, use ```python for Python code, ```javascript for JavaScript code, etc. Make sure code is well-commented, follows industry standards, and offers explanations of the logic."""
    },
    "philosophy": {
        "name": "Deep Thinker",
        "system_prompt": """You are IND ChatAI's Deep Thinking mode, developed by RMH at Scube Innovation. Engage with philosophical, ethical, and conceptual questions in a profound and analytical manner. Provide thoughtful analyses, exploring multiple perspectives, and considering nuances. Focus on depth and insight in your responses."""
    }
}


# Custom responses for identity and company questions
RM_RESPONSES = {
    "tell me a joke": "Why did the scarecrow win an award? Because he was outstanding in his field!"
}

# Jokes list for repeated joke requests - Consider loading from a file if list grows
JOKES = [
    "Why don't scientists trust atoms? Because they make up everything!",
    "What do you call a fake noodle? An impasta!",
    "Why did the bicycle fall over? Because it was two-tired!",
    "How does a penguin build its house? Igloos it together!",
    "Why don't eggs tell jokes? They'd crack each other up!",
    "What's orange and sounds like a parrot? A carrot!",
    "How do you organize a space party? You planet!",
    "What do you call a bear with no teeth? A gummy bear!",
    "Why couldn't the leopard play hide and seek? Because he was always spotted!",
    "What did one wall say to the other wall? I'll meet you at the corner!"
]

# Latest Gemini model - Using the most current "flash" version. Double-check Gemini API docs for updates.
# For Gemini 1.5 Pro (if intended): 'models/gemini-1.5-pro-latest'
# For Gemini Pro (if intended, older but might be sufficient for many tasks): 'models/gemini-pro'
LATEST_GEMINI_MODEL = 'models/gemini-1.5-flash-latest'

# --- Helper Functions ---
def detect_language(code):
    """Function to determine probable language based on code content."""
    code = code.lower()
    if "def " in code or "import " in code or "print(" in code or "class " in code:
        return "python"
    elif "function" in code or "const " in code or "let " in code or "var " in code or "=>" in code:
        return "javascript"
    elif "<html" in code or "<div" in code or "<body" in code or "<script" in code:
        return "html"
    elif "public class" in code or "public static void" in code or "import java" in code:
        return "java"
    elif "#include" in code or "int main" in code:
        return "cpp"
    elif "<?php" in code:
        return "php"
    elif "using namespace" in code or "std::" in code:
        return "cpp"
    elif "func " in code:
        return "go"
    elif "fn " in code or "let mut" in code:
        return "rust"
    elif "SELECT " in code.upper() or "FROM " in code.upper() or "WHERE " in code.upper():
        return "sql"
    else:
        return "plaintext"

def format_code_blocks(text):
    """Ensures code blocks are properly formatted with language specification and consistent structure."""
    pattern = r"```\s*\n"  # Code blocks without language spec

    def replace_match(match):
        start_pos = match.end()
        end_marker = "```"
        end_pos = text[start_pos:].find(end_marker)
        if end_pos != -1:
            code_content = text[start_pos:start_pos + end_pos]
            language = detect_language(code_content)
            return f"```{language}\n"
        return match.group(0)

    formatted_text = re.sub(pattern, replace_match, text)
    formatted_text = re.sub(r"([^\n])```", r"\1\n```", formatted_text)  # Ensure newline before closing backticks
    formatted_text = re.sub(r"```([a-zA-Z0-9]+)([^\n])", r"```\1\n\2", formatted_text)  # Spacing after language spec
    formatted_text = re.sub(r"```([a-zA-Z0-9]+)$", r"```\1\n", formatted_text, flags=re.MULTILINE)  # Newline after language spec, end of block

    return formatted_text

def format_streaming_chunk(chunk, category):
    """Formats a chunk of text to improve streaming experience, particularly for code blocks."""
    if "```" in chunk:
        if chunk.strip().startswith("```") and len(chunk.strip()) < 20:
            code_start = chunk.strip()
            language = code_start.replace("```", "").strip()
            if not language:
                language = "plaintext"
            return f"```{language}\n"
    return chunk

# --- Routes ---
@app.route('/', defaults={'path': 'index.html'})
@app.route('/<path:path>')
def serve_static(path):
    """Serve static files from the 'static' directory."""
    return send_from_directory('static', path)

@app.route('/api/categories', methods=['GET'])
def get_categories():
    """Endpoint to get available assistant categories."""
    return jsonify({"categories": list(ASSISTANT_CATEGORIES.keys()), "details": ASSISTANT_CATEGORIES})

@app.route('/api/chat/new', methods=['POST'])
def create_chat():
    """Endpoint to create a new chat session."""
    session_id = str(uuid.uuid4())
    data = request.json if request.is_json else {}
    chat_sessions[session_id] = {
        "id": session_id,
        "title": "New Chat",  # Default title, updated later with first user message
        "created_at": datetime.now().isoformat(),
        "messages": [],
        "category": data.get('category', 'general')
    }
    logging.info(f"New chat session created: {session_id}")
    return jsonify({"session_id": session_id})

@app.route('/api/chat/<session_id>', methods=['GET'])
def get_chat(session_id):
    """Endpoint to retrieve a specific chat session."""
    if session_id not in chat_sessions:
        return jsonify({"error": "Chat session not found"}), 404
    return jsonify(chat_sessions[session_id])

@app.route('/api/chat/<session_id>/stream', methods=['POST'])
def stream_message(session_id):
    """Streaming endpoint for sending messages to Gemini and receiving responses chunk by chunk."""
    if session_id not in chat_sessions:
        return jsonify({"error": "Chat session not found"}), 404

    data = request.json
    user_message = data.get('message', '')
    if not user_message:
        return jsonify({"error": "No message provided"}), 400

    # Check for custom responses first
    custom_reply = custom_response(user_message)
    if custom_reply:
        message_id = str(uuid.uuid4())
        
        # Add user message to session
        user_msg = {
            "id": str(uuid.uuid4()),
            "role": "user",
            "content": user_message,
            "timestamp": datetime.now().isoformat()
        }
        chat_sessions[session_id]["messages"].append(user_msg)
        
        # Add assistant response to session
        assistant_msg = {
            "id": message_id,
            "role": "assistant",
            "content": custom_reply,
            "timestamp": datetime.now().isoformat(),
            "category": chat_sessions[session_id].get("category", "general")
        }
        chat_sessions[session_id]["messages"].append(assistant_msg)
        
        def generate_custom():
            metadata = {
                "id": message_id,
                "role": "assistant",
                "category": chat_sessions[session_id].get("category", "general"),
                "timestamp": datetime.now().isoformat(),
                "status": "streaming"
            }
            yield f"data: {json.dumps(metadata)}\n\n"
            
            data = {
                "id": message_id,
                "chunk": custom_reply,
                "position": 0,
                "code_block": False
            }
            yield f"data: {json.dumps(data)}\n\n"
            
            complete_data = {"id": message_id, "status": "complete", "final_content": custom_reply}
            yield f"data: {json.dumps(complete_data)}\n\n"
        
        return Response(generate_custom(), mimetype='text/event-stream')

    category = data.get('category')
    if category:
        if category not in ASSISTANT_CATEGORIES:
            logging.warning(f"Invalid category requested: {category}. Defaulting to 'general'.")
            category = "general"  # Fallback to general category if invalid input
        chat_sessions[session_id]["category"] = category  # Update category in session
    else:
        category = chat_sessions[session_id].get("category", "general")  # Get existing or default

    if not chat_sessions[session_id]["messages"]:  # Set title on first message of the session
        chat_sessions[session_id]["title"] = user_message[:30] + "..." if len(user_message) > 30 else user_message

    user_msg = {
        "id": str(uuid.uuid4()),
        "role": "user",
        "content": user_message,
        "timestamp": datetime.now().isoformat()
    }
    chat_sessions[session_id]["messages"].append(user_msg)
    message_id = str(uuid.uuid4())  # Unique ID for this assistant message

    def generate():
        metadata = {
            "id": message_id,
            "role": "assistant",
            "category": category,
            "timestamp": datetime.now().isoformat(),
            "status": "streaming"
        }
        yield f"data: {json.dumps(metadata)}\n\n"  # Initial metadata chunk


        try:  # Handle Gemini API call
            system_prompt = ASSISTANT_CATEGORIES[category]["system_prompt"]  # Get category prompt

            # Formatting instructions based on category (example: coding, math)
            if category == "coding":
                system_prompt += " Always use proper markdown code formatting with language specification, e.g., ```python for Python code."
            elif category == "math":
                system_prompt += " Format mathematical expressions clearly. You can use $...$ for inline math notation and $$...$$ for display math. Ensure all mathematical answers are precise and accurate." # Accuracy for math

            chat_history = [  # Prepare chat history for Gemini API
                {"role": "user", "parts": [system_prompt]},
                {"role": "model", "parts": ["I understand I am IND ChatAI, developed by RMH at Scube Innovation, and I'll respond accordingly."]}  # Updated initial bot acknowledgement
            ]

            for msg in chat_sessions[session_id]["messages"][:-1]:  # Add previous messages (except last user msg)
                if msg["role"] == "user":
                    chat_history.append({"role": "user", "parts": [msg["content"]]})
                elif msg["role"] == "assistant":  # Correct role check to "assistant"
                    chat_history.append({"role": "model", "parts": [msg["content"]]})

            chat_history.append({"role": "user", "parts": [user_message]})  # Append current user message

            model = genai.GenerativeModel(LATEST_GEMINI_MODEL)  # Use latest model constant
            logging.debug(f"Sending request to Gemini with {len(chat_history)} messages")  # Debug log for message context

            chat = model.start_chat(history=chat_history[:-1])  # Start chat with history
            stream = chat.send_message(user_message, stream=True)  # Send message with streaming

            full_response = ""
            position = 0
            code_block_open = False  # Track code block for UI rendering hints

            for chunk in stream:  # Process response chunks from Gemini
                if hasattr(chunk, 'text') and chunk.text:  # Check for text content in chunk
                    content = chunk.text
                    formatted_chunk = format_streaming_chunk(content, category)  # Format chunk

                    # Code block tracking (for frontend hints on rendering)
                    if "```" in formatted_chunk:
                        backtick_count = formatted_chunk.count("```")
                        for _ in range(backtick_count):
                            code_block_open = not code_block_open  # Toggle state on backticks

                    full_response += formatted_chunk  # Accumulate full response
                    data = {  # Data payload for each chunk sent to frontend
                        "id": message_id,
                        "chunk": formatted_chunk,
                        "position": position,
                        "code_block": code_block_open  # Send code_block status to frontend
                    }
                    yield f"data: {json.dumps(data)}\n\n"  # Send chunk data to client (SSE format)
                    position += len(formatted_chunk)

            formatted_response = format_code_blocks(full_response)  # Final format for code blocks
            complete_data = {"id": message_id, "status": "complete", "final_content": formatted_response}
            yield f"data: {json.dumps(complete_data)}\n\n"  # Signal completion with formatted response

            assistant_msg = {  # Create assistant message object for chat history
                "id": message_id,
                "role": "assistant",
                "content": formatted_response,
                "timestamp": datetime.now().isoformat(),
                "category": category
            }
            chat_sessions[session_id]["messages"].append(assistant_msg)  # Add to session history

        except Exception as e:  # Error handling for Gemini API calls
            logging.error(f"Error in Gemini stream for session {session_id}: {str(e)}")  # Log detailed error
            error_message = f"I'm sorry, but I encountered an error: {str(e)}"
            error_data = {"id": message_id, "chunk": error_message, "position": 0, "error": "Gemini API Error"}  # Error flag for frontend
            yield f"data: {json.dumps(error_data)}\n\n"  # Send error chunk
            complete_data = {"id": message_id, "status": "complete", "final_content": error_message, "error": "Gemini API Error"}
            yield f"data: {json.dumps(complete_data)}\n\n"  # Completion with error message
            assistant_msg = {  # Create error message for chat history
                "id": message_id,
                "role": "assistant",
                "content": error_message,
                "timestamp": datetime.now().isoformat(),
                "category": category,
                "error": "Gemini API Error"
            }
            chat_sessions[session_id]["messages"].append(assistant_msg)  # Append error message to session

    return Response(generate(), mimetype='text/event-stream')  # Return SSE response generator

@app.route('/api/chat/<session_id>/message', methods=['POST'])
def send_message(session_id):
    """Non-streaming endpoint for sending messages to Gemini and receiving a complete response."""
    if session_id not in chat_sessions:
        return jsonify({"error": "Chat session not found"}), 404

    data = request.json
    user_message = data.get('message', '')
    if not user_message:
        return jsonify({"error": "No message provided"}), 400

    # Check for custom responses first
    custom_reply = custom_response(user_message)
    if custom_reply:
        message_id = str(uuid.uuid4())
        
        # Add user message to session
        user_msg = {
            "id": str(uuid.uuid4()),
            "role": "user",
            "content": user_message,
            "timestamp": datetime.now().isoformat()
        }
        chat_sessions[session_id]["messages"].append(user_msg)
        
        # Add assistant response to session
        assistant_msg = {
            "id": message_id,
            "role": "assistant",
            "content": custom_reply,
            "timestamp": datetime.now().isoformat(),
            "category": chat_sessions[session_id].get("category", "general")
        }
        chat_sessions[session_id]["messages"].append(assistant_msg)
        
        return jsonify({
            "id": assistant_msg["id"],
            "content": assistant_msg["content"],
            "category": chat_sessions[session_id].get("category", "general")
        })

    category = data.get('category')
    if category:
        if category not in ASSISTANT_CATEGORIES:
            logging.warning(f"Invalid category requested: {category}. Defaulting to 'general'.")
            category = "general"
        chat_sessions[session_id]["category"] = category

    if not chat_sessions[session_id]["messages"]:  # Set title on first message for non-streaming too
        chat_sessions[session_id]["title"] = user_message[:30] + "..." if len(user_message) > 30 else user_message

    user_msg = {
        "id": str(uuid.uuid4()),
        "role": "user",
        "content": user_message,
        "timestamp": datetime.now().isoformat()
    }
    chat_sessions[session_id]["messages"].append(user_msg)


    try:  # Gemini API call for non-custom responses
        system_prompt = ASSISTANT_CATEGORIES[category]["system_prompt"] if category in ASSISTANT_CATEGORIES else ASSISTANT_CATEGORIES["general"]["system_prompt"]

        if category == "coding":
            system_prompt += " Always use proper markdown code formatting with language specification, e.g., ```python for Python code."
        elif category == "math":
            system_prompt += " Format mathematical expressions clearly. You can use $...$ for inline math notation and $$...$$ for display math. Ensure all mathematical answers are precise and accurate." # Accuracy for math

        chat_history = [  # History prep - same as streaming version but no streaming
            {"role": "user", "parts": [system_prompt]},
            {"role": "model", "parts": ["I understand I am IND ChatAI, developed by RMH at Scube Innovation, and I'll respond accordingly."]}  # Updated bot acknowledgement
        ]
        for msg in chat_sessions[session_id]["messages"][:-1]:  # Previous messages
            if msg["role"] == "user":
                chat_history.append({"role": "user", "parts": [msg["content"]]})
            elif msg["role"] == "assistant":  # Correct role is 'assistant'
                chat_history.append({"role": "model", "parts": [msg["content"]]})
        chat_history.append({"role": "user", "parts": [user_message]})  # Current user message

        model = genai.GenerativeModel(LATEST_GEMINI_MODEL)  # Use latest model constant
        chat = model.start_chat(history=chat_history[:-1])
        response = chat.send_message(user_message)  # No stream=True for non-streaming

        response_text = format_code_blocks(response.text)  # Format response

        assistant_msg = {
            "id": str(uuid.uuid4()),
            "role": "assistant",
            "content": response_text,
            "timestamp": datetime.now().isoformat(),
            "category": category
        }
        chat_sessions[session_id]["messages"].append(assistant_msg)  # Append assistant message to session

        return jsonify({
            "id": assistant_msg["id"],
            "content": assistant_msg["content"],
            "category": category
        })

    except Exception as e:  # Error handling for non-streaming endpoint
        logging.error(f"Error in Gemini non-streaming endpoint for session {session_id}: {str(e)}")
        error_msg = {
            "id": str(uuid.uuid4()),
            "role": "assistant",
            "content": f"I'm sorry, but I encountered an error: {str(e)}",
            "timestamp": datetime.now().isoformat(),
            "error": "Gemini API Error"  # Error flag for frontend
        }
        chat_sessions[session_id]["messages"].append(error_msg)  # Append error message
        return jsonify({
            "id": error_msg["id"],
            "content": error_msg["content"],
            "error": str(e),
            "category": category  # Send category back in error response too
        })

@app.route('/api/chats', methods=['GET'])
def get_chats():
    """Endpoint to retrieve a list of chat sessions (for chat history display)."""
    chats_list = []
    for session_id, chat in chat_sessions.items():
        chats_list.append({
            "id": session_id,
            "title": chat["title"],
            "created_at": chat["created_at"],
            "category": chat.get("category", "general"),
            "message_count": len(chat["messages"])
        })

    chats_list.sort(key=lambda x: x["created_at"], reverse=True)  # Sort by creation date, newest first
    return jsonify(chats_list)

@app.route('/api/chat/<session_id>', methods=['DELETE'])
def delete_chat(session_id):
    """Endpoint to delete a chat session."""
    if session_id in chat_sessions:
        del chat_sessions[session_id]
        logging.info(f"Chat session deleted: {session_id}")
        return jsonify({"success": True, "message": f"Chat session {session_id} deleted"})  # Success message
    return jsonify({"error": "Chat session not found"}), 404  # Error if session not found

# --- Main Execution ---
if __name__ == '__main__':
    os.makedirs('static', exist_ok=True)
    os.makedirs('static/css', exist_ok=True)
    os.makedirs('static/js', exist_ok=True)  # Ensure static directories exist

    if GOOGLE_API_KEY:
        logging.info(f"Google API key is set (starts with {GOOGLE_API_KEY[:4]}...)")  # Info level log on API key status
    else:
        logging.warning("WARNING: No Google API key found! API functionality will be limited.")  # Warning level for missing key

    port = int(os.environ.get('PORT', 5000))
    app.run(debug=True, host='0.0.0.0', port=port, use_reloader=True)  # Debug mode and reloader for development
