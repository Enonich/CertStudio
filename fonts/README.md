# Custom Fonts Directory

Place your custom font files (`.ttf` or `.otf`) in this directory to make them available for certificate generation.

## How It Works

When you generate certificates, the application automatically:
1. Scans this `fonts/` directory
2. Registers all `.ttf` and `.otf` files
3. Makes them available by their filename (without extension)

In the UI, selectable fonts are restricted to:
- ReportLab built-in fonts (Base-14)
- Fonts registered from this directory

## Usage

### Step 1: Download Fonts

Download font files from:
- **Google Fonts**: https://fonts.google.com/ (100% free)
- **Font Squirrel**: https://www.fontsquirrel.com/ (free for commercial use)
- **DaFont**: https://www.dafont.com/ (check individual licenses)

### Step 2: Place in This Directory

Example structure:
```
fonts/
├── GreatVibes-Regular.ttf
├── AlexBrush-Regular.ttf
├── Raleway-Bold.ttf
├── Cinzel-Bold.ttf
└── README.md (this file)
```

### Step 3: Use in the Application

In the UI, select fonts by their filename (without `.ttf`):
- File: `GreatVibes-Regular.ttf` → Select: **GreatVibes-Regular**
- File: `AlexBrush-Regular.ttf` → Select: **AlexBrush-Regular**

## Recommended Free Fonts for Certificates

### Script/Elegant Fonts (from Google Fonts):
- **Great Vibes** - Elegant script font
- **Alex Brush** - Flowing brush script
- **Pinyon Script** - Classic calligraphy
- **Dancing Script** - Casual handwriting
- **Parisienne** - Elegant cursive

### Serif Fonts (formal certificates):
- **Cinzel** - Roman capitals (Trajan alternative)
- **Playfair Display** - High-contrast serif
- **Libre Baskerville** - Classic book font
- **Cormorant Garamond** - Elegant serif
- **EB Garamond** - Classical font

### Sans-Serif Fonts (modern certificates):
- **Raleway** - Elegant sans-serif
- **Montserrat** - Geometric sans-serif
- **Roboto** - Modern, clean
- **Open Sans** - Friendly and readable

## Quick Start Example

### Download Great Vibes from Google Fonts:
1. Go to: https://fonts.google.com/specimen/Great+Vibes
2. Click "Download family"
3. Extract `GreatVibes-Regular.ttf`
4. Place it in this `fonts/` directory
5. In the UI, select "GreatVibes-Regular" from the font dropdown
6. Generate your certificate!

## API Endpoint

Check available custom fonts:
```
GET http://localhost:8000/api/list-custom-fonts
```

Returns:
```json
{
  "fonts_directory": "C:/path/to/fonts",
  "fonts_directory_exists": true,
  "custom_fonts": [
    {"name": "GreatVibes-Regular", "file": "GreatVibes-Regular.ttf", "type": "ttf"},
    {"name": "AlexBrush-Regular", "file": "AlexBrush-Regular.ttf", "type": "ttf"}
  ],
  "count": 2
}
```

## Font Licensing

⚠️ **Important**: Ensure you have the right to use fonts in your certificates!

- **Google Fonts**: Free for personal and commercial use
- **Font Squirrel**: Check individual font licenses
- **DaFont**: Many are free for personal use only
- **Commercial Fonts**: Require license purchase

Always check the license file included with the font.

## Troubleshooting

### Font not appearing in dropdown?
- Ensure the file is `.ttf` or `.otf`
- Check the filename has no special characters
- Restart the application after adding fonts

### Certificate shows wrong font?
- The font may not support the characters you're using
- Try a different font
- Use standard PDF fonts (Helvetica, Times-Roman) as fallback

### Bold/Italic not working?
- Some fonts need separate files for bold/italic
- Example: `Raleway-Regular.ttf`, `Raleway-Bold.ttf`, `Raleway-Italic.ttf`
- Place all variants in this directory

## Need Help?

See the main documentation: `FONTS_GUIDE.md` in the project root.
