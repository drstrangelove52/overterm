import { useState } from "react";
import { useTranslation } from "react-i18next";
import i18n from "../i18n";

const APP_VERSION = "1.0.5";

const FRONTEND = [
  { name: "React",               version: "18.3",  license: "MIT",                        roleKey: "about.roles.uiFramework" },
  { name: "React Router",        version: "6.28",  license: "MIT",                        roleKey: "about.roles.routing" },
  { name: "xterm.js",            version: "5.5",   license: "MIT",                        roleKey: "about.roles.terminalEmulator" },
  { name: "xterm addon-fit",     version: "0.10",  license: "MIT",                        roleKey: "about.roles.terminalFit" },
  { name: "xterm addon-web-links",version: "0.11", license: "MIT",                        roleKey: "about.roles.terminalLinks" },
  { name: "xterm addon-search",  version: "0.13",  license: "MIT",                        roleKey: "about.roles.terminalSearch" },
  { name: "Zustand",             version: "5.0",   license: "MIT",                        roleKey: "about.roles.stateManagement" },
  { name: "Axios",               version: "1.7",   license: "MIT",                        roleKey: "about.roles.httpClient" },
  { name: "Tailwind CSS",        version: "3.4",   license: "MIT",                        roleKey: "about.roles.cssFramework" },
  { name: "Vite",                version: "6.0",   license: "MIT",                        roleKey: "about.roles.buildTool" },
];

const BACKEND = [
  { name: "FastAPI",             version: "0.115", license: "MIT",                        roleKey: "about.roles.webFramework" },
  { name: "Uvicorn",             version: "0.32",  license: "BSD-3-Clause",               roleKey: "about.roles.asgiServer" },
  { name: "SQLAlchemy",          version: "2.0",   license: "MIT",                        roleKey: "about.roles.orm" },
  { name: "aiomysql",            version: "0.2",   license: "MIT",                        roleKey: "about.roles.mysqlDriver" },
  { name: "Pydantic",            version: "2.10",  license: "MIT",                        roleKey: "about.roles.validation" },
  { name: "asyncssh",            version: "2.18",  license: "EPL-2.0",                    roleKey: "about.roles.sshProtocol" },
  { name: "python-jose",         version: "3.3",   license: "MIT",                        roleKey: "about.roles.jwt" },
  { name: "passlib",             version: "1.7",   license: "BSD-3-Clause",               roleKey: "about.roles.passwordHashing" },
  { name: "bcrypt",              version: "4.0",   license: "Apache-2.0",                 roleKey: "about.roles.bcrypt" },
  { name: "cryptography",        version: "43.0",  license: "Apache-2.0 / BSD-3-Clause",  roleKey: "about.roles.encryption" },
  { name: "pyotp",               version: "2.9",   license: "MIT",                        roleKey: "about.roles.totp" },
  { name: "qrcode",              version: "8.0",   license: "BSD-3-Clause",               roleKey: "about.roles.qrCode" },
  { name: "slowapi",             version: "0.1",   license: "MIT",                        roleKey: "about.roles.rateLimiting" },
  { name: "httpx",               version: "0.28",  license: "BSD-3-Clause",               roleKey: "about.roles.httpClientProxmox" },
  { name: "python-multipart",    version: "0.0.18",license: "Apache-2.0",                 roleKey: "about.roles.multipart" },
];

const LICENSE_COLORS = {
  "MIT": "bg-green-900/50 text-green-300",
  "BSD-3-Clause": "bg-blue-900/50 text-blue-300",
  "Apache-2.0": "bg-orange-900/50 text-orange-300",
  "Apache-2.0 / BSD-3-Clause": "bg-orange-900/50 text-orange-300",
  "EPL-2.0": "bg-purple-900/50 text-purple-300",
};

function LicenseBadge({ license }) {
  const cls = LICENSE_COLORS[license] ?? "bg-gray-700 text-gray-300";
  return (
    <span className={`text-xs px-2 py-0.5 rounded font-mono whitespace-nowrap ${cls}`}>
      {license}
    </span>
  );
}

function ComponentTable({ items }) {
  const { t } = useTranslation();
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-xs text-gray-500 uppercase border-b border-gray-800">
          <th className="text-left py-2 pr-4 font-medium">{t("about.colComponent")}</th>
          <th className="text-left py-2 pr-4 font-medium hidden sm:table-cell">Version</th>
          <th className="text-left py-2 pr-4 font-medium">{t("about.licenseTitle")}</th>
          <th className="text-left py-2 font-medium hidden md:table-cell">{t("about.colUsage")}</th>
        </tr>
      </thead>
      <tbody>
        {items.map((item) => (
          <tr key={item.name} className="border-b border-gray-800/50 hover:bg-gray-800/20">
            <td className="py-2.5 pr-4 text-white font-medium">{item.name}</td>
            <td className="py-2.5 pr-4 text-gray-400 font-mono text-xs hidden sm:table-cell">{item.version}</td>
            <td className="py-2.5 pr-4"><LicenseBadge license={item.license} /></td>
            <td className="py-2.5 text-gray-400 hidden md:table-cell">{t(item.roleKey)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Section({ title, children }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
      <h2 className="text-white font-semibold mb-4">{title}</h2>
      {children}
    </div>
  );
}

// ── Shared doc helpers ────────────────────────────────────────────────────────

function DocSection({ title, children }) {
  return (
    <div className="space-y-2">
      <h3 className="text-white font-semibold text-base border-b border-gray-800 pb-2">{title}</h3>
      <div className="text-gray-400 text-sm space-y-2">{children}</div>
    </div>
  );
}

function DocItem({ label, children }) {
  return (
    <div className="flex gap-3">
      <span className="text-cyan-400 shrink-0 mt-0.5">▸</span>
      <div>
        {label && <span className="text-white font-medium">{label}: </span>}
        {children}
      </div>
    </div>
  );
}

function Kbd({ children }) {
  return (
    <kbd className="px-1.5 py-0.5 bg-gray-800 border border-gray-600 rounded text-xs font-mono text-gray-200">
      {children}
    </kbd>
  );
}

// ── Info tab ──────────────────────────────────────────────────────────────────

function InfoTab() {
  const { t } = useTranslation();
  return (
    <div className="space-y-6">
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
        <div className="flex items-center gap-4">
          <span className="text-cyan-400 font-mono font-bold text-3xl">OverTerm</span>
          <span className="text-gray-500 text-sm font-mono">v{APP_VERSION}</span>
        </div>
        <p className="text-gray-400 mt-2 text-sm">{t("about.tagline")}</p>
        <div className="flex flex-wrap gap-3 mt-4 text-xs text-gray-500">{t("about.techStack")}</div>
      </div>

      <Section title={t("about.frontendComponents")}>
        <ComponentTable items={FRONTEND} />
      </Section>

      <Section title={t("about.backendComponents")}>
        <ComponentTable items={BACKEND} />
        <div className="mt-4 pt-4 border-t border-gray-800 text-xs text-gray-500 space-y-1">
          <p>
            <span className="text-purple-300 font-mono">EPL-2.0</span>
            {" "}— {t("about.eplNote")}
          </p>
        </div>
      </Section>

      <Section title={t("about.licenseTitle")}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-gray-400">
          <div className="flex items-start gap-2">
            <LicenseBadge license="MIT" />
            <span>{t("about.licenseMit")}</span>
          </div>
          <div className="flex items-start gap-2">
            <LicenseBadge license="BSD-3-Clause" />
            <span>{t("about.licenseBsd")}</span>
          </div>
          <div className="flex items-start gap-2">
            <LicenseBadge license="Apache-2.0" />
            <span>{t("about.licenseApache")}</span>
          </div>
          <div className="flex items-start gap-2">
            <LicenseBadge license="EPL-2.0" />
            <span>{t("about.licenseEpl")}</span>
          </div>
        </div>
      </Section>
    </div>
  );
}

// ── Docs tab — German ─────────────────────────────────────────────────────────

function DocsTabDe() {
  return (
    <div className="space-y-8 max-w-3xl">
      <DocSection title="Übersicht">
        <p>OverTerm ist ein webbasierter SSH- und SFTP-Client. Er ersetzt lokale Tools wie PuTTY oder WinSCP und ermöglicht den Zugriff auf Server direkt im Browser — ohne Installation, von jedem Gerät aus.</p>
        <p>Das Backend baut eine SSH-Verbindung zum Zielserver auf und leitet die Kommunikation über eine WebSocket-Verbindung an den Browser weiter. Zugangsdaten werden verschlüsselt in der Datenbank gespeichert.</p>
      </DocSection>

      <DocSection title="Anmeldung">
        <DocItem label="Benutzername & Passwort">Zugangsdaten werden vom Administrator vergeben. Beim ersten Login sollte das Passwort im Profil geändert werden.</DocItem>
        <DocItem label="Zwei-Faktor-Authentifizierung (2FA)">Optional über TOTP (z.B. Google Authenticator, Authy, Aegis). Aktivierung im Profil unter «Zwei-Faktor-Authentifizierung». Nach der Aktivierung wird bei jedem Login ein 6-stelliger Code abgefragt.</DocItem>
        <DocItem label="Recovery Codes">Bei der 2FA-Einrichtung werden 8 Einmal-Recovery-Codes generiert und angezeigt. Diese erlauben die Anmeldung, wenn die Authenticator-App nicht verfügbar ist. Jeden Code sicher aufbewahren (z.B. im Passwort-Manager) — er wird nur einmal angezeigt. Im Login-Formular erscheint der Link «Recovery Code verwenden», um statt dem TOTP-Code einen Recovery Code einzugeben. Verbrauchte oder verlorene Codes können im Profil neu generiert werden.</DocItem>
        <DocItem label="Kontowiederherstellung (Notfall)">Falls weder Passwort noch Recovery Codes verfügbar sind, kann das Konto über die Management-CLI auf der Server-VM wiederhergestellt werden — siehe Abschnitt «Notfall-Verwaltung (CLI)».</DocItem>
      </DocSection>

      <DocSection title="SSH-Sessions">
        <DocItem label="Session starten">Auf der Host-Liste den gewünschten Host suchen und «SSH» klicken. Die Session öffnet sich als Tab oben im Fenster.</DocItem>
        <DocItem label="Mehrere Sessions">Beliebig viele SSH-Sessions können gleichzeitig geöffnet sein. Zwischen ihnen wird über die Tabs oben oder die Einträge in der Seitenleiste gewechselt.</DocItem>
        <DocItem label="Session beenden">Mit <Kbd>exit</Kbd> oder <Kbd>Ctrl</Kbd>+<Kbd>D</Kbd> im Terminal. Der Tab schliesst sich automatisch nach 1,5 Sekunden.</DocItem>
        <DocItem label="Inaktivitäts-Timeout">Sessions werden nach 30 Minuten ohne Tastatureingabe automatisch getrennt.</DocItem>
        <DocItem label="Textsuche im Terminal">Mit <Kbd>Ctrl</Kbd>+<Kbd>F</Kbd> öffnet sich eine Suchleiste oben rechts im Terminal. Mit <Kbd>Enter</Kbd> / <Kbd>Shift</Kbd>+<Kbd>Enter</Kbd> oder den Pfeiltasten ▲▼ wird vorwärts und rückwärts gesucht. <Kbd>Esc</Kbd> schliesst die Suche.</DocItem>
        <DocItem label="Host-Key-Prüfung">Beim ersten Verbinden wird der SSH-Fingerprint des Servers gespeichert. Bei einer späteren Änderung erscheint eine Warnung — dies kann auf eine Server-Neuinstallation oder einen Man-in-the-Middle-Angriff hinweisen.</DocItem>
      </DocSection>

      <DocSection title="Persistente Sessions (tmux-Integration)">
        <p>Wenn an einem Host die Option «In tmux starten» aktiviert ist (Admin → Host bearbeiten), läuft jede SSH-Session automatisch in einer <code className="text-cyan-400 font-mono text-xs">tmux</code>-Session auf dem Zielserver. Das ermöglicht echte Persistenz: Prozesse laufen weiter, auch wenn der Browser-Tab geschlossen oder die Verbindung getrennt wird.</p>
        <p className="text-amber-400/80 text-xs">Voraussetzung: <code className="font-mono">tmux</code> muss auf dem Zielserver installiert sein.</p>
        <DocItem label="Laufende Sessions (Seitenleiste)">Aktive tmux-Sessions erscheinen in der linken Seitenleiste unter «Laufende Sessions». Ein Klick öffnet die Session als neuen Tab — auch von einem anderen Gerät aus. Ein grüner Punkt zeigt an, dass gerade jemand verbunden ist; ein gelber, dass die Session läuft aber niemand verbunden ist.</DocItem>
        <DocItem label="Session fortsetzen">Nach dem Schliessen des Browsers: Seitenleiste öffnen → unter «Laufende Sessions» auf den Hostnamen klicken. Die Session wird exakt dort fortgesetzt, wo sie unterbrochen wurde.</DocItem>
        <DocItem label="Gemeinsame Sessions">Mehrere Benutzer können sich gleichzeitig in dieselbe tmux-Session einwählen und dieselbe Shell teilen. Jeder sieht dabei seinen eigenen Bildschirmbereich in voller Grösse (keine Anzeigefehler durch unterschiedliche Fenstergrössen).</DocItem>
        <DocItem label="Session beenden">✕ in der Seitenleiste beendet die Session vollständig (tmux kill + Eintrag entfernt). <Kbd>exit</Kbd> im Terminal beendet die Shell und damit auch die tmux-Session. <Kbd>Ctrl</Kbd>+<Kbd>B</Kbd> dann <Kbd>D</Kbd> detacht nur den Client — die Session läuft weiter und erscheint wieder in der Seitenleiste.</DocItem>
        <DocItem label="Nach Server-Neustart">tmux-Sessions überleben keinen Neustart des Zielservers. Nach einem Neustart werden alle laufenden Sessions automatisch aus der Seitenleiste entfernt.</DocItem>
      </DocSection>

      <DocSection title="SFTP-Dateibrowser">
        <DocItem label="SFTP starten">Auf der Host-Liste «SFTP» klicken. Der Dateibrowser öffnet sich als Tab.</DocItem>
        <DocItem label="Navigation">Verzeichnisse durch Klick öffnen, mit dem Pfad oben navigieren.</DocItem>
        <DocItem label="Dateien hoch- und herunterladen">Dateien können per Drag & Drop oder über die Schaltfläche hochgeladen und einzeln heruntergeladen werden.</DocItem>
      </DocSection>

      <DocSection title="Zugangsdaten">
        <p>OverTerm unterstützt mehrere Methoden zur Authentifizierung gegenüber SSH-Servern:</p>
        <DocItem label="Passwort (Host)">Ein festes Passwort wird vom Administrator am Host hinterlegt und gilt für alle Benutzer.</DocItem>
        <DocItem label="SSH-Key (Host)">Ein SSH-Schlüsselpaar wird vom Administrator am Host hinterlegt.</DocItem>
        <DocItem label="Persönliche Zugangsdaten">Jeder Benutzer kann unter «Meine Zugangsdaten» eigene Credentials für einzelne Hosts oder ganze Gruppen hinterlegen. Diese überschreiben die Host-Einstellungen und sind nur für den jeweiligen Benutzer sichtbar.</DocItem>
        <DocItem label="SSH-Keys verwalten">Eigene SSH-Schlüsselpaare können unter «SSH Keys» hochgeladen und dann als persönliche Zugangsdaten verwendet werden.</DocItem>
      </DocSection>

      <DocSection title="Host-Verwaltung (Admin)">
        <DocItem label="Hosts manuell anlegen">Über «+ Host hinzufügen» auf der Host-Liste. Pflichtfelder: Name, Hostname/IP, Port (Standard: 22), Authentifizierungsmethode.</DocItem>
        <DocItem label="Hosts via Proxmox importieren">Unter «Import» können Proxmox-Quellen konfiguriert werden. VMs und LXC-Container werden automatisch als Hosts importiert und bei jeder Synchronisierung aktualisiert.</DocItem>
        <DocItem label="Gruppen">Hosts werden Gruppen zugeteilt. Benutzer sehen nur Hosts aus Gruppen, denen sie angehören. Admins sehen alle Hosts.</DocItem>
        <DocItem label="Web-Links">An jedem Host können Web-Links hinterlegt werden (z.B. Link zur Web-UI des Servers). Sie erscheinen als Schaltflächen in der Host-Liste.</DocItem>
        <DocItem label="Notizen">Jeder Host hat ein freies Notizfeld für interne Hinweise (z.B. Zweck des Servers, Ansprechpersonen, besondere Konfigurationen). Notizen werden in der Host-Liste direkt unter dem Namen angezeigt.</DocItem>
        <DocItem label="Status-Indikator">Beim Laden der Host-Liste wird automatisch ein SSH-Verbindungstest für jeden Host durchgeführt. Ein farbiger Punkt zeigt das Ergebnis: grün = erreichbar, rot = nicht erreichbar, grau = wird geprüft.</DocItem>
      </DocSection>

      <DocSection title="Schnellbefehle">
        <p>Unter Profil → Schnellbefehle können häufig verwendete Befehle als Buttons in der Terminal-Toolbar hinterlegt werden. Ein Klick sendet den Befehl direkt an die aktive Session.</p>
        <DocItem label="Hotkeys">Jedem Schnellbefehl kann eine Taste zugewiesen werden: <Kbd>Shift+F1</Kbd> bis <Kbd>Shift+F12</Kbd> oder <Kbd>F2</Kbd>–<Kbd>F12</Kbd> (F1 ist für Browser-Hilfe reserviert). Die Taste wird im Terminal-Fenster abgefangen und sendet den Befehl, ohne den normalen Terminal-Input zu stören.</DocItem>
        <DocItem label="Auto-Enter">Mit aktiviertem «⏎» wird nach dem Befehl automatisch Enter gesendet. Deaktivieren, wenn der Befehl vor dem Absenden noch angepasst werden soll — z.B. für Präfix-Sequenzen.</DocItem>
        <DocItem label="Escape-Sequenzen">In Befehlen können Steuerzeichen als Text hinterlegt werden:
          <ul className="mt-1 space-y-0.5 ml-4 list-none">
            <li><code className="text-cyan-400 font-mono text-xs">\x01</code> — Ctrl+A (screen-Prefix)</li>
            <li><code className="text-cyan-400 font-mono text-xs">\n</code> — Zeilenumbruch</li>
            <li><code className="text-cyan-400 font-mono text-xs">\r</code> — Carriage Return</li>
            <li><code className="text-cyan-400 font-mono text-xs">\xNN</code> — beliebiges Steuerzeichen (hex)</li>
          </ul>
          Beispiel für screen-Detach: Befehl <code className="text-cyan-400 font-mono text-xs">\x01d</code>, Auto-Enter deaktiviert.
        </DocItem>
        <DocItem label="Reihenfolge">Schnellbefehle können per ▲/▼ in der gewünschten Reihenfolge sortiert werden.</DocItem>
      </DocSection>

      <DocSection title="Broadcast-Modus">
        <p>Wenn mehrere SSH-Sessions geöffnet sind, kann der Broadcast-Modus aktiviert werden (🔇-Symbol in der Seitenleiste). Alle Tastatureingaben werden dann gleichzeitig an alle ausgewählten Sessions gesendet — nützlich für parallele Befehle auf mehreren Servern.</p>
      </DocSection>

      <DocSection title="Backup & Restore (Admin)">
        <DocItem label="Backup erstellen">Unter Admin → Backup & Restore → «Backup herunterladen». Die JSON-Datei enthält alle Benutzer, Hosts, Gruppen und Zugangsdaten.</DocItem>
        <DocItem label="Backup einspielen">JSON-Datei hochladen und bestätigen. Alle bestehenden Daten werden dabei überschrieben.</DocItem>
        <DocItem><span className="text-amber-400 font-medium">Wichtig:</span> Der <code className="text-cyan-400 font-mono text-xs">ENCRYPTION_KEY</code> aus der <code className="text-cyan-400 font-mono text-xs">.env</code>-Datei muss auf der Zielinstanz identisch sein, sonst sind verschlüsselte Passwörter und SSH-Keys nach dem Restore unlesbar. Den Key separat und sicher aufbewahren.</DocItem>
      </DocSection>

      <DocSection title="API-Zugang">
        <p>OverTerm stellt eine vollständige REST-API bereit. Die interaktive Dokumentation ist direkt über den Browser erreichbar:</p>
        <DocItem label="Swagger UI"><code className="text-cyan-400 font-mono text-xs">/docs</code> — interaktive API-Dokumentation mit der Möglichkeit, Endpoints direkt auszuprobieren.</DocItem>
        <DocItem label="ReDoc"><code className="text-cyan-400 font-mono text-xs">/redoc</code> — lesbare API-Referenz im ReDoc-Format.</DocItem>
        <DocItem label="Authentifizierung">Alle API-Endpoints (ausser <code className="text-cyan-400 font-mono text-xs">/auth/login</code>) erfordern einen JWT-Bearer-Token. Token wird via <code className="text-cyan-400 font-mono text-xs">POST /auth/login</code> mit Benutzername und Passwort bezogen und als <code className="text-cyan-400 font-mono text-xs">Authorization: Bearer &lt;token&gt;</code> Header mitgeschickt.</DocItem>
        <DocItem label="Wichtige Endpoints">
          <ul className="mt-1 space-y-0.5 ml-0 list-none font-mono text-xs">
            <li><code className="text-cyan-400">GET  /hosts</code> <span className="text-gray-400 font-sans"> — Host-Liste</span></li>
            <li><code className="text-cyan-400">POST /hosts/&#123;id&#125;/test</code> <span className="text-gray-400 font-sans"> — Verbindungstest</span></li>
            <li><code className="text-cyan-400">GET  /sessions/active</code> <span className="text-gray-400 font-sans"> — Laufende tmux-Sessions</span></li>
            <li><code className="text-cyan-400">DEL  /sessions/active/&#123;id&#125;</code> <span className="text-gray-400 font-sans"> — tmux-Session beenden</span></li>
            <li><code className="text-cyan-400">GET  /admin/backup</code> <span className="text-gray-400 font-sans"> — Backup herunterladen (Admin)</span></li>
            <li><code className="text-cyan-400">POST /admin/restore</code> <span className="text-gray-400 font-sans"> — Backup einspielen (Admin)</span></li>
            <li><code className="text-cyan-400">WS   /ws/ssh/&#123;id&#125;</code> <span className="text-gray-400 font-sans"> — SSH-Session WebSocket</span></li>
          </ul>
        </DocItem>
      </DocSection>

      <DocSection title="Profil & Sicherheit">
        <DocItem label="Passwort ändern">Im Profil (Klick auf den Benutzernamen links unten) unter «Passwort ändern».</DocItem>
        <DocItem label="2FA aktivieren">Im Profil unter «Zwei-Faktor-Authentifizierung». QR-Code mit einer Authenticator-App scannen und mit einem gültigen Code bestätigen. Nach der Aktivierung werden 8 Recovery Codes angezeigt — diese sofort sichern.</DocItem>
        <DocItem label="Recovery Codes verwalten">Im Profil unter «Recovery Codes neu generieren». Erfordert das aktuelle Passwort. Alle bisherigen Codes werden dabei ungültig.</DocItem>
        <DocItem label="Session-Log">Admins können unter «Session-Log» alle vergangenen Verbindungen einsehen, inklusive Benutzer, Host, Zeitstempel und Dauer.</DocItem>
      </DocSection>

      <DocSection title="Notfall-Verwaltung (CLI)">
        <p>Falls ein Account gesperrt ist oder Passwort / 2FA nicht mehr zugänglich sind, kann die Management-CLI direkt im Backend-Container verwendet werden:</p>
        <div className="bg-gray-950 border border-gray-700 rounded p-3 font-mono text-xs space-y-1 text-cyan-300">
          <div><span className="text-gray-500"># Alle Benutzer anzeigen</span></div>
          <div>docker compose exec backend python manage.py list-users</div>
          <div className="pt-1"><span className="text-gray-500"># Passwort zurücksetzen</span></div>
          <div>docker compose exec backend python manage.py reset-password &lt;username&gt;</div>
          <div className="pt-1"><span className="text-gray-500"># 2FA deaktivieren</span></div>
          <div>docker compose exec backend python manage.py disable-totp &lt;username&gt;</div>
          <div className="pt-1"><span className="text-gray-500"># Deaktivierten Account reaktivieren</span></div>
          <div>docker compose exec backend python manage.py activate-user &lt;username&gt;</div>
        </div>
        <DocItem>Die CLI muss auf der VM ausgeführt werden, auf der OverTerm läuft — direkter SSH-Zugang zur VM ist daher der letzte Notfall-Fallback.</DocItem>
      </DocSection>
    </div>
  );
}

// ── Docs tab — English ────────────────────────────────────────────────────────

function DocsTabEn() {
  return (
    <div className="space-y-8 max-w-3xl">
      <DocSection title="Overview">
        <p>OverTerm is a web-based SSH and SFTP client. It replaces local tools like PuTTY or WinSCP and enables direct server access in the browser — no installation required, from any device.</p>
        <p>The backend establishes an SSH connection to the target server and forwards communication over a WebSocket connection to the browser. Credentials are stored encrypted in the database.</p>
      </DocSection>

      <DocSection title="Login">
        <DocItem label="Username & Password">Credentials are assigned by the administrator. The password should be changed in the profile on first login.</DocItem>
        <DocItem label="Two-Factor Authentication (2FA)">Optional via TOTP (e.g. Google Authenticator, Authy, Aegis). Enable in profile under "Two-Factor Authentication". After activation, a 6-digit code is required at each login.</DocItem>
        <DocItem label="Recovery Codes">8 one-time recovery codes are generated and displayed during 2FA setup. These allow login when the authenticator app is unavailable. Keep each code safe (e.g. in a password manager) — it is only shown once. In the login form, the link "Use Recovery Code" appears to enter a recovery code instead of the TOTP code. Used or lost codes can be regenerated in the profile.</DocItem>
        <DocItem label="Account Recovery (Emergency)">If neither password nor recovery codes are available, the account can be recovered via the management CLI on the server VM — see "Emergency Management (CLI)".</DocItem>
      </DocSection>

      <DocSection title="SSH Sessions">
        <DocItem label="Start session">Find the desired host in the host list and click "SSH". The session opens as a tab at the top of the window.</DocItem>
        <DocItem label="Multiple sessions">Any number of SSH sessions can be open simultaneously. Switch between them using the tabs at the top or entries in the sidebar.</DocItem>
        <DocItem label="End session">With <Kbd>exit</Kbd> or <Kbd>Ctrl</Kbd>+<Kbd>D</Kbd> in the terminal. The tab closes automatically after 1.5 seconds.</DocItem>
        <DocItem label="Inactivity timeout">Sessions are automatically disconnected after 30 minutes without keyboard input.</DocItem>
        <DocItem label="Text search in terminal"><Kbd>Ctrl</Kbd>+<Kbd>F</Kbd> opens a search bar at the top right of the terminal. <Kbd>Enter</Kbd> / <Kbd>Shift</Kbd>+<Kbd>Enter</Kbd> or the ▲▼ buttons search forward and backward. <Kbd>Esc</Kbd> closes the search.</DocItem>
        <DocItem label="Host key verification">On first connection, the SSH fingerprint of the server is saved. A warning appears if it changes later — this may indicate a server reinstall or man-in-the-middle attack.</DocItem>
      </DocSection>

      <DocSection title="Persistent Sessions (tmux Integration)">
        <p>If a host has "Start in tmux" enabled (Admin → Edit host), each SSH session automatically runs in a <code className="text-cyan-400 font-mono text-xs">tmux</code> session on the target server. This enables true persistence: processes continue running even if the browser tab is closed or the connection is interrupted.</p>
        <p className="text-amber-400/80 text-xs">Prerequisite: <code className="font-mono">tmux</code> must be installed on the target server.</p>
        <DocItem label="Running sessions (sidebar)">Active tmux sessions appear in the left sidebar under "Running Sessions". A click opens the session as a new tab — even from another device. A green dot indicates someone is currently connected; yellow means the session is running but no one is connected.</DocItem>
        <DocItem label="Resume session">After closing the browser: open sidebar → click on the hostname under "Running Sessions". The session resumes exactly where it was interrupted.</DocItem>
        <DocItem label="Shared sessions">Multiple users can connect to the same tmux session simultaneously and share the same shell. Each sees their own full-size display area (no rendering artifacts from different window sizes).</DocItem>
        <DocItem label="End session">✕ in the sidebar ends the session completely (tmux kill + entry removed). <Kbd>exit</Kbd> in the terminal ends the shell and thus the tmux session. <Kbd>Ctrl</Kbd>+<Kbd>B</Kbd> then <Kbd>D</Kbd> only detaches the client — the session continues and reappears in the sidebar.</DocItem>
        <DocItem label="After server restart">tmux sessions do not survive a restart of the target server. After a restart, all running sessions are automatically removed from the sidebar.</DocItem>
      </DocSection>

      <DocSection title="SFTP File Browser">
        <DocItem label="Start SFTP">Click "SFTP" in the host list. The file browser opens as a tab.</DocItem>
        <DocItem label="Navigation">Open directories by clicking, navigate with the path bar at the top.</DocItem>
        <DocItem label="Upload and download files">Files can be uploaded via drag & drop or the upload button, and downloaded individually.</DocItem>
      </DocSection>

      <DocSection title="Credentials">
        <p>OverTerm supports multiple authentication methods for SSH servers:</p>
        <DocItem label="Password (Host)">A fixed password is stored by the administrator on the host and applies to all users.</DocItem>
        <DocItem label="SSH Key (Host)">An SSH key pair is stored by the administrator on the host.</DocItem>
        <DocItem label="Personal credentials">Each user can store their own credentials for individual hosts or entire groups under "My Credentials". These override the host settings and are only visible to the respective user.</DocItem>
        <DocItem label="Manage SSH keys">Own SSH key pairs can be uploaded under "SSH Keys" and then used as personal credentials.</DocItem>
      </DocSection>

      <DocSection title="Host Management (Admin)">
        <DocItem label="Create hosts manually">Via "+ Add Host" on the host list. Required fields: name, hostname/IP, port (default: 22), authentication method.</DocItem>
        <DocItem label="Import hosts via Proxmox">Under "Import", Proxmox sources can be configured. VMs and LXC containers are automatically imported as hosts and updated with each sync.</DocItem>
        <DocItem label="Groups">Hosts are assigned to groups. Users only see hosts from groups they belong to. Admins see all hosts.</DocItem>
        <DocItem label="Web links">Web links can be stored on each host (e.g. link to the server's web UI). They appear as buttons in the host list.</DocItem>
        <DocItem label="Notes">Each host has a free notes field for internal comments (e.g. server purpose, contacts, special configurations). Notes are displayed in the host list directly below the name.</DocItem>
        <DocItem label="Status indicator">When loading the host list, an SSH connection test is automatically performed for each host. A colored dot shows the result: green = reachable, red = unreachable, gray = checking.</DocItem>
      </DocSection>

      <DocSection title="Quick Commands">
        <p>Under Profile → Quick Commands, frequently used commands can be stored as buttons in the terminal toolbar. A click sends the command directly to the active session.</p>
        <DocItem label="Hotkeys">Each quick command can be assigned a key: <Kbd>Shift+F1</Kbd> to <Kbd>Shift+F12</Kbd> or <Kbd>F2</Kbd>–<Kbd>F12</Kbd> (F1 is reserved for browser help). The key is captured in the terminal window and sends the command without disturbing normal terminal input.</DocItem>
        <DocItem label="Auto-Enter">With "⏎" enabled, Enter is automatically sent after the command. Disable if the command should still be adjusted before sending — e.g. for prefix sequences.</DocItem>
        <DocItem label="Escape sequences">Control characters can be stored as text in commands:
          <ul className="mt-1 space-y-0.5 ml-4 list-none">
            <li><code className="text-cyan-400 font-mono text-xs">\x01</code> — Ctrl+A (screen prefix)</li>
            <li><code className="text-cyan-400 font-mono text-xs">\n</code> — newline</li>
            <li><code className="text-cyan-400 font-mono text-xs">\r</code> — carriage return</li>
            <li><code className="text-cyan-400 font-mono text-xs">\xNN</code> — any control character (hex)</li>
          </ul>
          Example for screen detach: command <code className="text-cyan-400 font-mono text-xs">\x01d</code>, auto-enter disabled.
        </DocItem>
        <DocItem label="Order">Quick commands can be sorted in the desired order using ▲/▼.</DocItem>
      </DocSection>

      <DocSection title="Broadcast Mode">
        <p>When multiple SSH sessions are open, broadcast mode can be activated (🔇 icon in the sidebar). All keyboard input is then sent simultaneously to all selected sessions — useful for running parallel commands on multiple servers.</p>
      </DocSection>

      <DocSection title="Backup & Restore (Admin)">
        <DocItem label="Create backup">Under Admin → Backup & Restore → "Download Backup". The JSON file contains all users, hosts, groups and credentials.</DocItem>
        <DocItem label="Restore backup">Upload JSON file and confirm. All existing data will be overwritten.</DocItem>
        <DocItem><span className="text-amber-400 font-medium">Important:</span> The <code className="text-cyan-400 font-mono text-xs">ENCRYPTION_KEY</code> from the <code className="text-cyan-400 font-mono text-xs">.env</code> file must be identical on the target instance, otherwise encrypted passwords and SSH keys will be unreadable after restore. Store the key separately and securely.</DocItem>
      </DocSection>

      <DocSection title="API Access">
        <p>OverTerm provides a complete REST API. Interactive documentation is accessible directly via browser:</p>
        <DocItem label="Swagger UI"><code className="text-cyan-400 font-mono text-xs">/docs</code> — interactive API documentation with the ability to test endpoints directly.</DocItem>
        <DocItem label="ReDoc"><code className="text-cyan-400 font-mono text-xs">/redoc</code> — readable API reference in ReDoc format.</DocItem>
        <DocItem label="Authentication">All API endpoints (except <code className="text-cyan-400 font-mono text-xs">/auth/login</code>) require a JWT Bearer token. Token is obtained via <code className="text-cyan-400 font-mono text-xs">POST /auth/login</code> with username and password and sent as <code className="text-cyan-400 font-mono text-xs">Authorization: Bearer &lt;token&gt;</code> header.</DocItem>
        <DocItem label="Key endpoints">
          <ul className="mt-1 space-y-0.5 ml-0 list-none font-mono text-xs">
            <li><code className="text-cyan-400">GET  /hosts</code> <span className="text-gray-400 font-sans"> — host list</span></li>
            <li><code className="text-cyan-400">POST /hosts/&#123;id&#125;/test</code> <span className="text-gray-400 font-sans"> — connection test</span></li>
            <li><code className="text-cyan-400">GET  /sessions/active</code> <span className="text-gray-400 font-sans"> — running tmux sessions</span></li>
            <li><code className="text-cyan-400">DEL  /sessions/active/&#123;id&#125;</code> <span className="text-gray-400 font-sans"> — end tmux session</span></li>
            <li><code className="text-cyan-400">GET  /admin/backup</code> <span className="text-gray-400 font-sans"> — download backup (admin)</span></li>
            <li><code className="text-cyan-400">POST /admin/restore</code> <span className="text-gray-400 font-sans"> — restore backup (admin)</span></li>
            <li><code className="text-cyan-400">WS   /ws/ssh/&#123;id&#125;</code> <span className="text-gray-400 font-sans"> — SSH session WebSocket</span></li>
          </ul>
        </DocItem>
      </DocSection>

      <DocSection title="Profile & Security">
        <DocItem label="Change password">In the profile (click username bottom left) under "Change Password".</DocItem>
        <DocItem label="Enable 2FA">In the profile under "Two-Factor Authentication". Scan QR code with an authenticator app and confirm with a valid code. After activation, 8 recovery codes are displayed — save these immediately.</DocItem>
        <DocItem label="Manage recovery codes">In the profile under "Regenerate Recovery Codes". Requires the current password. All existing codes are invalidated.</DocItem>
        <DocItem label="Session log">Admins can view all past connections under "Session Log", including user, host, timestamp and duration.</DocItem>
      </DocSection>

      <DocSection title="Emergency Management (CLI)">
        <p>If an account is locked or password / 2FA is no longer accessible, the management CLI can be used directly in the backend container:</p>
        <div className="bg-gray-950 border border-gray-700 rounded p-3 font-mono text-xs space-y-1 text-cyan-300">
          <div><span className="text-gray-500"># List all users</span></div>
          <div>docker compose exec backend python manage.py list-users</div>
          <div className="pt-1"><span className="text-gray-500"># Reset password</span></div>
          <div>docker compose exec backend python manage.py reset-password &lt;username&gt;</div>
          <div className="pt-1"><span className="text-gray-500"># Disable 2FA</span></div>
          <div>docker compose exec backend python manage.py disable-totp &lt;username&gt;</div>
          <div className="pt-1"><span className="text-gray-500"># Reactivate disabled account</span></div>
          <div>docker compose exec backend python manage.py activate-user &lt;username&gt;</div>
        </div>
        <DocItem>The CLI must be run on the VM where OverTerm is running — direct SSH access to the VM is therefore the last emergency fallback.</DocItem>
      </DocSection>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function About() {
  const { t } = useTranslation();
  const [tab, setTab] = useState("docs");

  const TABS = [
    { key: "docs", label: t("about.docsTab") },
    { key: "info", label: t("about.infoTab") },
  ];

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex gap-1 mb-6 border-b border-gray-800">
        {TABS.map((tb) => (
          <button
            key={tb.key}
            onClick={() => setTab(tb.key)}
            className={`px-4 py-2 text-sm font-medium transition-colors rounded-t ${
              tab === tb.key
                ? "bg-gray-900 text-white border border-b-gray-900 border-gray-800 -mb-px"
                : "text-gray-400 hover:text-white"
            }`}
          >
            {tb.label}
          </button>
        ))}
      </div>
      {tab === "docs" && (i18n.language === "en" ? <DocsTabEn /> : <DocsTabDe />)}
      {tab === "info" && <InfoTab />}
    </div>
  );
}
