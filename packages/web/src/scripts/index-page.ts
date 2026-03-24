interface InstallCommand {
  cmd: string
  pkg: string
}

const installCommands: Record<string, InstallCommand> = {
  create: { cmd: "bun create", pkg: "tui" },
  manual: { cmd: "bun add", pkg: "@opentui/core" },
  skill: { cmd: "npx skills add", pkg: "msmps/opentui-skill" },
}

const tabs = document.querySelectorAll<HTMLElement>(".install-tab")
const commandBtn = document.getElementById("install-display") as HTMLButtonElement | null
const editorTabs = document.querySelectorAll<HTMLElement>(".code-editor-tab")
const editorPanels = document.querySelectorAll<HTMLElement>(".code-editor-body")
const featureItems = document.querySelectorAll<HTMLElement>(".feature-item")
const codeCopyBtn = document.getElementById("code-copy-btn") as HTMLButtonElement | null
const menuBtn = document.querySelector<HTMLElement>(".mobile-menu-btn")
const mobileNav = document.querySelector<HTMLElement>(".mobile-nav")

tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    const key = tab.getAttribute("data-tab")
    if (!key || !installCommands[key]) {
      return
    }

    const { cmd, pkg } = installCommands[key]

    tabs.forEach((nextTab) => nextTab.setAttribute("aria-selected", "false"))
    tab.setAttribute("aria-selected", "true")

    if (!commandBtn) {
      return
    }

    const codeEl = commandBtn.querySelector("code")
    if (codeEl) {
      codeEl.innerHTML = `<span class="cmd">${cmd} </span><span class="highlight">${pkg}</span>`
    }
    commandBtn.setAttribute("data-command", `${cmd} ${pkg}`)
  })
})

commandBtn?.addEventListener("click", async () => {
  const command = commandBtn.getAttribute("data-command")
  if (!command) {
    return
  }

  await navigator.clipboard.writeText(command)
  const copyBtn = commandBtn.querySelector(".copy-btn")
  if (!copyBtn) {
    return
  }

  copyBtn.classList.add("copied")
  window.setTimeout(() => copyBtn.classList.remove("copied"), 1500)
})

editorTabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    const tabId = tab.getAttribute("data-tab")
    if (!tabId) {
      return
    }

    editorTabs.forEach((nextTab) => nextTab.setAttribute("aria-selected", "false"))
    tab.setAttribute("aria-selected", "true")

    editorPanels.forEach((panel) => {
      panel.setAttribute("data-active", panel.getAttribute("data-panel") === tabId ? "true" : "false")
    })
  })
})

featureItems.forEach((item) => {
  item.addEventListener("click", () => {
    featureItems.forEach((nextItem) => {
      nextItem.classList.remove("active")
      nextItem.querySelector(".bullet")?.replaceChildren("[*]")
    })

    item.classList.add("active")
    item.querySelector(".bullet")?.replaceChildren("[o]")

    const feature = item.getAttribute("data-feature")
    if (feature) {
      window.dispatchEvent(new CustomEvent("feature-change", { detail: feature }))
    }
  })

  item.addEventListener("keydown", (event: KeyboardEvent) => {
    if (event.key !== "Enter" && event.key !== " ") {
      return
    }

    event.preventDefault()
    item.click()
  })
})

codeCopyBtn?.addEventListener("click", async () => {
  const activePanel = document.querySelector<HTMLElement>('.code-editor-body[data-active="true"]')
  const code = activePanel?.querySelector("pre code")?.textContent
  if (!code) {
    return
  }

  await navigator.clipboard.writeText(code)
  codeCopyBtn.classList.add("copied")
  window.setTimeout(() => codeCopyBtn.classList.remove("copied"), 1500)
})

function openMenu(): void {
  document.body.classList.add("mobile-nav-open")
  menuBtn?.setAttribute("aria-expanded", "true")
  menuBtn?.setAttribute("aria-label", "Close navigation menu")
}

function closeMenu(): void {
  document.body.classList.remove("mobile-nav-open")
  menuBtn?.setAttribute("aria-expanded", "false")
  menuBtn?.setAttribute("aria-label", "Open navigation menu")
}

menuBtn?.addEventListener("click", () => {
  const isOpen = document.body.classList.contains("mobile-nav-open")
  if (isOpen) {
    closeMenu()
    return
  }

  openMenu()
})

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && document.body.classList.contains("mobile-nav-open")) {
    closeMenu()
  }
})

mobileNav?.querySelectorAll("a").forEach((link) => {
  link.addEventListener("click", closeMenu)
})
