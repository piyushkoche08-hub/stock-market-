from flask import Blueprint, render_template


frontend_bp = Blueprint("frontend", __name__)


@frontend_bp.route("/")
def index():
    return render_template("index.html")


@frontend_bp.route("/markets")
def markets():
    return render_template("markets.html")


@frontend_bp.route("/portfolio")
def portfolio():
    return render_template("portfolio.html")


@frontend_bp.route("/reports")
def reports():
    return render_template("reports.html")


@frontend_bp.route("/<page>.html")
def serve_html(page):
    return render_template(f"{page}.html")
