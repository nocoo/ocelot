import type {
  AuthorProfile,
  Connection,
  DocumentContent,
  RecentNote,
  Repository,
  Scenario,
  Session,
  Snapshot,
} from "../models/contracts";
import { embedExcerpt, type ParsedDocument, parseDocument } from "../models/document";
import { resolveLink, routeUrl } from "../models/links";
import { isHomeDocument } from "../models/recent";
import {
  attachmentType,
  changedFiles,
  contentUrl,
  fileTitle,
  initialDocument,
  isMarkdown,
  searchFiles,
} from "../models/vault";
import { type ApiClient, ApiError } from "../services/api";
import type { BrowserServices } from "../services/browser";

export interface EmbedPreview {
  title: string;
  text: string;
  href: string;
  loading: boolean;
  unavailable: boolean;
}
export interface Reading extends DocumentContent {
  parsed: ParsedDocument;
  assetType: string | null;
  assetUrl: string | null;
  embeds: Record<string, EmbedPreview>;
}
export type DialogName =
  | "search"
  | "repositories"
  | "connection"
  | "preferences"
  | "local"
  | "recent"
  | null;

export interface LightboxImage {
  src: string;
  alt: string;
  zoomed: boolean;
  failed: boolean;
}

export interface ReaderState {
  session: Session | null;
  profile: AuthorProfile | null;
  repositories: Repository[];
  snapshot: Snapshot | null;
  reading: Reading | null;
  pending: Snapshot | null;
  recent: { items: RecentNote[]; loading: boolean; error: string | null } | null;
  changes: Record<string, "added" | "modified" | "deleted">;
  booting: boolean;
  loading: boolean;
  pendingPath: string | null;
  checking: boolean;
  checkingConnection: boolean;
  adding: boolean;
  removing: number | null;
  error: { code: string; message: string } | null;
  notice: string;
  dialog: DialogName;
  query: string;
  repositoryInput: string;
  fontScale: number;
  fullWidth: boolean;
  raw: boolean;
  outlineOpen: boolean;
  lightbox: LightboxImage | null;
  directoryFocus: { path: string } | null;
  navigation: { version: number; anchor: string; preserve: boolean; smooth?: boolean };
  local: { scenario: Scenario; requests: Record<string, number>; repositories: string[] } | null;
}

export class ReaderViewModel {
  private state: ReaderState;
  private listeners = new Set<() => void>();
  private epoch = 0;
  private controller: AbortController | null = null;
  private profileController: AbortController | null = null;
  private recentController: AbortController | null = null;
  private retryAt = 0;
  private checkSerial = 0;

  constructor(
    private api: ApiClient,
    private browser: BrowserServices,
  ) {
    this.state = {
      session: null,
      profile: null,
      repositories: [],
      snapshot: null,
      reading: null,
      pending: null,
      recent: null,
      changes: {},
      booting: true,
      loading: false,
      pendingPath: null,
      checking: false,
      checkingConnection: false,
      adding: false,
      removing: null,
      error: null,
      notice: "",
      dialog: null,
      query: "",
      repositoryInput: "",
      fontScale: browser.readScale(),
      fullWidth: browser.readFullWidth(),
      raw: false,
      outlineOpen: false,
      lightbox: null,
      directoryFocus: null,
      navigation: { version: 0, anchor: "", preserve: false },
      local: null,
    };
  }

  getSnapshot = (): ReaderState => this.state;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  private set(patch: Partial<ReaderState>): void {
    if (
      patch.snapshot !== undefined &&
      (patch.snapshot?.repository.id !== this.state.snapshot?.repository.id ||
        patch.snapshot?.commitSha !== this.state.snapshot?.commitSha)
    ) {
      this.recentController?.abort();
      const cached =
        patch.snapshot &&
        this.api.cachedRecent(patch.snapshot.repository.id, patch.snapshot.commitSha);
      patch.recent = cached ? { items: cached, loading: false, error: null } : null;
    }
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
    if (patch.snapshot) void this.loadRecent();
  }

  mount(): () => void {
    void this.start();
    const unsubscribe = this.browser.listen(
      () => {
        void this.followLocation();
      },
      () => {
        void this.check();
      },
      () => this.openDialog("search"),
    );
    const interval = setInterval(() => {
      if (this.browser.visible()) void this.check();
    }, 60_000);
    return () => {
      clearInterval(interval);
      unsubscribe();
      this.epoch++;
      this.controller?.abort();
      this.profileController?.abort();
      this.recentController?.abort();
      this.api.clearRecent();
      this.set({ recent: null });
    };
  }

  async start(): Promise<void> {
    const ticket = ++this.epoch;
    this.profileController?.abort();
    this.set({ booting: true, error: null, profile: null });
    try {
      const [session, repositories] = await Promise.all([
        this.api.session(),
        this.api.repositories(),
      ]);
      if (ticket !== this.epoch) return;
      this.set({ session, repositories, booting: false });
      if (!session.local) void this.loadProfile();
      await this.followLocation(true);
    } catch (error) {
      if (ticket === this.epoch) {
        this.report(error);
        this.set({ booting: false });
      }
    }
  }

  private async loadProfile(): Promise<void> {
    const controller = new AbortController();
    this.profileController = controller;
    try {
      const profile = await this.api.profile(controller.signal);
      if (!controller.signal.aborted) this.set({ profile });
    } catch {
      // Author details are optional; a failed photo service must not interrupt reading.
    }
  }

  identity() {
    const { session, profile } = this.state;
    const local = !session || session.local;
    const name = local ? "我的私人阅读室" : (profile?.name ?? session.email);
    return {
      name,
      subtitle: local ? "安静，只读，自由探索" : session.email,
      avatar: local ? undefined : (profile?.avatar ?? undefined),
      initial: name.slice(0, 1).toUpperCase(),
      local,
    };
  }

  async followLocation(replace = false): Promise<void> {
    const route = this.browser.route();
    const id =
      this.state.repositories.find((repository) => repository.id === route.repository)?.id ??
      this.state.repositories[0]?.id;
    if (!id) return;
    if (id === this.state.snapshot?.repository.id && route.path)
      await this.selectNote(route.path, route.anchor, true);
    else await this.selectRepository(id, route.path, route.anchor, replace);
  }

  async selectRepository(
    id: number,
    path: string | null = null,
    anchor = "",
    replace = false,
  ): Promise<void> {
    this.controller?.abort();
    const ticket = ++this.epoch;
    this.set({
      loading: true,
      error: null,
      pendingPath: null,
      dialog: null,
      checking: false,
      directoryFocus: null,
      outlineOpen: false,
      lightbox: null,
    });
    try {
      const snapshot = await this.api.sync(id);
      if (ticket !== this.epoch) return;
      const target =
        path && snapshot.files.some((file) => file.path === path)
          ? path
          : initialDocument(snapshot.files);
      if (target) await this.load(snapshot, target, anchor, replace, ticket, false, {});
      else
        this.set({
          snapshot,
          reading: null,
          pending: null,
          loading: false,
          changes: {},
          raw: false,
        });
    } catch (error) {
      if (ticket === this.epoch) {
        this.report(error);
        this.set({ loading: false });
      }
    }
    await this.refreshConnection();
  }

  async selectNote(path: string, anchor = "", replace = false): Promise<void> {
    const snapshot = this.state.snapshot;
    if (!snapshot) return;
    this.set({
      dialog: null,
      error: null,
      notice: "",
      directoryFocus: null,
      outlineOpen: false,
      lightbox: null,
    });
    if (this.state.reading?.path === path && !this.state.loading) {
      this.browser.navigate(routeUrl(snapshot.repository.id, path, anchor), replace);
      this.set({
        raw: anchor ? false : this.state.raw,
        navigation: { version: this.state.navigation.version + 1, anchor, preserve: !anchor },
      });
      void this.loadRecent();
      return;
    }
    this.controller?.abort();
    const ticket = ++this.epoch;
    await this.load(snapshot, path, anchor, replace, ticket, false, this.state.changes);
  }

  private async load(
    snapshot: Snapshot,
    path: string,
    anchor: string,
    replace: boolean,
    ticket: number,
    preserve: boolean,
    changes: ReaderState["changes"],
  ): Promise<void> {
    this.controller = new AbortController();
    this.set({ loading: true, pendingPath: path, error: null });
    try {
      const file = snapshot.files.find((entry) => entry.path === path);
      if (!file)
        throw new ApiError("file_missing", "当前版本中找不到这份笔记，请在目录中选择另一篇。");
      const markdown = isMarkdown(path);
      const assetType = markdown ? null : attachmentType(path);
      if (!markdown && !assetType)
        throw new ApiError("file_unsupported", "阅读器暂不支持这个附件格式。");
      const raw = markdown
        ? await this.api.document(
            snapshot.repository.id,
            snapshot.treeSha,
            path,
            this.controller.signal,
          )
        : { path, sha: file.sha, treeSha: snapshot.treeSha, content: "" };
      if (ticket !== this.epoch) return;
      const reading: Reading = {
        ...raw,
        parsed: parseDocument(raw.content, path),
        assetType,
        assetUrl: assetType
          ? contentUrl(snapshot.repository.id, snapshot.treeSha, path, true)
          : null,
        embeds: {},
      };
      const sameRepo = this.state.snapshot?.repository.id === snapshot.repository.id;
      this.set({
        snapshot,
        reading,
        loading: false,
        pendingPath: null,
        pending:
          sameRepo && this.state.pending?.treeSha !== snapshot.treeSha ? this.state.pending : null,
        changes,
        notice: "",
        directoryFocus: null,
        raw: preserve ? this.state.raw : false,
        outlineOpen: false,
        lightbox: null,
        navigation: { version: this.state.navigation.version + 1, anchor, preserve },
      });
      this.browser.navigate(routeUrl(snapshot.repository.id, path, anchor), replace);
      await this.loadEmbeds(reading, snapshot, ticket);
    } catch (error) {
      if (ticket === this.epoch) {
        this.report(error);
        this.set({ loading: false, pendingPath: null });
      }
    }
    await this.refreshConnection();
  }

  private async loadEmbeds(reading: Reading, snapshot: Snapshot, ticket: number): Promise<void> {
    const targets = reading.parsed.embeds
      .map((target) => ({ target, link: resolveLink(target, reading.path, snapshot.files, true) }))
      .filter(({ link }) => link.kind === "note");
    if (!targets.length) return;
    const previews: Record<string, EmbedPreview> = {};
    for (const { target, link } of targets)
      previews[target] = {
        title: fileTitle(link.path),
        text: "",
        href: routeUrl(snapshot.repository.id, link.path, link.anchor),
        loading: true,
        unavailable: false,
      };
    this.set({ reading: { ...reading, embeds: { ...previews } } });
    await Promise.all(
      targets.map(async ({ target, link }) => {
        try {
          const content =
            link.path === reading.path
              ? reading
              : await this.api.document(
                  snapshot.repository.id,
                  snapshot.treeSha,
                  link.path,
                  this.controller?.signal,
                );
          previews[target] = {
            ...previews[target],
            ...embedExcerpt(content.content, link.path, link.anchor),
            loading: false,
          };
        } catch {
          previews[target] = { ...previews[target], loading: false, unavailable: true };
        }
        if (ticket === this.epoch) this.set({ reading: { ...reading, embeds: { ...previews } } });
      }),
    );
  }

  async check(force = false): Promise<void> {
    const snapshot = this.state.snapshot;
    if (!snapshot || this.state.checking || this.state.loading || Date.now() < this.retryAt) return;
    const ticket = this.epoch;
    const checkSerial = ++this.checkSerial;
    this.set({ checking: true });
    try {
      const next = await this.api.sync(
        snapshot.repository.id,
        force,
        snapshot.treeSha,
        snapshot.commitSha,
      );
      if (ticket !== this.epoch) return;
      if ("treeSha" in next && next.treeSha !== snapshot.treeSha) {
        this.set({ pending: next, error: null });
        void this.api.recentNotes(next.repository.id, next.commitSha).catch(() => {
          // Applying this snapshot can retry; background preparation must not interrupt reading.
        });
      } else {
        this.set({
          snapshot: {
            ...snapshot,
            repository: next.repository,
            commitSha: next.repository.commitSha ?? snapshot.commitSha,
          },
          pending: null,
          notice: force ? "已经是最新版本" : this.state.notice,
          error: null,
        });
      }
    } catch (error) {
      if (ticket === this.epoch) this.report(error);
    } finally {
      if (checkSerial === this.checkSerial) this.set({ checking: false });
      await this.refreshConnection();
    }
  }

  async applyUpdate(): Promise<void> {
    const pending = this.state.pending;
    const current = this.state.snapshot;
    if (!pending || !current || this.state.loading) return;
    const path = this.state.reading?.path;
    const target =
      path && pending.files.some((file) => file.path === path)
        ? path
        : initialDocument(pending.files);
    if (!target) {
      this.set({
        snapshot: pending,
        pending: null,
        reading: null,
        raw: false,
        outlineOpen: false,
        lightbox: null,
      });
      return;
    }
    this.controller?.abort();
    await this.load(
      pending,
      target,
      "",
      true,
      ++this.epoch,
      target === path,
      changedFiles(current.files, pending.files),
    );
  }

  async recheckConnection(): Promise<void> {
    if (this.state.checkingConnection || Date.now() < this.retryAt) return;
    this.set({ checkingConnection: true, error: null });
    try {
      const connection = await this.api.checkConnection();
      this.updateConnection(connection);
      await this.check(true);
    } catch (error) {
      this.report(error);
      await this.refreshConnection();
    } finally {
      this.set({ checkingConnection: false });
    }
  }

  private updateConnection(connection: Connection): void {
    this.retryAt = connection.retryAt;
    if (this.state.session) this.set({ session: { ...this.state.session, connection } });
  }

  private async refreshConnection(): Promise<void> {
    try {
      const session = await this.api.session();
      this.updateConnection(session.connection);
    } catch {
      /* Preserve the original request's actionable error. */
    }
  }

  private report(error: unknown): void {
    if (error instanceof Error && error.name === "AbortError") return;
    const known =
      error instanceof ApiError ? error : new ApiError("request", "暂时无法完成请求，请稍后重试。");
    if (known.retryAt) this.retryAt = known.retryAt;
    this.set({ error: { code: known.code, message: known.message } });
  }

  openDialog(dialog: DialogName): void {
    this.set({ dialog, query: "", error: null, outlineOpen: false, lightbox: null });
    if (dialog === "local") void this.loadLocal();
    if (dialog === "recent") void this.loadRecent();
  }
  isHome(): boolean {
    return !!this.state.reading && isHomeDocument(this.state.reading.path);
  }

  async loadRecent(): Promise<void> {
    const snapshot = this.state.snapshot;
    if (!snapshot || (this.state.recent && !this.state.recent.error)) return;
    this.recentController?.abort();
    const controller = new AbortController();
    this.recentController = controller;
    this.set({ recent: { items: [], loading: true, error: null } });
    try {
      const items = await this.api.recentNotes(snapshot.repository.id, snapshot.commitSha);
      if (!controller.signal.aborted) this.set({ recent: { items, loading: false, error: null } });
    } catch (error) {
      if (!controller.signal.aborted)
        this.set({
          recent: {
            items: [],
            loading: false,
            error: error instanceof ApiError ? error.message : "暂时无法载入最近更新，请重试。",
          },
        });
    }
  }
  revealDirectory(path: string): void {
    const snapshot = this.state.snapshot;
    if (!snapshot || (path && !snapshot.files.some((file) => file.path.startsWith(`${path}/`))))
      return;
    this.set({ directoryFocus: { path } });
  }
  dismissError(): void {
    this.set({ error: null });
  }
  setQuery(query: string): void {
    this.set({ query });
  }
  searchResults() {
    return searchFiles(this.state.snapshot?.files ?? [], this.state.query);
  }
  setRepositoryInput(repositoryInput: string): void {
    this.set({ repositoryInput });
  }

  async addRepository(input = this.state.repositoryInput): Promise<void> {
    if (this.state.adding) return;
    const ticket = this.epoch;
    this.set({ adding: true, error: null });
    try {
      const snapshot = await this.api.add(input);
      const repositories = await this.api.repositories();
      if (ticket !== this.epoch) {
        this.set({ repositories });
        return;
      }
      this.set({ repositories, repositoryInput: "", dialog: null });
      const path = initialDocument(snapshot.files);
      this.controller?.abort();
      const navigation = ++this.epoch;
      if (path) await this.load(snapshot, path, "", false, navigation, false, {});
      else
        this.set({
          snapshot,
          reading: null,
          pending: null,
          loading: false,
          pendingPath: null,
          changes: {},
          directoryFocus: null,
          raw: false,
          outlineOpen: false,
          lightbox: null,
        });
    } catch (error) {
      if (ticket === this.epoch) this.report(error);
      await this.refreshConnection();
    } finally {
      this.set({ adding: false });
    }
  }

  async removeRepository(id: number): Promise<void> {
    if (this.state.removing !== null) return;
    this.set({ removing: id, error: null });
    try {
      await this.api.remove(id);
      this.api.clearRecent(id);
      const repositories = this.state.repositories.filter((repository) => repository.id !== id);
      this.set({ repositories });
      if (this.state.snapshot?.repository.id === id) {
        this.controller?.abort();
        this.epoch++;
        this.set({
          snapshot: null,
          reading: null,
          pending: null,
          changes: {},
          loading: false,
          directoryFocus: null,
          raw: false,
          outlineOpen: false,
          lightbox: null,
        });
        const first = repositories[0];
        if (first) await this.selectRepository(first.id);
        else this.browser.navigate("/", true);
      }
    } catch (error) {
      this.report(error);
    } finally {
      this.set({ removing: null });
    }
  }

  setFontScale(scale: number): void {
    if (!Number.isFinite(scale)) return;
    const fontScale = Math.min(1.3, Math.max(0.9, scale));
    this.browser.writeScale(fontScale);
    this.set({ fontScale });
  }

  setFullWidth(fullWidth: boolean): void {
    this.browser.writeFullWidth(fullWidth);
    this.set({ fullWidth });
  }

  setRaw(raw: boolean): void {
    if (!this.state.reading || this.state.reading.assetType) return;
    this.set({
      raw,
      outlineOpen: false,
      lightbox: null,
      navigation: { version: this.state.navigation.version + 1, anchor: "", preserve: false },
    });
  }

  setOutlineOpen(outlineOpen: boolean): void {
    this.set({ outlineOpen: outlineOpen && !this.state.raw });
  }

  jumpToHeading(anchor: string): void {
    if (!this.state.reading?.parsed.headings.some((heading) => heading.id === anchor)) return;
    this.set({
      raw: false,
      outlineOpen: false,
      navigation: {
        version: this.state.navigation.version + 1,
        anchor,
        preserve: false,
        smooth: true,
      },
    });
  }

  scrollToTop(): void {
    this.set({
      outlineOpen: false,
      navigation: {
        version: this.state.navigation.version + 1,
        anchor: "",
        preserve: false,
        smooth: true,
      },
    });
  }

  openImage(src: string, alt: string): void {
    if (!this.state.reading || this.state.raw) return;
    this.set({ lightbox: { src, alt, zoomed: false, failed: false }, outlineOpen: false });
  }

  closeImage(): void {
    this.set({ lightbox: null });
  }

  toggleImageZoom(): void {
    const lightbox = this.state.lightbox;
    if (lightbox) this.set({ lightbox: { ...lightbox, zoomed: !lightbox.zoomed } });
  }

  imageFailed(): void {
    if (this.state.lightbox) this.set({ lightbox: { ...this.state.lightbox, failed: true } });
  }

  githubDocumentUrl(): string | null {
    const { snapshot, reading } = this.state;
    if (!snapshot || !reading || reading.assetType) return null;
    const segments = [
      snapshot.repository.owner,
      snapshot.repository.name,
      "blob",
      snapshot.commitSha,
      ...reading.path.split("/"),
    ];
    return `https://github.com/${segments.map(encodeURIComponent).join("/")}`;
  }

  private async loadLocal(): Promise<void> {
    if (!this.state.session?.local) return;
    try {
      this.set({ local: await this.api.local() });
    } catch (error) {
      this.report(error);
    }
  }

  async setScenario(scenario: Scenario): Promise<void> {
    if (!this.state.session?.local) return;
    try {
      this.set({ local: await this.api.local(scenario) });
      this.retryAt = 0;
      await this.recheckConnection();
    } catch (error) {
      this.report(error);
    }
  }
}
