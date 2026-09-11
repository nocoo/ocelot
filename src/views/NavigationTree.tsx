import { FileTree, useFileTree } from "@pierre/trees/react";
import { useEffect, useRef } from "react";
import type { Snapshot } from "../models/contracts";
import { ancestorDirectories } from "../models/vault";
import type { ReaderState } from "../viewmodels/reader";

export function NavigationTree({
  snapshot,
  selected,
  changes,
  visible,
  reveal,
  onSelect,
}: {
  snapshot: Snapshot;
  selected: string | undefined;
  changes: ReaderState["changes"];
  visible: boolean;
  reveal: ReaderState["directoryFocus"];
  onSelect: (path: string) => void;
}) {
  const current = useRef({ onSelect, selected, files: snapshot.files });
  const previousFiles = useRef(snapshot.files);
  current.current = { onSelect, selected, files: snapshot.files };
  const { model } = useFileTree({
    paths: snapshot.files.map((file) => file.path),
    initialExpansion: "closed",
    initialSelectedPaths: selected ? [selected] : [],
    flattenEmptyDirectories: false,
    dragAndDrop: false,
    renaming: false,
    itemHeight: 36,
    // Keep each virtual slot 36px tall: a 32px target with 2px of space above and below.
    unsafeCSS: `
      [data-type="item"] {
        height: calc(var(--trees-row-height) - 4px);
        min-height: calc(var(--trees-row-height) - 4px) !important;
        flex-basis: calc(var(--trees-row-height) - 4px);
        line-height: calc(var(--trees-row-height) - 4px);
        margin-block: 2px;
        border-radius: var(--trees-border-radius);
      }
    `,
    search: false,
    onSelectionChange: (paths) => {
      const path = paths.at(-1);
      if (
        path &&
        path !== current.current.selected &&
        current.current.files.some((file) => file.path === path)
      )
        current.current.onSelect(path);
    },
  });
  useEffect(() => {
    if (previousFiles.current === snapshot.files) return;
    const directories = new Set<string>();
    for (const file of previousFiles.current) {
      for (const directory of ancestorDirectories(file.path)) directories.add(directory.path);
    }
    const expanded = [...directories].filter((path) => {
      const item = model.getItem(path);
      return item && "isExpanded" in item && item.isExpanded();
    });
    model.resetPaths(
      snapshot.files.map((file) => file.path),
      { initialExpandedPaths: expanded },
    );
    previousFiles.current = snapshot.files;
  }, [model, snapshot.files]);
  useEffect(() => {
    model.setGitStatus(Object.entries(changes).map(([path, status]) => ({ path, status })));
  }, [model, changes]);
  useEffect(() => {
    if (!selected || !visible) return;
    for (const directory of ancestorDirectories(selected)) {
      const parent = model.getItem(directory.path);
      if (parent && "expand" in parent) parent.expand();
    }
    if (!model.getSelectedPaths().includes(selected)) {
      for (const path of model.getSelectedPaths()) model.getItem(path)?.deselect();
      model.getItem(selected)?.select();
    }
    model.scrollToPath(selected, { focus: false, offset: "nearest" });
  }, [model, selected, visible]);
  useEffect(() => {
    if (!reveal || !visible) return;
    const frame = requestAnimationFrame(() => {
      // Pierre changes its focused row without taking focus from an external control.
      model
        .getFileTreeContainer()
        ?.shadowRoot?.querySelector<HTMLElement>('[role="tree"]')
        ?.focus({ preventScroll: true });
      if (!reveal.path) {
        model.focusFirstItem();
        return;
      }
      for (const directory of [...ancestorDirectories(reveal.path), reveal]) {
        const item = model.getItem(directory.path);
        if (item && "expand" in item) item.expand();
      }
      model.scrollToPath(reveal.path, { focus: true, offset: "nearest" });
    });
    return () => cancelAnimationFrame(frame);
  }, [model, reveal, visible]);
  return <FileTree model={model} className="vault-tree" aria-label="知识库文件目录" />;
}
