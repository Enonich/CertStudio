# Font Selection Policy (Current)

This project now enforces a strict "only renderable fonts" policy in the UI.

## What Is Selectable In The App

The font dropdown only includes:

1. ReportLab built-in fonts (Base-14):
   - Helvetica, Helvetica-Bold, Helvetica-Oblique, Helvetica-BoldOblique
   - Times-Roman, Times-Bold, Times-Italic, Times-BoldItalic
   - Courier, Courier-Bold, Courier-Oblique, Courier-BoldOblique
   - Symbol, ZapfDingbats
2. Uploaded custom fonts from `fonts/` (`.ttf`/`.otf`)

Not selectable anymore:
- Arbitrary system fonts
- Template-detected font names from PDF extraction

Template font extraction is still used for information/status only.

## Why This Was Changed

ReportLab can only use:
- Built-in fonts, or
- Fonts that are explicitly registered.

Showing non-registered fonts in the selector caused runtime failures like:
`KeyError: 'Brush Script MT'`

## How To Add More Fonts

1. Put `.ttf` or `.otf` files in `fonts/`
2. Use the font name equal to the filename without extension
3. Generate again (fonts auto-register during generation)

Example:
- File: `GreatVibes-Regular.ttf`
- Select/use: `GreatVibes-Regular`

## API Support

- `GET /api/list-custom-fonts` lists uploaded fonts
- `POST /api/upload-font` uploads a new font
- `DELETE /api/delete-font/{filename}` removes a font

## Fallback Safety

Backend generation now resolves unavailable fonts to a safe fallback (`Helvetica`)
instead of crashing.

