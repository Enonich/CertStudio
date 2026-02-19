import requests
import io

url = "http://127.0.0.1:8000/api/generate-file-upload"

# Create a minimal valid PDF content
pdf_content = b"%PDF-1.4\n1 0 obj <</Type/Catalog/Pages 2 0 R>> endobj\n2 0 obj <</Type/Pages/Kids[3 0 R]/Count 1>> endobj\n3 0 obj <</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R/Resources<<>>>> endobj\nxref\n0 4\n0000000000 65535 f\n0000000010 00000 n\n0000000060 00000 n\n0000000117 00000 n\ntrailer <</Size 4/Root 1 0 R>>\nstartxref\n220\n%%EOF"

files = {
    'template': ('template.pdf', pdf_content, 'application/pdf'),
}
start_fields = '{"default_font": "Helvetica", "default_size": 18, "fields": [{"id": "1", "name": "Name", "x": 100, "y": 100, "w": 200, "h": 50}]}'
data = {
    'fields_json': start_fields,
    'placeholder_mode': 'true',
    'overlay_only': 'true', # Changed to true so we don't need valid template for merge test
    'page_size': 'letter'
}

try:
    print("Sending request...")
    response = requests.post(url, files=files, data=data)
    print(f"Status Code: {response.status_code}")
    print(f"Headers: {response.headers}")
    if response.status_code != 200:
        print(f"Content: {response.text}")
    else:
        print(f"Content Length: {len(response.content)}")
        with open("test_output.pdf", "wb") as f:
            f.write(response.content)
            print("Wrote test_output.pdf")
except Exception as e:
    print(f"Request failed: {e}")
