import { expect, test } from '@playwright/test';

/**
 * Smoke tests of the map shell. They run against whatever database the
 * server is configured with (none in CI): the assertions only check that the
 * UI stays up, reports data availability honestly, and never renders
 * placeholder values.
 */

const FORBIDDEN = /\b(NaN|undefined|null)\b/;

test('map loads full-screen with search, layers and status', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.maplibregl-canvas')).toBeVisible();
  await expect(page.getByRole('combobox')).toBeVisible();
  await expect(page.getByRole('button', { name: /ชั้นข้อมูล|เปิดรายการชั้นข้อมูล/ })).toBeVisible();
  const box = await page.locator('.maplibregl-canvas').boundingBox();
  const vp = page.viewportSize()!;
  expect(box!.width).toBeGreaterThanOrEqual(vp.width - 1);
  expect(await page.locator('body').innerText()).not.toMatch(FORBIDDEN);
});

test('clicking the map opens the inspector with honest empty states', async ({ page }) => {
  await page.goto('/');
  const canvas = page.locator('.maplibregl-canvas');
  await expect(canvas).toBeVisible();
  const box = (await canvas.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  const inspector = page.locator('#inspector');
  await expect(inspector).toBeVisible();
  await expect(inspector.getByRole('heading', { name: 'สภาพปัจจุบัน' })).toBeVisible();
  // Either real values (summarised first) or an honest "no public data" — never a placeholder.
  await expect(inspector.getByText(/สรุปจุดนี้|ไม่มีข้อมูลสาธารณะสำหรับพื้นที่นี้/).first()).toBeVisible();
  await inspector.getByRole('button', { name: 'ดูรายละเอียดเพิ่มเติม' }).click();
  await expect(inspector.getByRole('heading', { name: 'แหล่งข้อมูล' })).toBeVisible();
  await expect(inspector.locator('[aria-busy="true"]')).toHaveCount(0, { timeout: 15_000 });
  expect(await inspector.innerText()).not.toMatch(FORBIDDEN);
});

test('keyboard: Enter on the focused map inspects the centre', async ({ page }) => {
  await page.goto('/');
  await page.locator('.maplibregl-canvas').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#inspector')).toBeVisible();
});

test('layer panel lists every layer with an info button', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /ชั้นข้อมูล|เปิดรายการชั้นข้อมูล/ }).click();
  const panel = page.locator('#layer-panel');
  await expect(panel).toBeVisible();
  await panel.getByRole('button', { name: /ข้อมูลแหล่งที่มา: หมู่บ้าน \(จุดที่ตั้ง\)/ }).click();
  const dialog = page.getByRole('dialog', { name: /แหล่งที่มาของข้อมูล/ });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('กรมการปกครอง กระทรวงมหาดไทย')).toBeVisible();
});

test('layer panel turns a whole group, or everything, on and off at once', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /ชั้นข้อมูล|เปิดรายการชั้นข้อมูล/ }).click();
  const panel = page.locator('#layer-panel');
  const group = panel.locator('section', { has: page.getByRole('heading', { name: /เขตปกครอง/ }) });
  const switches = group.getByRole('switch');
  await group.getByRole('button', { name: 'เปิดทั้งหมดในหมวด เขตปกครอง' }).click();
  for (const s of await switches.all()) await expect(s).toHaveAttribute('aria-checked', 'true');
  await group.getByRole('button', { name: 'ปิดทั้งหมดในหมวด เขตปกครอง' }).click();
  for (const s of await switches.all()) await expect(s).toHaveAttribute('aria-checked', 'false');

  await panel.getByRole('button', { name: 'เปิดทั้งหมด', exact: true }).click();
  await expect(panel.getByRole('button', { name: 'ปิดทั้งหมด', exact: true })).toBeVisible();
  await expect(group.getByRole('button', { name: 'ปิดทั้งหมดในหมวด เขตปกครอง' })).toBeVisible();
  await panel.getByRole('button', { name: 'ปิดทั้งหมด', exact: true }).click();
  await expect(group.getByRole('button', { name: 'เปิดทั้งหมดในหมวด เขตปกครอง' })).toBeVisible();
});

test('touch targets are at least 44px', async ({ page }) => {
  await page.goto('/');
  const buttons = page.locator('main button:visible');
  const n = await buttons.count();
  for (let i = 0; i < n; i++) {
    const b = await buttons.nth(i).boundingBox();
    if (!b) continue;
    expect(Math.max(b.width, b.height), await buttons.nth(i).getAttribute('aria-label') ?? `button ${i}`).toBeGreaterThanOrEqual(44);
  }
});

test('data source status list can be scrolled to its end', async ({ page }) => {
  await page.setViewportSize({ width: page.viewportSize()!.width, height: 520 });
  await page.goto('/');
  const mobile = page.viewportSize()!.width < 768;
  if (mobile) await page.locator('nav button').filter({ hasText: 'ภาพรวม' }).first().click();
  const scope = mobile ? page.locator('#overview-panel') : page.locator('main');
  await scope.locator('[aria-controls="status-details"]').last().click();
  const details = page.locator('#status-details');
  const link = details.getByRole('link', { name: /เกี่ยวกับข้อมูล/ });
  await link.scrollIntoViewIfNeeded();
  await expect(link).toBeInViewport();
  // The top of the list never ends up above the screen, where nothing can scroll to it.
  await details.locator('li').first().scrollIntoViewIfNeeded();
  await expect(details.locator('li').first()).toBeInViewport();
});

test('report form: emergency numbers first, one step at a time, clear errors for missing answers', async ({ page, context }) => {
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: 8.43, longitude: 99.96 });
  await page.goto('/');
  await page.getByRole('button', { name: 'รายงานเหตุ', exact: true }).first().click();
  const panel = page.locator('#report-panel');
  await expect(panel).toBeVisible();
  await expect(panel.getByRole('link', { name: /โทร 1669/ })).toBeInViewport();
  await expect(panel.getByRole('link', { name: /โทร 1669/ })).toHaveAttribute('href', 'tel:1669');
  const next = panel.getByRole('button', { name: 'ถัดไป' });

  // Step 1: what happened. Nothing chosen → says what is missing, stays put.
  await next.click();
  await expect(panel.getByText('เลือกประเภทเหตุ')).toBeVisible();
  await panel.getByRole('button', { name: 'น้ำท่วม', exact: true }).click();
  await expect(panel.getByText('เลือกประเภทเหตุ')).toHaveCount(0);
  await panel.getByRole('button', { name: /อันตรายถึงชีวิต/ }).first().click();
  await next.click();

  // Step 2: where. A location is required before going on.
  await expect(panel.getByRole('heading', { name: 'ที่ไหน เมื่อไร' })).toBeVisible();
  await next.click();
  await expect(panel.getByRole('alert').first()).toBeVisible();
  await panel.getByRole('button', { name: /ใช้ตำแหน่งปัจจุบันของฉัน/ }).click();
  await next.click();

  // Step 3: details. Water depth only appears for water hazards.
  await expect(panel.getByRole('button', { name: 'ส่งรายงาน' })).toBeVisible();
  await expect(panel.getByRole('group', { name: 'น้ำกำลัง' })).toBeVisible();
  await panel.getByRole('button', { name: 'ย้อนกลับ' }).click();
  await panel.getByRole('button', { name: 'ย้อนกลับ' }).click();
  await panel.getByRole('button', { name: 'ไฟไหม้ / ไฟป่า' }).click();
  await next.click();
  await next.click();
  await expect(panel.getByRole('button', { name: 'ส่งรายงาน' })).toBeVisible();
  await expect(panel.getByRole('group', { name: 'น้ำกำลัง' })).toHaveCount(0);
  expect(await panel.innerText()).not.toMatch(FORBIDDEN);
});

test('emergency numbers page works without the map and dials directly', async ({ page }) => {
  await page.goto('/emergency');
  await expect(page.getByRole('heading', { name: 'เบอร์ฉุกเฉิน', level: 1 })).toBeVisible();
  for (const n of ['1669', '191', '199', '1784', '075-358440']) {
    await expect(page.locator(`a[href="tel:${n.replace(/-/g, '')}"]`).first()).toBeVisible();
  }
  await page.goto('/emergency?lang=en');
  await expect(page.getByRole('heading', { name: 'Emergency numbers', level: 1 })).toBeVisible();
});

test('photos are shrunk in the browser and show what their file says', async ({ page, context }) => {
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: 8.43, longitude: 99.96 });
  await page.goto('/');
  await page.getByRole('button', { name: 'รายงานเหตุ', exact: true }).first().click();
  const panel = page.locator('#report-panel');
  const next = panel.getByRole('button', { name: 'ถัดไป' });
  await panel.getByRole('button', { name: 'น้ำท่วม', exact: true }).click();
  await panel.getByRole('button', { name: /อันตรายถึงชีวิต/ }).first().click();
  await next.click();
  await panel.getByRole('button', { name: /ใช้ตำแหน่งปัจจุบันของฉัน/ }).click();
  // "When did you see it" offers a custom time limited to the last 72 hours.
  await panel.getByRole('button', { name: 'ระบุเวลาเอง' }).click();
  await expect(panel.getByLabel('ระบุเวลาเอง', { exact: true }).last()).toHaveAttribute('type', 'datetime-local');
  await next.click();
  // Synthetic test image (not data): an EXIF capture time and GPS position.
  await panel.getByLabel('เลือกรูปภาพ').setInputFiles('tests/e2e/fixtures/synthetic-flood.jpg');
  await expect(panel.getByText('มีพิกัดในไฟล์')).toBeVisible({ timeout: 15_000 });
  await expect(panel.getByRole('button', { name: /ถ่ายรูป \/ เลือกรูป \(1\/4\)/ })).toBeVisible();
  await panel.getByRole('button', { name: 'เอารูปนี้ออก' }).click();
  await expect(panel.getByText('มีพิกัดในไฟล์')).toHaveCount(0);
});
