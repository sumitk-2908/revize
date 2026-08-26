import { test, expect } from '@playwright/test';

test.describe('PDF Viewer Flow', () => {
  test('should load and display a PDF document', async ({ page }) => {
    // Navigate to a document page directly.
    // In a real environment, we might want to navigate to a specific seeded document UUID
    // For now, we will go to the home page, search/find a document, and click it.
    await page.goto('/');

    // Look for a document card link (assuming there's a trending or recent documents list)
    const documentLink = page.locator('a[href^="/document/"]').first();

    if (await documentLink.isVisible()) {
      await documentLink.click();

      // Ensure the PDF viewer container is loaded
      // Assuming 'react-pdf' renders a canvas or a specific container
      const pdfContainer = page.locator('.react-pdf__Document');
      await expect(pdfContainer).toBeVisible({ timeout: 20000 }); // PDF loading can be slow

      // Check for the presence of document title in the header
      const titleElement = page.locator('h1').first();
      await expect(titleElement).toBeVisible();

      // Check for pagination controls
      const nextButton = page.getByRole('button', { name: /next page|›/i });
      if (await nextButton.isVisible()) {
        await nextButton.click();
        // Check if page number updated
        await expect(page.getByText(/page 2/i)).toBeVisible();
      }

      // PDF-only in-viewer search opens from the search toolbar button.
      await page.getByRole('button', { name: 'Open document search' }).click();
      const searchInput = page.getByRole('textbox', { name: 'Search document text' });
      await expect(searchInput).toBeVisible();
      await searchInput.fill('the');
      await expect(page.getByRole('button', { name: 'Next search result' })).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(searchInput).toHaveValue('');

      const progress = page.getByRole('slider', { name: 'Page progress' });
      const progressTrack = page.getByLabel('Reading progress');
      await expect(progress).toBeVisible();
      await expect.poll(async () => {
        const [thumbBox, trackBox] = await Promise.all([progress.boundingBox(), progressTrack.boundingBox()]);
        return Boolean(thumbBox && trackBox && thumbBox.height <= trackBox.height);
      }).toBe(true);

      const fullscreenButton = page.getByRole('button', { name: 'Open in fullscreen reader' });
      await fullscreenButton.click();

      const readerDialog = page.getByRole('dialog', { name: /Reading / });
      await expect(readerDialog).toBeVisible();
      await expect(page.getByRole('navigation', { name: 'Document breadcrumb' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Toggle minimap' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Toggle document outline' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Download document' })).toBeVisible();
      await expect.poll(() => page.evaluate(() => document.fullscreenElement)).toBeNull();

      await page.keyboard.press('?');
      await expect(page.getByRole('region', { name: 'Keyboard shortcuts' })).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(readerDialog).toBeHidden();
    } else {
      console.log('No documents available on the home page to test the viewer.');
    }
  });
});
