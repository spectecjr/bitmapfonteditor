# Font Editor

This project is meant to be a way of building bitmap fonts which are variable or fixed width (fixed is
just a special case of variable). 

## Color and storage

Fonts are monochrome, and bitmaps (each set bit corresponds to a solid part of the font; each reset is transparent and shows the background). If a font is 1-8 bits wide for its largest character, it will be
stored as 1 byte per line. If it's 9-16 pixels wide, it'll be stored as 2 bytes per line. At maximum we allow
4 bytes per line.

Lines are also variable; we default to 8 lines per character, but allow up to 32 lines deep.

## Character Set

By default, the font codepage used will be a modified version of CP437, which matches the SAM Coupe home computer
(that is, backtick is replaced by the pound sterling symbol, and 0x7f is a copyright symbol - but otherwise all glyphs are the same as in the CP437 set). However this should be editable both in the font editor, and by exporting/reloading a mapping file between code-points and characters.

The mapping isn't stored in the output font data; it's a separate file.

It's up to the user if they want to include codes below 32 or above 128. Codes 0-255 are valid.

## User Interface

The user interface should default to the first character selected. A panel on the right of the screen shows the characters currently defined in the font, plus to their right, the character it is mapping to (in a system font). This list can be scrollable, but starts at the top. The selected character ends up being displayed in the matrix on the left.

The width of a cell starts at the maximum width, and is represented as a large draggable line with upward facing triangles at the bottom, downward facing triangles at the top. Until the font is saved, we keep the bits regardless of where the width marker is placd. 

On the left we see an NxM matrix with black/white cells, and dotted lines for each row/column. Clicking in a cell toggles it on/off.

## Helper Menu items

### ASCII table

The menu allows the user to populate the font glyph map with the traditional CP437 character set code points.

## Output

- A bitmap file with each character listed sequentially from beginning to end, in 1bpp format. 
- A JSON file with the width of each character in the sequence.
- A JSON file with the codepoint mapping. 
