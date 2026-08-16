# Font Editor - v0.1.2

These are additional features we should add for v0.1.2:

## Already done (bugs etc)

- We fixed the naming of Project -> Font
- Fixing bug with resizing the charater map column.

## New Features

### Add import existing font function

This should take a raw binary file (by default,
8 bitmap pixels per line, characters are 8x8), and
load it into the character map. 

The Import dialog should examine the font file size, and
estimate the number of characters in the font.

The dialog should allow the user to override:

- The character start point (by default, the first codepoint is character 32).
- The number of lines per character (default = 8).
- The number of bytes per line (default = 1)
- How the bytes are laid out (by column or by row)

... and then import the font file.

If the font file is not an integer multiple of characters, warn the user, but allow them to proceed
anyway - just pad to the nearest character boundary
with zeroes.

### Font file author information and description

The user should be able to provide the following
info for the font:

- Author
- Email address
- Date created (generated automatically from first save)
- Date last modified (automatically generated from last save)
- The font name (this is allowed to be different to the filename, but the filename can be generated from it).
- A freeform text field containing the description of the font. This is essentially unlimited and a scrollable text box; it should at least be possible to enter 5,000 characters here, if guidance is needed for a maximum size.

None of these are mandatory.

When the font is being created (via New Font...),
the following fields are editable. When examining the
Font's current properties, the same dialogue is shown
but the properties are read-only (they're configurable
elsewhere in the app).

- If the font is fixed-width or variable (default is variable)
- The font width in bytes (and maximum width in pixels) (default is 1 byte wide)
- The font glyph height in lines (default is 8 lines high)
- The first codepoint in the font (default is 32)
- The last codepoint in the font (default is 127)
- (Not editable - the number of characters in the codepoint range is shown).
- The font codepoint mapping to use (optional; load from disk)

The following are read-only and only show up after the
font is created, via the `Font Properties...` menu item.

- The projected size of the exported font binary info on disk in bytes.

### Add the ability to fill the font from a font installed on the host machine

As a Helper function, allow the user to select a menu item to select a font on their system, and populate
the font bitmap. 

Populating the bitmap should include:

- Rendering it at the right glyph size to match the current bitmap font settings.
- Offer the user to make the bitmap font wider (more bytes wide) if it won't fit in the current max-width
- Set the guidelines to match the font metrics for
  x-height/Cap/baseline
- Populate the advance width for each character based on the font metrics for each glyph, including a single line space for the advance.

### In the character map, for variable width fonts, only show the actual width of the glyph in the preview

The entire design surface should be represented, but the regions that are to the right of the advance width of each glyph should be rendered with dark red pixels.
