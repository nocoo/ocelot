import { Breadcrumbs } from "@nocoo/basalt/components/breadcrumbs";
import { Button } from "@nocoo/basalt/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@nocoo/basalt/components/dropdown-menu";
import { BookOpen, Ellipsis, Folder } from "lucide-react";
import { useRef } from "react";
import type { Snapshot } from "../models/contracts";
import { ancestorDirectories, fileTitle } from "../models/vault";

export function ReaderBreadcrumbs({
  snapshot,
  path,
  compact,
  onReveal,
}: {
  snapshot: Snapshot | null;
  path: string | undefined;
  compact: boolean;
  onReveal: (path: string) => void;
}) {
  const pendingReveal = useRef<string | null>(null);
  const menuTrigger = useRef<HTMLButtonElement>(null);
  const current = {
    label: (
      <span className="breadcrumb-current" title={path}>
        {path ? fileTitle(path) : "阅读空间"}
      </span>
    ),
  };
  if (!snapshot) return <Breadcrumbs className="reader-breadcrumbs" items={[current]} />;
  const ancestors = [
    { path: "", label: snapshot.repository.name },
    ...ancestorDirectories(path ?? ""),
  ];
  const directory = (item: (typeof ancestors)[number]) => ({
    label: (
      <Button
        variant="ghost"
        className="breadcrumb-button"
        aria-label={`在目录中定位 ${item.label}`}
        title={item.path || snapshot.repository.name}
        onClick={() => onReveal(item.path)}
      >
        <span>{item.label}</span>
      </Button>
    ),
  });
  const overflow = {
    label: (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            ref={menuTrigger}
            variant="ghost"
            size="icon"
            className="breadcrumb-overflow"
            aria-label="浏览完整路径"
            title="浏览完整路径"
          >
            <Ellipsis size={16} aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          className="breadcrumb-menu"
          aria-label="完整路径"
          align="start"
          collisionPadding={12}
          onCloseAutoFocus={(event) => {
            if (pendingReveal.current === null) return;
            event.preventDefault();
            // The sidebar drawer remembers this control for its own Escape/focus restoration.
            menuTrigger.current?.focus({ preventScroll: true });
            onReveal(pendingReveal.current);
            pendingReveal.current = null;
          }}
        >
          <p className="breadcrumb-menu-caption">在目录中定位</p>
          {ancestors.map((item) => (
            <DropdownMenuItem
              key={item.path}
              className="breadcrumb-menu-item"
              textValue={item.label}
              onSelect={() => {
                pendingReveal.current = item.path;
              }}
            >
              {item.path ? <Folder size={15} /> : <BookOpen size={15} />}
              <span>{item.path || item.label}</span>
            </DropdownMenuItem>
          ))}
          <p className="breadcrumb-menu-current">{path ?? "阅读空间"}</p>
        </DropdownMenuContent>
      </DropdownMenu>
    ),
  };
  const items = compact
    ? [overflow]
    : ancestors.length > 3
      ? [directory(ancestors[0]), overflow, directory(ancestors[ancestors.length - 1])]
      : ancestors.map(directory);
  return <Breadcrumbs className="reader-breadcrumbs" items={[...items, current]} />;
}
