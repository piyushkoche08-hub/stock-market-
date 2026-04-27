from flask import Flask, render_template
from flask_cors import CORS
from backend.routes import api_bp
import os

app = Flask(__name__, 
            static_folder='static', 
            template_folder='templates')
CORS(app)

# Register API routes
app.register_blueprint(api_bp)

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/markets')
def markets():
    return render_template('markets.html')

@app.route('/portfolio')
def portfolio():
    return render_template('portfolio.html')

@app.route('/reports')
def reports():
    return render_template('reports.html')

# Fallback for other .html files if needed
@app.route('/<page>.html')
def serve_html(page):
    return render_template(f'{page}.html')

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8000, debug=True)
