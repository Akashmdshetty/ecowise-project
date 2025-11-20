# app.py
from flask import Flask, jsonify, request, send_from_directory, abort
from flask_cors import CORS
import os
import uuid
from werkzeug.utils import secure_filename
from database import Database
from ai_service import analyze_image_file

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
UPLOAD_FOLDER = os.path.join(BASE_DIR, 'uploads')
FRONTEND_DIR = os.path.join(BASE_DIR, 'frontend')

os.makedirs(UPLOAD_FOLDER, exist_ok=True)

app = Flask(__name__, static_folder=FRONTEND_DIR)
CORS(app)

db = Database(os.path.join(BASE_DIR, 'ecowise.db'))  # file db
db.init_db_if_needed()

@app.route('/')
def index():
    return jsonify({
        "routes": [
            "/recycling-centers",
            "/user/<username>",
            "/user/<username>/history",
            "/detect (POST)",
            "/get-directions/<id>"
        ],
        "status": "EcoWise backend running"
    })

# Serve frontend static files
@app.route('/<path:filename>')
def serve_frontend(filename):
    # send static files from frontend directory
    path = os.path.join(FRONTEND_DIR, filename)
    if os.path.exists(path):
        return send_from_directory(FRONTEND_DIR, filename)
    else:
        # If not found, return index (SPA fallback)
        index_path = os.path.join(FRONTEND_DIR, 'index.html')
        if os.path.exists(index_path):
            return send_from_directory(FRONTEND_DIR, 'index.html')
        return abort(404)

@app.route('/recycling-centers', methods=['GET'])
def recycling_centers():
    centers = db.get_centers()
    return jsonify(centers)

@app.route('/user/<username>', methods=['GET'])
def get_user(username):
    user = db.get_user(username)
    if not user:
        return jsonify({"error":"User not found"}), 404
    return jsonify(user)

@app.route('/user/<username>/history', methods=['GET'])
def user_history(username):
    history = db.get_history(username)
    return jsonify({"history": history})

@app.route('/leaderboard', methods=['GET'])
def leaderboard():
    lb = db.get_leaderboard(limit=20)
    return jsonify(lb)

@app.route('/get-directions/<int:center_id>', methods=['GET'])
def get_directions(center_id):
    center = db.get_center_by_id(center_id)
    if not center:
        return jsonify({"error":"Center not found"}), 404
    # mock directions info
    directions = {
        "id": center['id'],
        "name": center['name'],
        "directions": f"Head to {center['address']}. Follow main road for 1 km then turn right.",
        "transport": ["Bus lines 4, 7", "Auto-rickshaw available nearby", "Walking 10 mins from bus stop"],
        "landmarks": ["Central Bus Stand", "MG Road Junction"],
        "phone": center.get('phone', ''),
    }
    return jsonify(directions)

# POST /detect - accepts image file and username and returns detection result
@app.route('/detect', methods=['POST'])
def detect():
    if 'image' not in request.files:
        return jsonify({"success": False, "error": "No image file provided"}), 400
    file = request.files['image']
    username = request.form.get('username', 'guest')
    if file.filename == '':
        return jsonify({"success": False, "error": "Empty filename"}), 400

    filename = secure_filename(file.filename)
    unique = f"{uuid.uuid4().hex}_{filename}"
    save_path = os.path.join(UPLOAD_FOLDER, unique)
    file.save(save_path)

    # call ai_service to analyze - returns dict
    result = analyze_image_file(save_path)

    # update DB: record history and adjust points / stats
    points = result.get('eco_points', 0)
    carbon = result.get('carbon_saved_kg', 0)
    items = result.get('objects_detected', 0)

    db.add_history(username=username,
                   filename=filename,
                   points=points,
                   carbon_saved_kg=carbon,
                   objects_detected=items,
                   stored_path=save_path)

    db.increment_user_stats(username, points, items, carbon)

    # Return result including filename for frontend
    result['filename'] = filename
    result['success'] = True
    return jsonify(result)

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
