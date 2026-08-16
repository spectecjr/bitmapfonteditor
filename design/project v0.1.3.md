# Font Editor - v0.1.3

## Bugs

### Moving guides isn't part of undo/redo stack

Moving the guides should be part of the undo/redo stack.

## Feature requests

### Add an additional preview mode

The preview mode should pop open the current font in a window which is magnified by 1x, 2x or 4x (selectable by a button in the window). The 
window width and height in pixels should be a Font Editor global setting, but default to 512 x 192.

It should also be possible to choose the width of the pixels - normal (square) or half-width.

### Toggle black/white mode by clicking on the preview

Clicking on the preview text should toggle the background color of the preview text area between black and white, in addition to the existing menu toggle.

### Character map code-point numbers

Double-clicking the existing code-point value should open the remapping dialog,
the same way as the menu item.

Each code-point should show the hexadecimal AND decimal value. Show the decimal
centered below the hexadecimal value.

Show codepoint values in normal text color, not dimmed (on this system that would be white, not gray).

### Swap ghost glyph with primary glyph

Add a menu option + shortcut key to swap the bitmaps for the ghost glyph and primary glyph.

### Whole font operations

#### Edit commands

Under Edit, add a submenu for "Whole Font", and in there, give the same options as for modifying a single glyph - shift, invert, Flip, Clear - with distinct shortcuts (possibly different modifier combos if they don't clash with existing). These operations should operate on every glyph simultaneously.

#### Advance widths

Similarly, add the ability to shift-drag the Advance Width guide and it should then apply its new location to every character in the font. Ctrl+Shift+Drag should apply a relative adjustment to the advance width in every glyph in the font, previewing the outcome in the character map - but only truly applying it once the advance width guide is released.

### Code points

#### Range trimming

Add a menu option to set the code-point range. This should open a dialog asking for the minimum and maximum code point values. Any code points outside this range should
be discarded.

#### Code point values

Anywhere a codepoint value can be entered into a dialog, allow decimal or hexadecimal values (in the form 0xNN, where NN are hexadecimal digits).

Where codepoint values are shown, show in the form "nnn (0xNN)", where nnn is a decimal value, and 0xNN is the hexadecimal form. Entry should be "nnn" or "0xnn" once the user starts typing. 

### Add a "Recently opened file" MRU list to the file menu

Please add a recently opened file MRU list to the File Menu as a sub-menu.

Files which don't exist any more should be removed from the list when the sub-menu
is opened, and when the app is closed. (Or choose your own preferred lazy scheme
that minimizes slow down loading the app or opening the File menu).

In the unlikely event a file is still in the menu that doesn't exist (it could
happen), show an appropriate message box to the user and remove it from the list.

If it's easy, you could add filesystem notification watchers depending on the platform and support in Electron, and remove them from the list if the user
deletes them from the filesystem.

## Additional requests for this version

### Magnifier Preview

- By default should use the same preview text as is stored in the main window (copied from that text edit control on opening). BUT, it should be editable.
- Shouldn't have any menu items (currently it duplicates the main window menu) other than Window > Close
- Should have a toggle to enable/disable wrapping to the dimensions of the preview window.
- The Magnifier preview should close when the main window closes; it should be parented to the main window as a child non-modal dialog.

### Mapping editor pop-up

Add the ability to enter a decimal or hexadecimal value for the codepoint as well as entering a character. Choose between them using a radio button. Editing text in one of the text boxes should auto
select its corresponding radio button. Selecting the other radio button shouldn't disable text boxes.

### Additional Font Helpers

Add the ability to populate the codepoints with standard ASCII from the Helper menu.
Add the ability to populate the codepoints with the SAM Coupe ASCII variant from the helper menu. (This is the same as the CP437 SAM Coupe variant you have, but only defines codepoints 32-127).

### Preview text

Add the rest of the ASCII visible set of characters (32-127) that are not represented in the preview text string, to the end of the string, after the numbers.

### Menu & About... tweaks

I've made some changes to the menus (moved font import to File, cleaned up some separators) and the about dialog - this is just to inform you of the change; I've done the work here. Feel free to verify that I didn't mess up.

## Additional features 2

### Codepoint editing

Please add a shortcut to insert a new codepoint before/after the previous one.

Please add a function to renumber the codepoints, asking for a starting value, and then incrementing by 1 until the end of the range.
