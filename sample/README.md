# Sample Fonts

## monaco8_variable_SAMASCII.fnt.json

This is a variation on the Apple Monaco 9 font, with 
some glyphs changed to fit in an 8x8 character grid.

It's designed as a variable width font, intended for
use in Mode 3, and uses the SAM ASCII code-points. It
doesn't redefine the e-acute or caps shift character
codepoints.

It's included here as an example font.

(Hand drawn by Simon Cooke, using Monaco 9 as a reference).

## SAM Coupe International Character Set.fnt.json

The SAM Coupe international character set that shipped with the SAM Coupe Utilities, extracted and imported.

## ZX Spectrum.fnt.json

The ZX Spectrum font from the ROM — the standard 96-character set (codepoints
32–127), at 8x8. Matches the raw `Spectrum.bin` dump below.

## Bin files

These are included so that you can experiment with the import Raw font feature and see how it works.

Most of these (except the sami10nfont.bin) are from the archive at https://mdfs.net/Apps/Font/img/SysFonts/

| Name | Description |
| --- | --- |
| AmstradCPC.bin | The Amstrad CPC system font — 256 characters at 8x8. |
| apple_ii.bin | An Apple II character generator ROM — 512 glyphs at 8x8, consistent with an Apple IIe ROM's primary and alternate ("MouseText") character sets. |
| AtariST.bin | The Atari ST system font — 256 characters at 8x8. |
| BBC.bin | The BBC Micro's MOS font — 96 characters (the printable ASCII range) at 8x8. |
| c64.bin | The Commodore 64 character ROM — 512 glyphs at 8x8, its two 256-character banks (uppercase/graphics and lowercase/uppercase). |
| Master.bin | The Sega Master System BIOS font — 224 characters at 8x8. |
| MSX.bin | The MSX system font — 256 characters at 8x8. |
| sami10nfont.bin | The SAM Coupe international font + basic ROM characterset |
| SinclairQL.bin | The Sinclair QL system font — 224 characters at 8x16. |
| Spectrum.bin | The ZX Spectrum ROM font — the same 96 characters as `ZX Spectrum.fnt.json` above. |
