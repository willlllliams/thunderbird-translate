// A Thunderbird of its own for the e2e run: a temporary profile with the test
// build preinstalled, started headless and separate from any running instance,
// and stopped by the process ids of this run only.
import { execFileSync, spawn } from "node:child_process"
import { createWriteStream, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { basename, join } from "node:path"

const isWindows = process.platform === "win32"

/** THUNDERBIRD_BIN, else the usual install location of the platform. */
export function findThunderbird() {
  const candidates = [
    process.env.THUNDERBIRD_BIN,
    ...(isWindows
      ? ["C:/Program Files/Mozilla Thunderbird/thunderbird.exe", "C:/Program Files (x86)/Mozilla Thunderbird/thunderbird.exe"]
      : process.platform === "darwin"
        ? ["/Applications/Thunderbird.app/Contents/MacOS/thunderbird"]
        : ["/usr/bin/thunderbird", "/usr/lib/thunderbird/thunderbird", "/snap/bin/thunderbird"]),
  ].filter(Boolean)
  const found = candidates.find((p) => existsSync(p))
  if (!found) throw new Error(`Thunderbird not found; set THUNDERBIRD_BIN. Tried: ${candidates.join(", ")}`)
  return found
}

export function thunderbirdVersion(bin) {
  try {
    return execFileSync(bin, ["--version"], { encoding: "utf8", timeout: 30000 }).trim()
  } catch {
    return "unknown version"
  }
}

const PREFS = {
  // Load the unsigned test build from the profile's extensions/ folder without asking.
  "xpinstall.signatures.required": false,
  "extensions.autoDisableScopes": 0,
  "extensions.enabledScopes": 15,
  // No first-run dialogs, start page, default-client check, updates or telemetry.
  "mail.provider.suppress_dialog_on_startup": true,
  "mail.shell.checkDefaultClient": false,
  "mailnews.start_page.enabled": false,
  "mail.rights.override": true,
  "app.update.disabledForTesting": true,
  "app.update.auto": false,
  "datareporting.policy.dataSubmissionEnabled": false,
  "toolkit.telemetry.reportingpolicy.firstRun": false,
  "browser.shell.checkDefaultBrowser": false,
  "mail.biff.play_sound": false,
  // Console output of the extension in the log of the run.
  "devtools.console.stdout.chrome": true,
  "devtools.console.stdout.content": true,
  "browser.dom.window.dump.enabled": true,
}

/** The account "Local Folders", whose folders are the mbox files in Mail/Local Folders/ of the profile. */
const LOCAL_FOLDERS = {
  "mail.accountmanager.accounts": "account1",
  "mail.accountmanager.localfoldersserver": "server1",
  "mail.account.account1.server": "server1",
  "mail.server.server1.type": "none",
  "mail.server.server1.hostname": "Local Folders",
  "mail.server.server1.name": "Local Folders",
  "mail.server.server1.userName": "nobody",
  "mail.server.server1.directory-rel": "[ProfD]Mail/Local Folders",
  "mail.server.server1.storeContractID": "@mozilla.org/msgstore/berkeleystore;1",
  // The table view of the message list, which shows the columns of add-ons (the cards view does not).
  "mail.threadpane.listview": 1,
}

/** A header value: ASCII as it is, anything else as an RFC 2047 encoded word. */
const headerText = (text) => (/^[\x20-\x7e]*$/.test(text) ? text : `=?UTF-8?B?${Buffer.from(text, "utf8").toString("base64")}?=`)

/** An mbox file of plain-text messages: { from, subject, date, body } each. */
export function mbox(messages) {
  return messages
    .map(({ from, subject, date, body }, i) => {
      const headers = [
        // Only the name is encoded; the address stays as it is.
        `From: ${from.replace(/^(.*?) </, (_, name) => `${headerText(name)} <`)}`,
        "To: Bob Stone <bob@example.com>",
        `Subject: ${headerText(subject)}`,
        `Date: ${new Date(date).toUTCString().replace("GMT", "+0000")}`,
        `Message-ID: <tt-e2e-folder-${i}-${Date.parse(date)}@example.com>`,
        "MIME-Version: 1.0",
        "Content-Type: text/plain; charset=UTF-8",
        "Content-Transfer-Encoding: 8bit",
      ]
      return `From - ${new Date(date).toUTCString()}\n${headers.join("\n")}\n\n${body}\n\n`
    })
    .join("")
}

/**
 * A fresh profile holding the xpi as extensions/<id>.xpi. With `folders` ({ name: mbox text }), the profile has the
 * account "Local Folders" with these folders, and the message list shows the table view.
 */
export function createProfile(xpi, extensionId, { folders } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "tt-e2e-profile-"))
  mkdirSync(join(dir, "extensions"))
  writeFileSync(join(dir, "extensions", `${extensionId}.xpi`), xpi)
  const prefs = { ...PREFS, ...(folders ? LOCAL_FOLDERS : {}) }
  writeFileSync(join(dir, "user.js"), Object.entries(prefs).map(([k, v]) => `user_pref(${JSON.stringify(k)}, ${JSON.stringify(v)});`).join("\n") + "\n")
  if (folders) {
    const local = join(dir, "Mail", "Local Folders")
    mkdirSync(local, { recursive: true })
    for (const [name, text] of Object.entries(folders)) writeFileSync(join(local, name), text)
  }
  return dir
}

export function removeProfile(dir) {
  rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 })
}

/** Start Thunderbird on the profile and open `eml` (none: just start); output goes to `logFile`. */
export function launch(bin, profile, eml, logFile) {
  const args = ["--headless", "--new-instance", "--no-remote", "--profile", profile, ...(eml ? ["-file", eml] : [])]
  const child = spawn(bin, args, {
    stdio: ["ignore", "pipe", "pipe"],
    // Own process group on Linux and macOS, so that stop() reaches the content processes too.
    detached: !isWindows,
    env: { ...process.env, MOZ_CRASHREPORTER_DISABLE: "1", MOZ_DISABLE_AUTO_SAFE_MODE: "1" },
  })
  const log = createWriteStream(logFile)
  child.stdout.pipe(log)
  child.stderr.pipe(log)
  child.exited = new Promise((resolve) => child.once("exit", resolve))
  return child
}

/** Process ids started for `profile`: those whose command line names it, and their descendants (Windows). */
function windowsProfileProcesses(profile) {
  const script = `$all = Get-CimInstance Win32_Process
$ids = @($all | Where-Object { $_.CommandLine -like '*${basename(profile)}*' } | ForEach-Object { $_.ProcessId })
do { $before = $ids.Count; $ids = @($ids + @($all | Where-Object { $ids -contains $_.ParentProcessId } | ForEach-Object { $_.ProcessId }) | Sort-Object -Unique) } while ($ids.Count -gt $before)
$ids -join ','`
  try {
    const out = execFileSync("powershell", ["-NoProfile", "-NonInteractive", "-Command", script], { encoding: "utf8", timeout: 60000 }).trim()
    return out ? out.split(",").map(Number).filter(Boolean) : []
  } catch {
    return []
  }
}

/** Stop the Thunderbird of this run: the spawned process, its children and anything else running on the temporary profile. */
export async function stop(child, profile) {
  if (isWindows) {
    const ids = new Set([child.pid, ...windowsProfileProcesses(profile)])
    for (const pid of ids) {
      try {
        execFileSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" })
      } catch {
        // Already gone.
      }
    }
  } else {
    for (const signal of ["SIGTERM", "SIGKILL"]) {
      try {
        process.kill(-child.pid, signal)
      } catch {
        break
      }
      const exited = await Promise.race([child.exited.then(() => true), new Promise((r) => setTimeout(() => r(false), 5000))])
      if (exited) break
    }
  }
  await Promise.race([child.exited, new Promise((r) => setTimeout(r, 10000))])
  // Give the file handles of the profile a moment to close.
  await new Promise((r) => setTimeout(r, isWindows ? 1500 : 300))
}
