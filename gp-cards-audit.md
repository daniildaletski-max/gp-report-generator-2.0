# GP Cards Visual Audit - Feb 6 2026

## Current State
- GP cards now have dark purple glassmorphism backgrounds (dark purple/navy with border)
- Cards are in a 4-column grid layout
- Each card shows: GP name, team, attitude score, thumbs down/up buttons, error count, games count
- Cards have red dashed borders (from CSS gp-card class)
- Attitude buttons (thumbs down, reset, thumbs up) are visible
- Footer shows error count (triangle icon) and games count (activity icon)

## Issues Found
1. Cards have RED DASHED borders - should be solid subtle purple borders
2. The checkbox in top-right is functional but looks like a plain checkbox
3. Attitude section looks cramped
4. The "0" attitude badge is plain
5. Footer stats section could be cleaner

## Design Improvements Needed
- Change card borders from red dashed to solid subtle purple
- Improve card spacing and padding
- Make attitude buttons more visually appealing
- Add hover effects to cards
- Improve the overall card layout for better readability
