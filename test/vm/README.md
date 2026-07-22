# Test peal in a throwaway VM (Windows / macOS / Linux)

peal runs on **Debian**, so on Windows you test it inside a small Linux VM. This folder gives you a
one-command, disposable Debian 13 VM that runs `install.sh` for you — the same thing that was verified
by hand, wrapped so anyone can reproduce it.

## 1. Download two free tools

| Tool | Link | Why |
|---|---|---|
| **VirtualBox** | <https://www.virtualbox.org/wiki/Downloads> | runs the Linux VM (works on every Windows edition) |
| **Vagrant** | <https://developer.hashicorp.com/vagrant/install> | one command builds the VM + runs the installer |

> Enable virtualization in your PC's BIOS/UEFI if VirtualBox complains (VT-x / AMD-V). On Windows Pro
> you can use Hyper-V instead of VirtualBox — see the bottom of this file.

## 2. Get the repo, then bring the VM up

```powershell
git clone https://github.com/ExJtac/peal.git
cd peal\test\vm
vagrant up
```

`vagrant up` downloads a Debian 13 image, boots it, and runs `install.sh` (**~20–40 min the first
time — it compiles Asterisk from source**). When it finishes you'll see the banner with the console URL
and a one-time admin password.

## 3. Open the console

In your browser on the **same PC**:

- **<http://localhost:3001>**
- Log in as **`admin@pbx.local`** with the password printed at the end of `vagrant up`.

That's a full PBX admin console, produced from a bare OS by one command. 🎉

## Plug in a physical phone (bridged networking)

The default `vagrant up` uses NAT — fine for the browser console, but a **physical desk phone can't
register through NAT**. To connect a real phone, bring the VM up in **bridged** mode so it gets a real
IP on your LAN:

```powershell
$env:PEAL_NET="bridged"; vagrant up      # PowerShell
#   PEAL_NET=bridged vagrant up           # macOS / Linux / Git-Bash
```

Vagrant asks **which network adapter to bridge** — pick the one your phone is on (your wired Ethernet or
Wi-Fi). The installer detects the VM's LAN IP and opens the firewall to your LAN automatically; the
final banner shows it (e.g. `Console : http://192.168.1.50:3001`). Note that address — call it `VM_IP`.

**Register the phone (Fanvil X5U shown — any Fanvil is the same):**
1. In the console → **Extensions** → add one (e.g. `1001`) and set a **SIP password** (or note the
   seeded one). This writes the realtime endpoint the phone registers against.
2. Find the phone's IP (its screen → *Status*), open `http://<phone-ip>/` in a browser, log in
   (default `admin` / `admin`).
3. **Line → SIP** (Account 1): **Server Address** = `VM_IP`, **Server Port** = `5060`,
   **Username** / **Register Name** = `1001`, **Password** = the SIP password, **Enable** = on. Apply.
4. The phone shows registered; the console's **Extensions** / dashboard shows it online. Dial another
   extension to test.

*(Prefer zero-touch? peal auto-provisions Fanvil — add the phone's MAC under **Provisioning** and point
its Auto-Provision URL at `http://VM_IP:3001/provision/<mac>`. Manual SIP above is the quickest first
proof, though.)*

## Managing the VM

```powershell
vagrant ssh          # shell into the guest (e.g. sudo asterisk -rx "pjsip show endpoints")
vagrant halt         # stop it (keeps state)
vagrant up           # start it again
vagrant destroy -f   # delete it completely and reclaim the disk
```

## Testing your LOCAL changes (before pushing to GitHub)

The default above installs the **published** code from GitHub, so it needs the repo pushed public.
To test your **current working copy** instead (no push needed):

```powershell
# from peal\test\vm
$env:PEAL_SOURCE="local"; vagrant up      # PowerShell
#   PEAL_SOURCE=local vagrant up           # macOS/Linux/Git-Bash
```

Local mode syncs the repo into the VM with **rsync** (Git-for-Windows ships an `rsync` on PATH; if
`vagrant up` says rsync is missing, install Git for Windows or run from Git-Bash).

## Requirements / notes

- **~6 GB free RAM** while the VM runs (it's configured for 4 CPUs / 5 GiB) and a few GB of disk.
- First run is slow because Asterisk builds from source; re-running `install.sh` inside the VM is
  **idempotent** (it preserves secrets and the admin password).
- Override defaults with env vars: `PEAL_OWNER`, `PEAL_NAME`, `PEAL_BRANCH` (e.g. test a fork/branch).
- **Hyper-V** (Windows 11 Pro): `vagrant up --provider hyperv` (VirtualBox is the default because it
  also works on Windows Home).

> This VM is for **testing**. For real use, run the same one-liner on an always-on Linux box — a small
> mini-PC, a persistent Hyper-V VM, or a cloud instance (see the root `INSTALL.md`).
