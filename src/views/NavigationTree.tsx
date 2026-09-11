import { FileTree, useFileTree } from "@pierre/trees/react";
import { useEffect, useRef } from "react";
import type { Snapshot } from "../models/contracts";
import type { ReaderState } from "../viewmodels/reader";

export function NavigationTree({
  snapshot,
  selected,
  changes,
  onSelect,
}: {
  snapshot: Snapshot;
  selected: string | undefined;
  changes: ReaderState["changes"];
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
    itemHeight: 32,
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
      const parts = file.path.split("/");
      for (let depth = 1; depth < parts.length; depth++)
        directories.add(parts.slice(0, depth).join("/"));
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
    if (!selected) return;
    const parts = selected.split("/");
    for (let depth = 1; depth < parts.length; depth++) {
      const parent = model.getItem(parts.slice(0, depth).join("/"));
      if (parent && "expand" in parent) parent.expand();
    }
    if (!model.getSelectedPaths().includes(selected)) {
      for (const path of model.getSelectedPaths()) model.getItem(path)?.deselect();
      model.getItem(selected)?.select();
    }
    model.scrollToPath(selected, { focus: false, offset: "nearest" });
  }, [model, selected]);
  return <FileTree model={model} className="vault-tree" aria-label="知识库文件目录" />;
}
