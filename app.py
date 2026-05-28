import os

from flask import Flask
from flask_cors import CORS
from flask_compress import Compress

from backend.routes import api_bp
from frontend.routes import frontend_bp


def create_app():
    app = Flask(__name__, static_folder="static", template_folder="templates")
    app.config["MAX_CONTENT_LENGTH"] = 16 * 1024 * 1024
    app.config["COMPRESS_ALGORITHM"] = ["gzip", "br"]
    app.config["COMPRESS_MIN_SIZE"] = 500
    app.config["SEND_FILE_MAX_AGE_DEFAULT"] = 31536000

    CORS(app)
    Compress(app)
    app.register_blueprint(api_bp)
    app.register_blueprint(frontend_bp)
    return app


app = create_app()

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8000))
    app.run(host='0.0.0.0', port=port, debug=False)
