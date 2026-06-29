# Changelog

## Unreleased

- Added compact up/down controls to every inventory quantity field.
- Each click increases or decreases the evaluated value by 1.
- Values are clamped at 0 and arithmetic expressions remain supported.
- Button changes continue to trigger automatic calculation and local saving.

## 1.2.11

- Set the global inventory material icon area to 45 px high.
- Set material-name rows to 18 px.
- Set spacing between the name and input to 3 px.
- Set quantity inputs to 23 px high.
- Use an 11 px font for material names and quantity inputs.
- Render material images at 42 × 42 px.
- Preserve the image fallback order: Nanoka, Lunaris, then a rarity-colored placeholder.
- Keep Nanoka and Lunaris source checks silent when successful; display diagnostics only on failure.

## 1.2.6–1.2.10

- Added Lunaris as a backup material image source.
- Added background image-source diagnostics.
- Refined the two-row material inventory layout and alignment.

## 1.2.4–1.2.5

- Corrected Nanoka image asset paths.
- Enlarged and reorganized material icon slots.

## 1.2.0–1.2.3

- Added merged live/latest character and weapon data.
- Added preview tagging for entries absent from the live dataset.
- Added character and weapon search and filters.
- Added material image loading and fallback handling.
