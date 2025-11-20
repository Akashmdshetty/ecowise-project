# ai_service.py
import random
import os

# This is a simple mock detector. Replace with real model call.
# Returns a dict with structure used by frontend.

DETECTION_CATALOG = [
    {"name":"Plastic Bottle", "type":"plastic", "points":10, "carbon":0.1},
    {"name":"Glass Jar", "type":"glass", "points":8, "carbon":0.2},
    {"name":"Aluminum Can", "type":"metal", "points":5, "carbon":0.05},
    {"name":"Old Books", "type":"paper", "points":15, "carbon":0.3},
    {"name":"Smartphone", "type":"e-waste", "points":25, "carbon":1.2},
    {"name":"Clothes", "type":"textile", "points":12, "carbon":0.4}
]

def analyze_image_file(path):
    # Basic validation
    exists = os.path.exists(path)
    if not exists:
        return {"success": False, "error": "file not found"}

    # Simulate detection: pick 1-3 objects
    count = random.randint(1, 3)
    objects = random.sample(DETECTION_CATALOG, count)
    detected = []
    total_points = 0
    total_carbon = 0.0
    for obj in objects:
        confidence = round(random.uniform(0.7, 0.99), 2)
        detected.append({
            "name": obj['name'],
            "type": obj['type'],
            "confidence": confidence
        })
        total_points += obj['points']
        total_carbon += obj['carbon']

    result = {
        "objects_detected": count,
        "detected_objects": detected,
        "eco_points": total_points,
        "carbon_saved_kg": round(total_carbon, 2),
        "recommendations": [
            "Separate recyclables by material",
            "Rinse containers before dropping at centers",
            "Drop e-waste at certified collection points"
        ],
        "success": True
    }
    return result
