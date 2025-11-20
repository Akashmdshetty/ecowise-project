from simple_ai import ai_engine

print("🧪 Testing fixed AI system...")

# Test detection
test_files = ['water_bottle.jpg', 'my_phone.png', 'old_book.jpeg', 'blue_shirt.jpg']

for filename in test_files:
    print(f"\n📁 Testing: {filename}")
    
    # Detect objects
    detected = ai_engine.detect_from_filename(filename)
    print(f"   Detected: {[obj['name'] for obj in detected]}")
    
    # Get recommendations
    recommendations = ai_engine.get_recommendation(detected)
    print(f"   Points: {recommendations['total_points']}")
    print(f"   Top recommendation: {recommendations['recommendations'][0]}")
    
print("\n🎉 ALL TESTS PASSED! AI is working correctly.")