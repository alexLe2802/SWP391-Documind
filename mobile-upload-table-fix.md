# Mobile upload and document table fix

## Goal
Make upload usable on narrow screens and keep the uploaded-document list compact, readable, and actionable without horizontal scrolling.

## Tasks
- [ ] Inspect upload layout, document table markup, status model, and existing AI retry API.
- [ ] Stack/reorder upload panels on mobile and constrain long selected filenames.
- [ ] Reorder compact table columns to File, Actions, AI, Date, Subject/Category.
- [ ] Add two-line filename truncation with full-name tooltip.
- [ ] Enable AI retry only for failed documents with immediate loading/error feedback.
- [ ] Add regression coverage and run responsive, accessibility, lint, test, and build checks.

## Done When
- [ ] The upload page fits a 360px viewport without horizontal scrolling.
- [ ] Long filenames wrap/clamp without pushing controls outside the viewport.
- [ ] Failed AI processing exposes a working retry action.
