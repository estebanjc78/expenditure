import { execFile } from "node:child_process";

/** Opens a URL in the user's default browser (no shell involved); resolves to whether the command succeeded. */
export function openInBrowser(url: string): Promise<boolean> {
  // Headless machines and automated checks can opt out; the tool then returns the URL instead.
  if (process.env.GASTOS_NO_BROWSER === "1") return Promise.resolve(false);
  const [cmd, args]: [string, string[]] =
    process.platform === "darwin" ? ["open", [url]]
    : process.platform === "win32" ? ["rundll32", ["url.dll,FileProtocolHandler", url]]
    : ["xdg-open", [url]];
  return new Promise((resolve) => execFile(cmd, args, (err) => resolve(!err)));
}
