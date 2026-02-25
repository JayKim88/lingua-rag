"""
Application-wide constants.

Centralising values that are used across multiple modules prevents
silent divergence if one copy is renamed or mistyped.
"""

# Session cookie name shared by chat.py and conversations.py
SESSION_COOKIE: str = "lingua_session"
