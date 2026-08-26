# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: viewer.spec.ts >> PDF Viewer Flow >> should load and display a PDF document
- Location: tests\e2e\viewer.spec.ts:4:7

# Error details

```
Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:3000/
Call log:
  - navigating to "http://localhost:3000/", waiting until "load"

```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | 
  3  | test.describe('PDF Viewer Flow', () => {
  4  |   test('should load and display a PDF document', async ({ page }) => {
  5  |     // Navigate to a document page directly.
  6  |     // In a real environment, we might want to navigate to a specific seeded document UUID
  7  |     // For now, we will go to the home page, search/find a document, and click it.
> 8  |     await page.goto('/');
     |                ^ Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:3000/
  9  | 
  10 |     // Look for a document card link (assuming there's a trending or recent documents list)
  11 |     const documentLink = page.locator('a[href^="/document/"]').first();
  12 | 
  13 |     if (await documentLink.isVisible()) {
  14 |       await documentLink.click();
  15 | 
  16 |       // Ensure the PDF viewer container is loaded
  17 |       // Assuming 'react-pdf' renders a canvas or a specific container
  18 |       const pdfContainer = page.locator('.react-pdf__Document');
  19 |       await expect(pdfContainer).toBeVisible({ timeout: 20000 }); // PDF loading can be slow
  20 | 
  21 |       // Check for the presence of document title in the header
  22 |       const titleElement = page.locator('h1').first();
  23 |       await expect(titleElement).toBeVisible();
  24 | 
  25 |       // Check for pagination controls
  26 |       const nextButton = page.getByRole('button', { name: /next page|›/i });
  27 |       if (await nextButton.isVisible()) {
  28 |         await nextButton.click();
  29 |         // Check if page number updated
  30 |         await expect(page.getByText(/page 2/i)).toBeVisible();
  31 |       }
  32 | 
  33 |       // PDF-only in-viewer search is available once the document is open.
  34 |       const searchInput = page.getByRole('textbox', { name: 'Search document text' });
  35 |       await expect(searchInput).toBeVisible();
  36 |       await searchInput.fill('the');
  37 |       await expect(page.getByRole('button', { name: 'Next search result' })).toBeVisible();
  38 |       await page.keyboard.press('Escape');
  39 |       await expect(searchInput).toHaveValue('');
  40 | 
  41 |       const fullscreenButton = page.getByRole('button', { name: 'Open in fullscreen reader' });
  42 |       await fullscreenButton.click();
  43 | 
  44 |       const readerDialog = page.getByRole('dialog', { name: /Reading / });
  45 |       await expect(readerDialog).toBeVisible();
  46 |       await expect(page.getByRole('navigation', { name: 'Document breadcrumb' })).toBeVisible();
  47 |       await expect(page.getByRole('button', { name: 'Toggle minimap' })).toBeVisible();
  48 |       await expect(page.getByRole('button', { name: 'Toggle document outline' })).toBeVisible();
  49 |       await expect(page.getByRole('button', { name: 'Split view (coming soon)' })).toBeDisabled();
  50 |       await expect.poll(() => page.evaluate(() => document.fullscreenElement)).toBeNull();
  51 | 
  52 |       await page.keyboard.press('?');
  53 |       await expect(page.getByRole('region', { name: 'Keyboard shortcuts' })).toBeVisible();
  54 |       await page.keyboard.press('Escape');
  55 |       await expect(readerDialog).toBeHidden();
  56 |     } else {
  57 |       console.log('No documents available on the home page to test the viewer.');
  58 |     }
  59 |   });
  60 | });
  61 | 
```