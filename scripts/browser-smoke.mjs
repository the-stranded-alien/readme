import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { setTimeout as delay } from 'node:timers/promises'
import { chromium } from 'playwright-core'

const chromePath = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const build = spawn('npm', ['run', 'build'], { stdio: 'inherit' })
const [buildCode] = await once(build, 'exit')
if (buildCode !== 0) throw new Error(`Production build failed with exit code ${buildCode}.`)
const server = spawn('npm', ['run', 'preview', '--', '--host', '127.0.0.1', '--port', '4178', '--strictPort'], { stdio: 'ignore' })
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
  page.on('console', message => { if (message.type() === 'error') pageErrors.push(message.text()) })
  await page.addInitScript(() => localStorage.setItem('readme-presentation-settings', JSON.stringify({ splitMode: 'smart' })))
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

  const modeTrack = page.locator('.pill-track')
  const editorMode = modeTrack.getByRole('button', { name: 'Editor', exact: true })
  const previewMode = modeTrack.getByRole('button', { name: 'Preview', exact: true })
  const trackMetrics = await modeTrack.evaluate(track => {
    const outer = track.getBoundingClientRect()
    const inner = track.querySelector('.pill-btn').getBoundingClientRect()
    const active = track.querySelector('.pill-btn.active').getBoundingClientRect()
    const indicator = track.querySelector('.pill-indicator').getBoundingClientRect()
    return {
      topGap: inner.top - outer.top,
      bottomGap: outer.bottom - inner.bottom,
      indicatorTopError: Math.abs(active.top - indicator.top),
      indicatorBottomError: Math.abs(active.bottom - indicator.bottom),
    }
  })
  if (Math.abs(trackMetrics.topGap - trackMetrics.bottomGap) > 1 || trackMetrics.indicatorTopError > 1 || trackMetrics.indicatorBottomError > 1) {
    throw new Error('View mode capsule spacing or active indicator alignment is uneven.')
  }
  if (await modeTrack.locator('.pill-divider').count()) throw new Error('Present is still separated by a divider in the view mode capsule.')
  const editorBox = await editorMode.boundingBox()
  const previewBox = await previewMode.boundingBox()
  await page.mouse.move(editorBox.x + editorBox.width / 2, editorBox.y + editorBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(previewBox.x + previewBox.width / 2, previewBox.y + previewBox.height / 2, { steps: 10 })
  await page.mouse.up()
  await page.waitForFunction(() => document.querySelector('.pill-btn[data-mode-id="preview"]')?.classList.contains('active'))
  await editorMode.click()
  await page.waitForFunction(() => document.querySelector('.pill-btn[data-mode-id="editor"]')?.classList.contains('active'))
  await page.locator('textarea.editor-textarea').fill('A short introduction to this checklist.\n\n- First item\n- Second item\n\nA table follows.\n\n| Item | Value |\n| --- | --- |\n| A | B |\n\n> A final note.')
  const chooseMode = async (scope, option) => {
    const picker = scope.getByRole('button', { name: /^Slide splitting mode:/ })
    if (await picker.getAttribute('aria-haspopup') !== 'listbox') throw new Error('Slide split mode is not using the app dropdown.')
    await picker.click()
    const menu = page.getByRole('listbox', { name: 'Slide splitting mode' })
    if (!(await menu.getAttribute('class'))?.includes('picker-menu')) throw new Error('Slide split mode dropdown is missing the shared picker styling.')
    await menu.getByRole('option', { name: option, exact: true }).click()
  }
  const presentButton = page.getByRole('button', { name: 'Present as slides', exact: true })
  if (await presentButton.getAttribute('data-tooltip') !== 'Present as slides') throw new Error('Present hover text is not the requested label.')
  if (await page.getByRole('button', { name: 'Choose slide split' }).count()) throw new Error('A separate home-screen Split control is still visible.')
  if (await page.getByRole('button', { name: 'Presentation settings' }).count()) throw new Error('The removed presentation settings shortcut is still visible.')
  await presentButton.click()
  await page.getByRole('dialog', { name: /Presentation, slide 1 of 1/ }).waitFor()
  const presentation = page.locator('.presentation[role="dialog"]')
  await presentation.getByRole('button', { name: 'Slide splitting options' }).click()
  await chooseMode(presentation, 'Custom')
  const customAt = presentation.getByRole('group', { name: 'Start a new slide at' })
  await customAt.getByRole('checkbox', { name: 'Heading 1 (H1)' }).check()
  await customAt.getByRole('checkbox', { name: 'Heading 2 (H2)' }).check()
  await customAt.getByRole('checkbox', { name: 'Tables' }).check()
  if (!(await customAt.getByRole('checkbox', { name: 'Heading 1 (H1)' }).isChecked()) || !(await customAt.getByRole('checkbox', { name: 'Heading 2 (H2)' }).isChecked())) {
    throw new Error('Custom split settings do not allow combining heading levels.')
  }
  await page.getByRole('dialog', { name: /Presentation, slide 1 of 2/ }).waitFor()
  await chooseMode(presentation, 'One slide')
  if (await presentation.getByRole('group', { name: 'Start a new slide at' }).count()) throw new Error('Custom split choices should be hidden for a preset mode.')
  await page.getByRole('dialog', { name: /Presentation, slide 1 of 1/ }).waitFor()
  await presentation.getByRole('button', { name: 'Exit presentation' }).click()

  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  const settingsDialog = page.getByRole('dialog', { name: 'Settings' })
  await settingsDialog.getByRole('button', { name: 'Presentation' }).click()
  const presentationSettings = settingsDialog.getByRole('group', { name: 'Presentation splitting' })
  const settingsSplit = presentationSettings.getByRole('group', { name: 'Presentation splitting settings' })
  await settingsSplit.waitFor()
  await chooseMode(settingsSplit, 'Custom')
  const settingsAt = settingsSplit.getByRole('group', { name: 'Start a new slide at' })
  await settingsAt.getByRole('checkbox', { name: 'Paragraphs' }).check()
  await settingsAt.getByRole('checkbox', { name: 'Tables' }).check()
  const visibleCustomCheckbox = await settingsAt.getByRole('checkbox', { name: 'Paragraphs' }).evaluate(input => {
    const style = getComputedStyle(input)
    return { opacity: style.opacity, width: input.getBoundingClientRect().width, height: input.getBoundingClientRect().height }
  })
  if (visibleCustomCheckbox.opacity !== '1' || visibleCustomCheckbox.width < 12 || visibleCustomCheckbox.height < 12) {
    throw new Error('Custom split checkboxes are hidden or too small to select in Settings.')
  }
  await chooseMode(settingsSplit, 'By headings')
  if (await settingsSplit.getByRole('group', { name: 'Start a new slide at' }).count()) throw new Error('Settings should hide Custom choices while a preset mode is selected.')
  await settingsDialog.getByRole('button', { name: 'Close settings' }).click()

  await page.getByRole('button', { name: 'Open command palette' }).click()
  const recoverySearch = page.getByPlaceholder('Jump to file, heading, template, or command…')
  await recoverySearch.fill('Recovery & unsaved changes')
  await page.getByRole('option', { name: /Recovery & unsaved changes/ }).click()
  await page.getByRole('dialog', { name: 'Recovery & unsaved changes' }).waitFor()
  await page.getByRole('button', { name: 'Close recovery' }).click()

  await page.getByRole('button', { name: 'Show file tree' }).click()
  await page.getByRole('tree', { name: 'Files' }).waitFor()
  const filesHeader = page.locator('.file-tree-header')
  const titleRange = await filesHeader.locator('> span:first-child').evaluate(element => {
    const range = document.createRange()
    range.selectNodeContents(element)
    const rect = range.getBoundingClientRect()
    return { y: rect.y, height: rect.height }
  })
  const hideFilesIcon = await filesHeader.getByRole('button', { name: 'Hide file tree' }).locator('svg').boundingBox()
  if (!titleRange.height || !hideFilesIcon || Math.abs((titleRange.y + titleRange.height / 2) - (hideFilesIcon.y + hideFilesIcon.height / 2)) > 1.5) {
    throw new Error('Files header label and close control are not vertically centered.')
  }
  const tasksButton = page.getByRole('button', { name: 'Tasks in all documents' })
  await page.setViewportSize({ width: 390, height: 844 })
  const tasksRadiusBefore = await tasksButton.evaluate(button => getComputedStyle(button).borderRadius)
  await tasksButton.hover()
  const tasksTooltip = page.getByRole('tooltip')
  await tasksTooltip.waitFor()
  const tasksTipText = await tasksTooltip.innerText()
  if (!tasksTipText.includes('Open Tasks') || !tasksTipText.toLowerCase().includes('deadline')) throw new Error(`Tasks hover tooltip does not explain the Tasks panel: ${tasksTipText}`)
  const tasksTipBox = await tasksTooltip.boundingBox()
  const tasksAfter = await tasksButton.evaluate(button => getComputedStyle(button).borderRadius)
  const tasksViewportWidth = page.viewportSize().width
  if (!tasksTipBox || tasksTipBox.x < 0 || tasksTipBox.x + tasksTipBox.width > tasksViewportWidth || tasksAfter !== tasksRadiusBefore || tasksAfter !== '999px') {
    throw new Error('Tasks tooltip overflowed the viewport or its button hover changed the round icon shape.')
  }
  if (tasksTipBox.width > 390 || (await tasksTooltip.evaluate(element => element.scrollWidth > element.clientWidth + 1))) throw new Error('Tasks tooltip text overflows in the narrow viewport.')
  await page.setViewportSize({ width: 1280, height: 900 })
  await tasksButton.click()
  const agenda = page.getByRole('dialog', { name: 'Tasks' })
  await agenda.getByRole('radio', { name: 'Document deadlines' }).click()
  const deadlineButton = agenda.getByRole('radio', { name: 'Document deadlines' })
  const deadlineLines = await deadlineButton.evaluate(button => {
    const range = document.createRange()
    range.selectNodeContents(button)
    return range.getClientRects().length
  })
  if (deadlineLines > 1) throw new Error('Document deadlines wraps onto more than one line.')
  await page.setViewportSize({ width: 390, height: 844 })
  const narrowDeadlineLines = await deadlineButton.evaluate(button => {
    const range = document.createRange()
    range.selectNodeContents(button)
    return range.getClientRects().length
  })
  if (narrowDeadlineLines > 1) throw new Error('Document deadlines wraps in the narrow layout.')
  await agenda.getByRole('radio', { name: 'Tasks' }).hover()
  await page.waitForTimeout(180)
  const agendaHover = await agenda.getByRole('radio', { name: 'Tasks' }).evaluate(button => getComputedStyle(button).backgroundColor)
  if (agendaHover === 'rgba(0, 0, 0, 0)' || agendaHover === 'transparent') throw new Error('Agenda mode hover style is missing.')
  await agenda.getByRole('button', { name: 'Close tasks' }).click()
  await page.setViewportSize({ width: 1280, height: 900 })
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
  console.log('Chrome production smoke checks passed: app load, saved search, configured home Present launch, combined custom split controls in Settings and presentation, shared dropdowns, round Tasks hover and clamped tooltip, Files alignment, recovery dialog, Files drag reorder, mobile menu and Library.')
} finally {
  await browser?.close()
  server.kill('SIGTERM')
}
