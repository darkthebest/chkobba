---
name: accessibility-compliance
description: Expert in WCAG 2.1 Level AA/AAA compliance, ARIA labels and roles, keyboard navigation patterns, screen reader support, and color contrast calculations. Ensures inclusive design and accessible interfaces for all users. Use when ensuring WCAG compliance, adding ARIA labels, implementing keyboard navigation, testing screen reader compatibility, or improving accessibility.
category: ui
framework: [generic]
---

# Accessibility Compliance Skill

<role>
Web accessibility (a11y) compliance expert specializing in WCAG standards, ARIA implementation, and inclusive design patterns.
</role>

<scope>
  <applications>
    <app name="admin-ui" priority="high">Angular decision tree builder with complex canvas interactions</app>
    <app name="dts" priority="high">Public-facing decision tree renderer for lead capture</app>
    <app name="api" priority="medium">REST API with documentation accessibility</app>
  </applications>

  <target-compliance>
    <minimum-level>WCAG 2.1 Level AA</minimum-level>
    <goal-level>WCAG 2.1 Level AAA where feasible</goal-level>
  </target-compliance>
</scope>

<core-expertise>
  <standards>
    <standard>WCAG 2.1 AA/AAA compliance</standard>
    <standard>Section 508 requirements</standard>
    <standard>EN 301 549 (European standard)</standard>
  </standards>

  <technical-areas>
    <area>ARIA labels, roles, and states</area>
    <area>Keyboard navigation patterns</area>
    <area>Screen reader compatibility</area>
    <area>Color contrast calculations</area>
    <area>Focus management strategies</area>
    <area>Semantic HTML structure</area>
    <area>Accessible form design</area>
    <area>Dynamic content announcements</area>
  </technical-areas>
</core-expertise>

<implementation-patterns>

## Accessibility Patterns

<pattern-category name="aria-labels">

### ARIA Labels

<use-case>Providing accessible names for interactive elements and navigation landmarks</use-case>

<example type="button-with-icon">
```html
<button aria-label="Close dialog" (click)="close()">
  <span aria-hidden="true">&times;</span>
</button>
```
<explanation>Icon-only buttons need aria-label; aria-hidden prevents screen readers from announcing decorative "×"</explanation>
</example>

<example type="navigation-landmark">
```html
<nav aria-label="Main navigation">
  <ul>
    <li><a href="/home">Home</a></li>
    <li><a href="/about">About</a></li>
  </ul>
</nav>
```
<explanation>Multiple nav elements need distinct labels to differentiate main from sidebar/footer navigation</explanation>
</example>

<best-practices>
  <practice>Use aria-label for icon-only buttons and links</practice>
  <practice>Use aria-labelledby to reference visible text when available</practice>
  <practice>Keep labels concise (under 100 characters)</practice>
  <practice>Avoid redundant "button" or "link" in labels (screen readers announce role)</practice>
</best-practices>

</pattern-category>

<pattern-category name="keyboard-navigation">

### Keyboard Navigation

<use-case>Ensuring all interactive elements are operable via keyboard for users who cannot use a mouse</use-case>

<example type="custom-widget">
```typescript
@HostListener('keydown', ['$event'])
handleKeyDown(event: KeyboardEvent): void {
  switch (event.key) {
    case 'Enter':
    case ' ':
      this.activate();
      event.preventDefault();
      break;
    case 'Escape':
      this.cancel();
      event.preventDefault();
      break;
  }
}
```
<explanation>Custom widgets must handle Enter/Space (activate), Escape (cancel); preventDefault stops default browser behavior</explanation>
</example>

<keyboard-requirements>
  <requirement key="Tab">Navigate forward through interactive elements</requirement>
  <requirement key="Shift+Tab">Navigate backward</requirement>
  <requirement key="Enter">Activate buttons, links, submit forms</requirement>
  <requirement key="Space">Activate buttons, toggle checkboxes</requirement>
  <requirement key="Escape">Close modals, cancel actions</requirement>
  <requirement key="Arrow keys">Navigate within widgets (tabs, menus, grids)</requirement>
</keyboard-requirements>

</pattern-category>

<pattern-category name="focus-management">

### Focus Management

<use-case>Controlling focus flow for dialogs, dynamic content, and single-page navigation</use-case>

<example type="dialog-focus">
```typescript
@ViewChild('firstInput') firstInput!: ElementRef;

ngAfterViewInit(): void {
// Set focus to first input when dialog opens
this.firstInput.nativeElement.focus();
}

trapFocus(event: KeyboardEvent): void {
if (event.key === 'Tab') {
// Keep focus within dialog
}
}

````
<explanation>Dialogs must trap focus (prevent Tab from leaving modal) and restore focus to trigger element on close</explanation>
</example>

<focus-principles>
  <principle>Visible focus indicator required (outline or border)</principle>
  <principle>Logical focus order matches visual layout</principle>
  <principle>No keyboard traps (user can always escape)</principle>
  <principle>Focus moved to new content after page changes</principle>
  <principle>Skip links provided for repetitive navigation</principle>
</focus-principles>

</pattern-category>

<pattern-category name="semantic-html">

### Semantic HTML

<use-case>Using native HTML elements to convey structure and meaning to assistive technologies</use-case>

<example type="navigation">
```html
<!-- Good: Semantic HTML -->
<nav>
  <ul>
    <li><a href="/home">Home</a></li>
  </ul>
</nav>

<!-- Bad: Non-semantic -->
<div class="navigation">
  <div class="nav-item" onclick="navigate('/home')">Home</div>
</div>
````

<explanation>Semantic &lt;nav&gt; announces landmark; &lt;a&gt; provides keyboard access; &lt;ul&gt;&lt;li&gt; conveys list structure</explanation>
</example>

<semantic-hierarchy>
  <landmark>&lt;header&gt; → Page or section header</landmark>
  <landmark>&lt;nav&gt; → Navigation menu</landmark>
  <landmark>&lt;main&gt; → Primary content (one per page)</landmark>
  <landmark>&lt;aside&gt; → Tangential content</landmark>
  <landmark>&lt;footer&gt; → Page or section footer</landmark>
  <landmark>&lt;article&gt; → Self-contained content</landmark>
  <landmark>&lt;section&gt; → Thematic grouping with heading</landmark>
</semantic-hierarchy>

</pattern-category>

<pattern-category name="screen-reader-support">

### Screen Reader Support

<use-case>Announcing dynamic content and providing screen reader-only text</use-case>

<example type="skip-links">
```html
<!-- Skip navigation link -->
<a href="#main-content" class="sr-only">Skip to main content</a>

<!-- Hidden text for screen readers -->

<span class="sr-only">This text is only for screen readers</span>

````
<explanation>Skip links help keyboard users bypass repetitive navigation; sr-only class visually hides but keeps accessible</explanation>
</example>

<example type="live-regions">
```html
<!-- Live regions for dynamic content -->
<div role="status" aria-live="polite">
  Item added to cart
</div>

<!-- Landmark roles -->
<header role="banner">...</header>
<main role="main">...</main>
<footer role="contentinfo">...</footer>
````

<explanation>aria-live="polite" announces changes when user is idle; "assertive" interrupts current speech (use sparingly)</explanation>
</example>

<live-region-politeness>
  <level value="off">No announcements (default)</level>
  <level value="polite">Announce when user pauses (form confirmations, status updates)</level>
  <level value="assertive">Interrupt immediately (errors, urgent alerts)</level>
</live-region-politeness>

</pattern-category>

<pattern-category name="accessible-forms">

### Accessible Forms

<use-case>Creating forms that are navigable, understandable, and provide clear feedback</use-case>

<example type="form-with-validation">
```html
<form>
  <div>
    <label for="email">Email Address</label>
    <input
      id="email"
      type="email"
      required
      aria-required="true"
      aria-describedby="email-help"
    >
    <span id="email-help">We'll never share your email</span>
  </div>

  <div role="alert" aria-live="assertive" *ngIf="error">
    {{ error }}
  </div>
</form>
```
<explanation>Labels must be programmatically associated (for/id); aria-describedby provides hints; role="alert" announces errors</explanation>
</example>

<form-requirements>
  <requirement>Every input has a &lt;label&gt; with matching for/id</requirement>
  <requirement>Required fields marked with aria-required="true"</requirement>
  <requirement>Error messages announced via role="alert" or aria-live</requirement>
  <requirement>Fieldsets group related inputs with &lt;legend&gt;</requirement>
  <requirement>Instructions provided before form, not just in placeholders</requirement>
</form-requirements>

</pattern-category>

</implementation-patterns>

<wcag-compliance>

## WCAG Requirements

<compliance-level name="A" priority="required">

### Level A (Must Have)

<criteria>
  <criterion id="1.1.1">Text alternatives for images</criterion>
  <criterion id="2.1.1">Keyboard accessible</criterion>
  <criterion id="2.2.1">Sufficient time to read</criterion>
  <criterion id="2.3.1">No seizure-inducing content</criterion>
  <criterion id="2.4.1">Navigable structure</criterion>
</criteria>

<impact>Without Level A compliance, significant barriers prevent access for users with disabilities</impact>

</compliance-level>

<compliance-level name="AA" priority="target">

### Level AA (Should Have)

<criteria>
  <criterion id="1.4.3">Color contrast ratio ≥ 4.5:1</criterion>
  <criterion id="1.4.4">Resize text to 200%</criterion>
  <criterion id="1.4.5">Images of text avoided</criterion>
  <criterion id="2.4.5">Multiple ways to find content</criterion>
  <criterion id="2.4.6">Descriptive headings</criterion>
</criteria>

<impact>Level AA is the industry standard for public-facing applications; legal requirement in many jurisdictions</impact>

</compliance-level>

<compliance-level name="AAA" priority="aspirational">

### Level AAA (Nice to Have)

<criteria>
  <criterion id="1.4.6">Color contrast ratio ≥ 7:1</criterion>
  <criterion id="2.2.3">No time limits</criterion>
  <criterion id="3.3.6">Enhanced error prevention</criterion>
  <criterion id="3.3.5">Context-sensitive help</criterion>
</criteria>

<impact>Level AAA provides enhanced accessibility for users with severe disabilities; not always achievable for all content</impact>

</compliance-level>

</wcag-compliance>

<technical-implementations>

## Color Contrast

<contrast-calculation>
```typescript
// Check contrast ratio
function getContrastRatio(fg: string, bg: string): number {
  // Calculate relative luminance
  const l1 = getLuminance(fg);
  const l2 = getLuminance(bg);

const lighter = Math.max(l1, l2);
const darker = Math.min(l1, l2);

return (lighter + 0.05) / (darker + 0.05);
}

// Minimum ratios:
// Normal text: 4.5:1 (AA), 7:1 (AAA)
// Large text: 3:1 (AA), 4.5:1 (AAA)

```
</contrast-calculation>

<contrast-requirements>
  <text-size category="normal">
    <min-ratio level="AA">4.5:1</min-ratio>
    <min-ratio level="AAA">7:1</min-ratio>
    <definition>Text smaller than 18pt (or 14pt bold)</definition>
  </text-size>
  <text-size category="large">
    <min-ratio level="AA">3:1</min-ratio>
    <min-ratio level="AAA">4.5:1</min-ratio>
    <definition>Text 18pt or larger (or 14pt bold or larger)</definition>
  </text-size>
</contrast-requirements>

</technical-implementations>

<verification-workflow>

## Accessibility Checklist

<audit-checklist>
  <checkpoint>All images have alt text</checkpoint>
  <checkpoint>Proper heading hierarchy (h1-h6)</checkpoint>
  <checkpoint>Keyboard navigation works</checkpoint>
  <checkpoint>Focus indicators visible</checkpoint>
  <checkpoint>Color contrast ≥ 4.5:1</checkpoint>
  <checkpoint>ARIA labels for icons</checkpoint>
  <checkpoint>Form fields have labels</checkpoint>
  <checkpoint>Error messages clear</checkpoint>
  <checkpoint>Screen reader tested</checkpoint>
  <checkpoint>No keyboard traps</checkpoint>
</audit-checklist>

</verification-workflow>

<testing-tools>

## Testing Tools

<automated-testing>
  <tool name="axe DevTools">Browser extension for automated accessibility testing</tool>
  <tool name="WAVE">Web accessibility evaluation tool</tool>
  <tool name="Lighthouse">Chrome DevTools accessibility audit</tool>
</automated-testing>

<manual-testing>
  <tool name="NVDA">Free Windows screen reader</tool>
  <tool name="JAWS">Professional Windows screen reader</tool>
  <tool name="VoiceOver">Built-in macOS/iOS screen reader</tool>
  <tool name="Keyboard Only">Test navigation without mouse</tool>
</manual-testing>

<testing-workflow>
  <step number="1">Run automated scan (axe DevTools, WAVE, Lighthouse)</step>
  <step number="2">Fix automated issues (alt text, contrast, ARIA)</step>
  <step number="3">Test keyboard navigation (Tab, Enter, Space, Escape)</step>
  <step number="4">Test with screen reader (NVDA, JAWS, or VoiceOver)</step>
  <step number="5">Document accessibility features</step>
</testing-workflow>

</testing-tools>

<best-practices>

## Best Practices

<implementation-guidelines>
  <guideline priority="1">Use semantic HTML first (don't reinvent native elements)</guideline>
  <guideline priority="2">Add ARIA only when semantic HTML insufficient</guideline>
  <guideline priority="3">Test with keyboard only before adding mouse interactions</guideline>
  <guideline priority="4">Test with screen reader to verify announcements</guideline>
  <guideline priority="5">Maintain logical focus order (matches visual layout)</guideline>
  <guideline priority="6">Provide skip links for repetitive navigation</guideline>
  <guideline priority="7">Use sufficient contrast (4.5:1 minimum)</guideline>
  <guideline priority="8">Make error messages clear and actionable</guideline>
  <guideline priority="9">Document accessibility features for maintenance</guideline>
</implementation-guidelines>

<common-mistakes>
  <mistake>Using div/span instead of button/a for interactive elements</mistake>
  <mistake>Missing alt text on images</mistake>
  <mistake>Poor color contrast</mistake>
  <mistake>Non-unique heading hierarchy (skipping levels)</mistake>
  <mistake>Keyboard traps in modals</mistake>
  <mistake>Placeholder text as labels</mistake>
  <mistake>No focus indicators</mistake>
  <mistake>ARIA overuse (semantic HTML preferred)</mistake>
</common-mistakes>

</best-practices>

<activation-triggers>

## Activation Keywords

<keywords>
Accessibility, a11y, WCAG, ARIA, screen reader, keyboard navigation, contrast, focus, semantic HTML, accessible, compliance, inclusive design, assistive technology
</keywords>

</activation-triggers>
```
