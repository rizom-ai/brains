import {
  Notice,
  Plugin,
  PluginSettingTab,
  Setting,
  TFile,
  requestUrl,
  type App,
  type ObsidianProtocolData,
} from "obsidian";
import {
  ChangeFollower,
  type Watching,
  ChangeWatcher,
  DriveAuthError,
  DriveClient,
  DriveMissingError,
  DriveOfflineError,
  DriveUnavailableError,
  MIN_BRAIN_VERSION,
  SyncEngine,
  mergePartial,
  type FileNote,
  type HttpFetch,
  type SyncReport,
  type SyncState,
} from "../engine";
import { acceptConnect, originOf, type PendingConnect } from "./connect";
import { getErrorMessage } from "@brains/utils/error";
import { DeletesModal, FilesModal, FirstSyncModal } from "./modals";
import { BUSY_MS, ObsidianVault } from "./obsidian-vault";
import { fullSyncDue } from "./schedule";
import {
  addressKey,
  keepPassword,
  loadPluginData,
  parsePluginData,
  storedPluginData,
  storesPassword,
  stateFor,
  withState,
  type RizomBrainSettings,
  type PluginData,
} from "./settings";

/** The `obsidian://` action the brain hands a new app password back to. */
const PROTOCOL_ACTION = "rizom-brain";

/** Requests through Obsidian, on desktop and mobile, without CORS. */
const obsidianFetch: HttpFetch = async (request) => {
  const body =
    request.body === undefined
      ? undefined
      : new Uint8Array(request.body).buffer;
  const response = await requestUrl({
    url: request.url,
    method: request.method,
    headers: request.headers,
    ...(body !== undefined && { body }),
    throw: false,
  });
  return {
    status: response.status,
    headers: Object.fromEntries(
      Object.entries(response.headers).map(([name, value]) => [
        name.toLowerCase(),
        value,
      ]),
    ),
    body: new Uint8Array(response.arrayBuffer),
  };
};

const STATUS_TEXT: Record<SyncReport["status"], string> = {
  synced: "Brain: synced",
  "first-sync": "Brain: waiting to start",
  offline: "Brain: offline",
  unavailable: "Brain: not answering, trying again",
  "signed-out": "Brain: sign in again",
  "no-drive": "Brain: no drive at this address",
  "old-brain": "Brain: needs a newer brain",
};

/** What a person is told when their brain is from before the sync endpoints. */
const TOO_OLD = `Your brain is older than this plugin needs. It needs version ${MIN_BRAIN_VERSION} or later; ask whoever runs your brain to update it. Nothing was changed.`;

/** The Drive section of the brain's Account page, where Connect is confirmed. */
function connectUrl(origin: string, state: string): string {
  const account = encodeURIComponent("studio:account");
  return `${origin}/studio/workspaces/${account}?section=drive&connect=obsidian&state=${encodeURIComponent(state)}`;
}

function randomState(): string {
  return [...crypto.getRandomValues(new Uint8Array(16))]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export default class RizomBrainPlugin extends Plugin {
  data: PluginData = parsePluginData({});
  private vault: ObsidianVault | undefined;
  private engine: SyncEngine | undefined;
  private statusEl: HTMLElement | undefined;
  private issues: FileNote[] = [];
  private localOnly: FileNote[] = [];
  private status: SyncReport["status"] | "not-connected" = "not-connected";
  private saveTimers = new Map<string, number>();
  private interval: number | undefined;
  /** Waits on the brain for changes, so they arrive as they happen. */
  private readonly follower = new ChangeFollower({
    watch: (_key, onChange, onReset): Watching => {
      const watcher = new ChangeWatcher({
        drive: this.drive(),
        onChange,
        onReset,
      });
      watcher.start();
      return watcher;
    },
    syncTypes: async (types): Promise<void> => {
      const engine = this.getEngine();
      if (engine) await this.run(() => engine.syncTypes(types));
    },
    fullSync: (): void => void this.syncNow(),
  });
  private lastFullSync = 0;
  private settingTab: RizomBrainSettingTab | undefined;
  /** Writes of the plugin's data file, one after another. */
  private saving: Promise<void> = Promise.resolve();
  /** The "brain is too old" notice is shown once, not at every sync. */
  private toldTooOld = false;
  /** The Connect request this vault opened, until the brain answers it. */
  private pendingConnect: PendingConnect | undefined;
  /** Every engine call runs after the one before, across engines too. */
  private queue: Promise<unknown> = Promise.resolve();
  /** Which brain and app password the engine was made for. */
  private engineFor = "";
  /** One dialog of each kind at a time. */
  private asking = { firstSync: false, deletes: false };

  override async onload(): Promise<void> {
    const stored: unknown = await this.loadData();
    this.data = loadPluginData(stored, this.app.secretStorage);
    // A password an older version left in the data file is taken out of it.
    if (storesPassword(stored))
      await this.saveData(storedPluginData(this.data));
    this.vault = new ObsidianVault(this.app);
    this.settingTab = new RizomBrainSettingTab(this.app, this);
    this.addSettingTab(this.settingTab);

    this.statusEl = this.addStatusBarItem();
    this.statusEl.addClass("rizom-brain-status");
    this.statusEl.onClickEvent(() => this.showFiles());
    this.renderStatus();

    this.addCommand({
      id: "sync-now",
      name: "Sync with your brain now",
      callback: () => void this.syncNow(),
    });
    this.addCommand({
      id: "show-unsynced-files",
      name: "Show files that are not synced",
      callback: () => this.showFiles(),
    });
    this.addCommand({
      id: "connect",
      name: "Connect to your brain",
      callback: () => this.startConnect(),
    });

    this.registerObsidianProtocolHandler(
      PROTOCOL_ACTION,
      (params) => void this.finishConnect(params),
    );

    this.app.workspace.onLayoutReady(() => {
      this.registerVaultEvents();
      this.restartInterval();
      void this.syncNow();
    });
  }

  override onunload(): void {
    for (const timer of this.saveTimers.values()) window.clearTimeout(timer);
    this.follower.stop();
  }

  /** The brain and app password the settings name; "" when not connected. */
  private watchKey(): string {
    const { address, username, password } = this.config;
    const brain = addressKey(address);
    return this.connected() && brain !== ""
      ? `${brain} ${username} ${password}`
      : "";
  }

  get config(): RizomBrainSettings {
    return this.data.settings;
  }

  /**
   * Change settings. Each brain keeps its own sync state, so editing the
   * address, even one letter and back, loses nothing.
   */
  async updateSettings(change: Partial<RizomBrainSettings>): Promise<void> {
    this.data.settings = { ...this.data.settings, ...change };
    keepPassword(this.app.secretStorage, this.data.settings.password);
    await this.saveData(storedPluginData(this.data));
    // Nothing is asked while the settings are typed: a watcher on a brain
    // they no longer name stops, and the next sync starts the right one.
    this.follower.settingsChanged(this.watchKey());
  }

  /** The settings were closed: sync with what they now say. */
  settingsClosed(): void {
    if (this.connected() && this.follower.state() === "idle") {
      void this.syncNow();
    }
  }

  /** Run an engine call after the one before, whichever engine made it. */
  private serially<T>(work: () => Promise<T>): Promise<T> {
    const run = this.queue.then(work, work);
    this.queue = run.catch(() => undefined);
    return run;
  }

  private connected(): boolean {
    const { address, username, password } = this.config;
    return address.trim() !== "" && username !== "" && password !== "";
  }

  private drive(): DriveClient {
    const { address, username, password } = this.config;
    return new DriveClient({ address, username, password }, obsidianFetch);
  }

  private getEngine(): SyncEngine | undefined {
    if (!this.connected() || !this.vault) return undefined;
    const { address, username, password } = this.config;
    const key = addressKey(address);
    if (key === "") return undefined;
    const made = `${key} ${username} ${password}`;
    if (!this.engine || this.engineFor !== made) {
      this.engineFor = made;
      this.engine = new SyncEngine({
        vault: this.vault,
        drive: this.drive(),
        // The state of the brain this engine syncs with, and no other.
        store: {
          load: async (): Promise<SyncState> => stateFor(this.data, key),
          // One write of the data file at a time: files fetched together
          // each record themselves, and the last write holds them all.
          save: (state): Promise<void> => {
            this.data = withState(this.data, key, state);
            const saved = this.saving.then(() =>
              this.saveData(storedPluginData(this.data)),
            );
            this.saving = saved.catch(() => undefined);
            return saved;
          },
        },
      });
    }
    return this.engine;
  }

  private registerVaultEvents(): void {
    const vault = this.vault;
    if (!vault) return;
    this.registerEvent(
      this.app.vault.on("modify", (file) => {
        if (!(file instanceof TFile) || vault.isOwnEvent(file.path)) return;
        vault.noteEdit(file.path);
        if (this.config.syncOnSave) this.scheduleUpload(file.path);
      }),
    );
    this.registerEvent(
      this.app.vault.on("create", (file) => {
        if (!(file instanceof TFile) || vault.isOwnEvent(file.path)) return;
        vault.noteEdit(file.path);
        if (this.config.syncOnSave) this.scheduleUpload(file.path);
      }),
    );
    this.registerEvent(
      this.app.vault.on("delete", (file) => {
        if (!(file instanceof TFile) || vault.isOwnEvent(file.path)) return;
        const engine = this.getEngine();
        if (engine) void this.serially(() => engine.noteDeleted(file.path));
      }),
    );
    this.registerEvent(
      this.app.vault.on("rename", (file, oldPath) => {
        if (!(file instanceof TFile)) return;
        if (vault.isOwnEvent(file.path) || vault.isOwnEvent(oldPath)) return;
        const engine = this.getEngine();
        if (engine) {
          void this.serially(() => engine.noteRenamed(oldPath, file.path));
        }
      }),
    );
  }

  /** Upload a saved file once the person has stopped typing in it. */
  private scheduleUpload(path: string): void {
    const previous = this.saveTimers.get(path);
    if (previous !== undefined) window.clearTimeout(previous);
    this.saveTimers.set(
      path,
      window.setTimeout(() => {
        this.saveTimers.delete(path);
        const engine = this.getEngine();
        if (engine) {
          void this.run(() => engine.syncFile(path));
        }
      }, BUSY_MS + 500),
    );
  }

  /** Every minute: compare everything again when it is due. */
  private restartInterval(): void {
    if (this.interval !== undefined) window.clearInterval(this.interval);
    this.interval = window.setInterval(() => {
      if (
        fullSyncDue(
          Date.now(),
          this.lastFullSync,
          this.config.intervalMinutes,
          this.follower.state(),
        )
      ) {
        void this.syncNow();
      }
    }, 60_000);
    this.registerInterval(this.interval);
  }

  async syncNow(): Promise<void> {
    const engine = this.getEngine();
    if (!engine) {
      this.follower.follow("");
      this.status = "not-connected";
      this.renderStatus();
      return;
    }
    this.renderStatus("Brain: syncing…");
    this.lastFullSync = Date.now();
    // Watching starts before the compare, so a change made while it runs is
    // told afterwards instead of missed.
    this.follower.follow(this.watchKey());
    await this.run(() => engine.sync());
  }

  /**
   * Run a sync step and show what it did. One that fails says so in the
   * status bar and a notice; the next sync tries again.
   */
  private async run(work: () => Promise<SyncReport>): Promise<void> {
    try {
      this.show(await this.serially(work));
    } catch (error) {
      this.renderStatus("Brain: sync failed");
      new Notice(
        `Rizom Brain could not sync: ${getErrorMessage(error)} It tries again at the next sync.`,
        10_000,
      );
    }
  }

  /** Show what a sync did, and ask what it could not decide alone. */
  private show(report: SyncReport): void {
    this.status = report.status;
    if (report.status === "synced" || report.localOnly.length > 0) {
      this.localOnly = mergePartial(
        this.localOnly,
        report.localOnly,
        report.scope,
      );
    }
    if (report.status === "synced") {
      this.issues = mergePartial(this.issues, report.issues, report.scope);
    }
    this.renderStatus();

    if (report.status === "old-brain" && !this.toldTooOld) {
      this.toldTooOld = true;
      new Notice(TOO_OLD, 0);
    }
    if (report.status === "signed-out") {
      new Notice(
        "Your brain did not accept the app password. It may have expired or been revoked: connect again in the Rizom Brain settings. Nothing was changed.",
        0,
      );
    }
    for (const notice of report.notices) {
      if (notice.kind === "conflict") {
        new Notice(
          `${notice.path} was also changed in your brain. Your brain's version is here now; yours is in ${notice.copy}${notice.inInbox ? " and in your brain's Inbox" : ""}.`,
          0,
        );
      } else {
        new Notice(
          `${notice.from} could not be renamed to ${notice.to}: ${notice.reason} It was renamed back.`,
          10_000,
        );
      }
    }
    const engine = this.getEngine();
    if (report.firstSync && engine && !this.asking.firstSync) {
      this.asking.firstSync = true;
      new FirstSyncModal(
        this.app,
        report.firstSync,
        () => {
          void this.run(() => engine.applyFirstSync());
        },
        () => {
          this.asking.firstSync = false;
        },
      ).open();
    }
    if (report.decision && engine && !this.asking.deletes) {
      this.asking.deletes = true;
      new DeletesModal(
        this.app,
        report.decision,
        (answer) => {
          void this.run(() => engine.resolveDeletes(answer));
        },
        () => {
          this.asking.deletes = false;
        },
      ).open();
    }
  }

  private renderStatus(override?: string): void {
    if (!this.statusEl) return;
    const attention = this.issues.length;
    const text =
      override ??
      (this.status === "not-connected"
        ? "Brain: not connected"
        : this.status === "synced" && attention > 0
          ? `Brain: ${attention} file${attention === 1 ? "" : "s"} need attention`
          : STATUS_TEXT[this.status]);
    this.statusEl.setText(text);
    this.statusEl.setAttr(
      "aria-label",
      "Show files that are not synced with your brain",
    );
  }

  showFiles(): void {
    new FilesModal(this.app, this.issues, this.localOnly).open();
  }

  /** Check the address and app password; say plainly what is wrong. */
  async checkConnection(): Promise<string> {
    if (!this.connected())
      return "Enter your brain's address and an app password first.";
    try {
      const drive = this.drive();
      const { writable } = await drive.check();
      if (!(await drive.supportsSync())) return TOO_OLD;
      return writable
        ? "Connected. This app password can read and save."
        : "Connected, but this app password can only read. Create one that may save changes in your brain's Drive settings.";
    } catch (error) {
      if (error instanceof DriveAuthError) {
        return "Your brain did not accept this username and password.";
      }
      if (error instanceof DriveMissingError) {
        return "There is no drive at this address. Check the address, and that the drive is turned on for this brain.";
      }
      if (error instanceof DriveOfflineError) {
        return "Your brain cannot be reached. Check the address and your connection.";
      }
      if (error instanceof DriveUnavailableError) {
        return "Your brain is not answering for now. Try again in a minute.";
      }
      throw error;
    }
  }

  /** Open the brain in the browser, where the person confirms the connection. */
  startConnect(): void {
    const origin = originOf(this.config.address);
    if (origin === undefined) {
      new Notice(
        "Enter your brain's address in the Rizom Brain settings first.",
      );
      return;
    }
    const state = randomState();
    this.pendingConnect = { state, origin };
    window.open(connectUrl(origin, state));
    // Before the first Connect there is no password to ask the brain with,
    // so an older brain cannot be told from here: say what to look for.
    new Notice(
      `Your brain's Drive page is opening in the browser. Choose Connect Obsidian there. If the page shows no such card, your brain is older than version ${MIN_BRAIN_VERSION}, which this plugin needs.`,
      15_000,
    );
  }

  /** The brain handed back a new app password for the Connect this vault opened. */
  private async finishConnect(params: ObsidianProtocolData): Promise<void> {
    const accepted = acceptConnect(
      this.pendingConnect,
      params,
      this.config.address,
    );
    if (!accepted) {
      new Notice(
        "This connection link does not answer a Connect from this vault for this brain, so it was ignored.",
      );
      return;
    }
    this.pendingConnect = undefined;
    await this.updateSettings(accepted);
    // The settings are usually open during Connect: show what was saved.
    this.settingTab?.display();
    new Notice("Connected to your brain.");
    await this.syncNow();
  }
}

class RizomBrainSettingTab extends PluginSettingTab {
  private readonly plugin: RizomBrainPlugin;

  constructor(app: App, plugin: RizomBrainPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  override hide(): void {
    this.plugin.settingsClosed();
  }

  override display(): void {
    const { containerEl, plugin } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName("Brain address")
      .setDesc("The address of your brain, for example yourname.rizom.ai.")
      .addText((text) =>
        text
          .setPlaceholder("yourname.rizom.ai")
          .setValue(plugin.config.address)
          .onChange((value) => void plugin.updateSettings({ address: value })),
      );

    new Setting(containerEl)
      .setName("Connect")
      .setDesc(
        "Opens your brain in the browser. Confirm there, and this vault gets its own app password.",
      )
      .addButton((button) =>
        button
          .setButtonText("Connect")
          .setCta()
          .onClick(() => plugin.startConnect()),
      );

    new Setting(containerEl)
      .setName("App password")
      .setDesc(
        "Filled in by Connect. You can also create an app password that may save changes in your brain's Drive settings and enter it here.",
      )
      .addText((text) =>
        text
          .setPlaceholder("Username")
          .setValue(plugin.config.username)
          .onChange(
            (value) => void plugin.updateSettings({ username: value.trim() }),
          ),
      )
      .addText((text) => {
        text.inputEl.type = "password";
        text
          .setPlaceholder("Password")
          .setValue(plugin.config.password)
          .onChange(
            (value) => void plugin.updateSettings({ password: value.trim() }),
          );
      });

    const check = new Setting(containerEl)
      .setName("Check the connection")
      .addButton((button) =>
        button.setButtonText("Check").onClick(async () => {
          check.setDesc("Checking…");
          check.setDesc(await plugin.checkConnection());
        }),
      );

    new Setting(containerEl)
      .setName("Sync after saving")
      .setDesc("Send a note to your brain a few seconds after you stop typing.")
      .addToggle((toggle) =>
        toggle
          .setValue(plugin.config.syncOnSave)
          .onChange(
            (value) => void plugin.updateSettings({ syncOnSave: value }),
          ),
      );

    new Setting(containerEl)
      .setName("Compare everything every")
      .setDesc(
        "Changes in your brain arrive as they happen. This full comparison catches anything missed, and runs every five minutes at most while your brain cannot be asked for changes.",
      )
      .addDropdown((dropdown) =>
        dropdown
          .addOptions({
            "5": "5 minutes",
            "15": "15 minutes",
            "30": "30 minutes",
            "60": "hour",
          })
          .setValue(String(plugin.config.intervalMinutes))
          .onChange(
            (value) =>
              void plugin.updateSettings({ intervalMinutes: Number(value) }),
          ),
      );

    new Setting(containerEl)
      .setName("Templates, dropdowns and tables")
      .setDesc(
        "The brain's templates, field definitions and table views are in _obsidian/. Templates work from Obsidian's Templates; tables open as Bases. For dropdowns on fields like status, install the Metadata Menu plugin and set its class files path to _obsidian/fileClasses.",
      );

    new Setting(containerEl)
      .setName("Pasted images")
      .setDesc(
        "Your brain keeps images in the image folder. To have pasted images go there, set Files and links → Default location for new attachments to “In the folder specified below” and enter image.",
      );

    new Setting(containerEl)
      .setName("Sync now")
      .addButton((button) =>
        button.setButtonText("Sync now").onClick(() => void plugin.syncNow()),
      )
      .addButton((button) =>
        button
          .setButtonText("Files that are not synced")
          .onClick(() => plugin.showFiles()),
      );
  }
}
