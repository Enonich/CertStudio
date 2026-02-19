import requests

url = "http://127.0.0.1:8000/api/generate-file-upload"

# Minimal required fields
files = {
    'template': ('template.pdf', b'%PDF-1.4 empty pdf content', 'application/pdf'),
}
start_fields = '{"default_font": "Helvetica", "default_size": 18, "fields": [{"id": "1", "name": "Name", "x": 100, "y": 100, "w": 200, "h": 50}]}'
data = {
    'fields_json': start_fields,
    'placeholder_mode': 'true',
    'overlay_only': 'true',
    'page_size': 'letter'
}

try:
    response = requests.post(url, files=files, data=data)
    print(f"Status Code: {response.status_code}")
    print(f"Headers: {response.headers}")
    if response.status_code != 200:
        print(f"Content: {response.text}")
    else:
        print(f"Content Length: {len(response.content)}")
except Exception as e:
    print(f"Request failed: {e}")
