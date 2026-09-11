import type { Connection } from "./contracts";

export function connectionPresentation(
  connection: Connection | null,
  now = Date.now(),
): { tone: "quiet" | "good" | "warning"; label: string; detail: string } {
  if (!connection || connection.status === "unknown")
    return { tone: "quiet", label: "等待连接", detail: "打开知识库后，会自动检查 GitHub 连接。" };
  if (connection.status === "invalid")
    return {
      tone: "warning",
      label: "连接需要更新",
      detail:
        "GitHub 凭据已失效。在服务端更新 PAT 后，点击重新检查即可继续。已打开的文章不受影响。",
    };
  if (connection.status === "limited")
    return {
      tone: "quiet",
      label: "稍后继续检查",
      detail: "GitHub 暂时限制了请求频率。阅读器会遵守等待时间，避免重复请求。",
    };
  if (connection.status === "offline")
    return {
      tone: "quiet",
      label: "连接暂不可用",
      detail: "暂时无法连接 GitHub，当前文章仍可阅读。网络恢复后会继续检查。",
    };
  if (connection.expiresAt) {
    const remaining = Math.ceil((Date.parse(connection.expiresAt) - now) / 86_400_000);
    if (remaining <= 0)
      return {
        tone: "warning",
        label: "请确认凭据有效期",
        detail: "记录的到期时间已到。请确认 PAT 已轮换，并更新服务端的有效期设置。",
      };
    if (remaining <= 7)
      return {
        tone: "warning",
        label: `${remaining} 天后需要轮换`,
        detail: `GitHub 凭据将在 ${remaining} 天后到期。找一个方便的时候更新即可，阅读可以继续。`,
      };
  }
  return {
    tone: "good",
    label: "GitHub 已连接",
    detail: connection.expiresAt
      ? "只读连接正常。临近到期时，会在这里轻轻提醒你。"
      : "只读连接正常。GitHub 未提供有效期，请在服务端记录到期日以获得轮换提醒。",
  };
}
