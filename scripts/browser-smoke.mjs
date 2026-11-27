import { spawn } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
import { chromium } from 'playwright-core'

const chromePath = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const server = spawn('npm', ['run', 'dev', '--', '--host', '127.0.0.1', '--port', '4178', '--strictPort'], { stdio: 'ignore' })
let browser
try {
  let ready = false
  for (let i = 0; i < 80; i += 1) {
    try { ready = (await fetch('http://127.0.0.1:4178')).ok } catch { /* server is starting */ }
    if (ready) break
    await delay(250)
  }
  if (!ready) throw new Error('Vite did not start on port 4178.')
  browser = await chromium.launch({ headless: true, executablePath: chromePath, args: ['--no-sandbox'] })
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  const pageErrors = []
  page.on('pageerror', error => pageErrors.push(error.message))
  await page.goto('http://127.0.0.1:4178', { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: 'Open command palette' }).waitFor()
  await page.getByRole('button', { name: 'Open command palette' }).click()
  const palette = page.getByPlaceholder('Jump to file, heading, template, or command…')
  await palette.fill('readme smoke search')
  await page.getByRole('button', { name: /Save .* as a workspace search/ }).click()
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Open command palette' }).click()
  const reopenedSearch = page.getByPlaceholder('Jump to file, heading, template, or command…')
  await reopenedSearch.fill('smoke')
  await page.getByRole('option', { name: /readme smoke search/ }).waitFor()
  await page.getByRole('option', { name: /readme smoke search/ }).click()
  if (await page.getByPlaceholder('Jump to file, heading, template, or command…').inputValue() !== 'readme smoke search') throw new Error('Saved workspace search did not reopen with its query.')
  await page.keyboard.press('Escape')

  await page.getByRole('button', { name: 'Show file tree' }).click()
  await page.getByRole('tree', { name: 'Files' }).waitFor()
  // Create a second tab, then verify the tree accepts a drag between file siblings.
  await page.locator('.file-tabs-bar button[aria-label="New File"]').click()
  const treeFiles = page.locator('.file-tree-row:not(.is-folder) .file-tree-main')
  await treeFiles.nth(1).waitFor()
  const beforeOrder = await treeFiles.allTextContents()
  const sourceBox = await treeFiles.nth(0).boundingBox()
  const targetBox = await treeFiles.nth(1).boundingBox()
  await page.mouse.move(sourceBox.x + 55, sourceBox.y + sourceBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(sourceBox.x + 65, sourceBox.y + sourceBox.height / 2, { steps: 3 })
  await page.mouse.move(targetBox.x + 55, targetBox.y + targetBox.height - 2, { steps: 12 })
  await page.mouse.up()
  await page.waitForTimeout(150)
  const afterOrder = await page.locator('.file-tree-row:not(.is-folder) .file-tree-main').allTextContents()
  if (beforeOrder[0]?.trim() === afterOrder[0]?.trim()) throw new Error('Files panel drag reorder did not update the displayed order.')
  await page.locator('.file-tab-close').last().hover()
  await page.locator('.file-tab-close').last().click()
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('button', { name: 'Closed file options' }).click()
  const closedMenu = page.locator('.file-tree-more-menu')
  const menuBox = await closedMenu.boundingBox()
  const viewport = page.viewportSize()
  if (!menuBox || menuBox.x < 0 || menuBox.y < 0 || menuBox.x + menuBox.width > viewport.width || menuBox.y + menuBox.height > viewport.height) {
    throw new Error('Closed-file options menu escaped the viewport edge.')
  }
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Library: all documents' }).click()
  await page.getByRole('dialog', { name: 'Library' }).waitFor()
  await page.getByRole('button', { name: 'Close library' }).click()
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
  if (overflow) throw new Error('The page has horizontal overflow at 390px.')
  if (pageErrors.length) throw new Error(`Browser errors: ${pageErrors.join('; ')}`)
  console.log('Chrome smoke checks passed: app load, saved search, real Files drag reorder, mobile edge menu, Library at 390px.')
} finally {
  await browser?.close()
  server.kill('SIGTERM')
}
