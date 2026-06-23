import sys
import os

# Add the project root to the path so the backend package can be imported
sys.path.append(os.path.join(os.path.dirname(__file__), ".."))

from backend.server import app
