# Font Availability Guide

## Understanding Font Selection vs. Font Availability

The dropdown now shows **all fonts**, but **not all fonts will work** in the generated PDFs unless they're properly installed or embedded. Here's what you need to know:

---

## 🟢 Fonts That Always Work (Standard PDF Fonts)

These are built into the PDF specification and work everywhere:
- **Helvetica** (and Bold, Oblique variants)
- **Times-Roman** (and Bold, Italic variants)
- **Courier** (and Bold, Oblique variants)

✅ **Recommended for certificates that must work on any system**

---

## 🟡 Fonts That May Work (System Fonts)

These fonts work **only if installed** on the server where PDFs are generated:

### Common on Windows:
- Arial, Times New Roman, Calibri, Cambria, Georgia, Verdana, Century

### Common on Mac/Linux:
- Helvetica, Times, Palatino, Garamond, Baskerville

⚠️ **May fail if generating PDFs on a different OS**

---

## 🔴 Fonts That Likely Won't Work (Specialty Fonts)

These decorative/script fonts are **NOT installed** by default:
- Great Vibes, Alex Brush, Trajan Pro, Raleway
- LT Diploma, Chancery Cursive, Think Respect
- Certificate Script, Scholtz Certificate
- Willmaster Calligraphia, Engraver's Script
- Copperplate Script

❌ **Will fail unless you install them or provide TTF files**

---

## 📥 How to Make Custom Fonts Available

### Option 1: Install Fonts on the Server (Easiest for testing)

**Windows:**
1. Download the font file (.ttf or .otf)
2. Right-click → Install for all users
3. Restart your application

**Linux/Mac:**
```bash
# Copy font to system fonts directory
sudo cp YourFont.ttf /usr/share/fonts/truetype/
sudo fc-cache -f -v
```

### Option 2: Use Custom Font Files with `--font-path` (Recommended for production)

The application already supports custom fonts via the `--font-path` argument:

```bash
python certificate_overlay.py \
  --template certificate.pdf \
  --fields fields.json \
  --csv data.csv \
  --font-path path/to/GreatVibes-Regular.ttf
```

In the code, this registers the font as "CustomFont" and you can reference it in `fields.json`.

### Option 3: Enhance the Application to Support Multiple Custom Fonts

Currently, the app only supports one custom font at a time. To support multiple:

1. **Create a fonts directory:**
```bash
mkdir fonts
# Place your .ttf files here
```

2. **Update `certificate_overlay.py`** to auto-register all fonts in the directory:

```python
def register_custom_fonts(fonts_dir: Path) -> dict[str, str]:
    """Register all TTF fonts from a directory."""
    font_map = {}
    if not fonts_dir.exists():
        return font_map
    
    for font_file in fonts_dir.glob("*.ttf"):
        font_name = font_file.stem  # filename without extension
        pdfmetrics.registerFont(TTFont(font_name, str(font_file)))
        font_map[font_name] = str(font_file)
        print(f"Registered font: {font_name}")
    
    return font_map

# In main():
FONTS_DIR = ROOT_DIR / "fonts"
custom_fonts = register_custom_fonts(FONTS_DIR)
```

---

## 🎨 Where to Get Free Certificate Fonts

### Script/Calligraphy Fonts:
- **Google Fonts:** https://fonts.google.com/
  - Great Vibes (free)
  - Alex Brush (free)
  - Pinyon Script (alternative)
  - Dancing Script (alternative)

- **DaFont:** https://www.dafont.com/theme.php?cat=601
  - Search "certificate" or "calligraphy"
  - Check license (many are free for personal use)

### Professional Certificate Fonts:
- **Font Squirrel:** https://www.fontsquirrel.com/
  - 100% free for commercial use
  - Quality script and serif fonts

- **Adobe Fonts:** (requires subscription)
  - Trajan Pro
  - Many premium certificate fonts

### Specific Fonts:
- **Trajan Pro**: Adobe Fonts (paid) or similar free alternatives like "Cinzel"
- **Great Vibes**: Google Fonts (free)
- **Alex Brush**: Google Fonts (free)
- **Raleway**: Google Fonts (free)
- **LT Diploma**: Commercial font (purchase required)
- **Engraver's Script**: Commercial (or use "Copperplate" as alternative)

---

## 🔧 Implementation Steps for Your Application

### Immediate Solution (Manual):
1. Download fonts you want from Google Fonts or Font Squirrel
2. Install them on your Windows system
3. Select them in the UI - they should now work

### Better Solution (Fonts Directory):
1. Create `c:\Users\Enoch\Documents\GitHub\LLM\Cert_Temp\fonts\` directory
2. Download .ttf files and place them there
3. Modify `certificate_overlay.py` to auto-register all fonts from that directory
4. Reference fonts by their filename (without .ttf) in the UI

### Best Solution (Font Management API):
Create an API endpoint to:
- Upload custom fonts
- List available custom fonts
- Auto-register them for certificate generation
- Show only truly available fonts in the UI dropdown

---

## 📝 Example: Adding Great Vibes Font

1. **Download:** https://fonts.google.com/specimen/Great+Vibes
2. **Extract:** `GreatVibes-Regular.ttf`
3. **Install (Windows):** Right-click → Install
4. **Test:** Select "Great Vibes" in the dropdown and generate a certificate
5. **Alternative:** Place in `fonts/` directory and update code to auto-register

---

## ⚠️ Important Notes

1. **Licensing:** Ensure you have rights to use fonts in your certificates
2. **Embedding:** Some fonts prohibit embedding in PDFs (check license)
3. **File Size:** Embedding custom fonts increases PDF file size
4. **Fallback:** Always test with standard fonts (Helvetica, Times) as backup
5. **Server Environment:** If deploying to a server, fonts must be available there too

---

## 🚀 Recommended Quick Start

**For immediate use:**
- Use **Helvetica**, **Times-Roman**, or **Courier** (always work)

**For pretty certificates:**
1. Download **Great Vibes** from Google Fonts (free, script font)
2. Download **Cinzel** from Google Fonts (free, Trajan alternative)
3. Install both on Windows
4. Select them in the UI

**For production:**
- Create a `fonts/` directory
- Store all .ttf files there
- Update code to auto-register from that directory
- Only show installed fonts in the UI dropdown
