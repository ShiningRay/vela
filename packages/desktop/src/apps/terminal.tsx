import { createSignal } from "solid-js";
import { Button, Input, Label, Row, Stack } from "@vela/ui";
import { useDesktop } from "../context";

function resolvePath(cwd: string, argument: string): string {
  const source = argument.startsWith("/") ? argument : `${cwd}/${argument}`;
  const parts: string[] = [];
  for (const segment of source.split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") parts.pop();
    else parts.push(segment);
  }
  return `/${parts.join("/")}`;
}

export function TerminalApp() {
  const { vfs } = useDesktop();
  const [cwd, setCwd] = createSignal("/Documents");
  const [draft, setDraft] = createSignal("");
  const [lines, setLines] = createSignal<string[]>([
    "Vela terminal. Type `help` for commands.",
  ]);

  const print = (...next: string[]) => {
    setLines((current) => [...current.slice(-199), ...next]);
  };

  const run = () => {
    const command = draft().trim();
    if (!command) return;
    setDraft("");
    print(`${cwd()} $ ${command}`);

    const [name = "", ...args] = command.split(/\s+/);
    const argument = args.join(" ");
    try {
      switch (name) {
        case "help":
          print(
            "help · pwd · ls [path] · cd <path> · cat <file> · mkdir <dir> · touch <file> · rm <path> · echo <text> · clear",
          );
          break;
        case "pwd":
          print(cwd());
          break;
        case "ls": {
          const target = argument ? resolvePath(cwd(), argument) : cwd();
          print(vfs.list(target).map((entry) => `${entry.kind === "dir" ? "▸" : "·"} ${entry.name}`).join("\n") || "(empty)");
          break;
        }
        case "cd": {
          const target = argument ? resolvePath(cwd(), argument) : "/";
          vfs.list(target);
          setCwd(target);
          break;
        }
        case "cat":
          if (!argument) throw new Error("Usage: cat <file>");
          print(vfs.read(resolvePath(cwd(), argument)));
          break;
        case "mkdir":
          if (!argument) throw new Error("Usage: mkdir <dir>");
          vfs.mkdir(resolvePath(cwd(), argument));
          print(`created ${resolvePath(cwd(), argument)}`);
          break;
        case "touch":
          if (!argument) throw new Error("Usage: touch <file>");
          vfs.write(resolvePath(cwd(), argument), "");
          print(`created ${resolvePath(cwd(), argument)}`);
          break;
        case "rm":
          if (!argument) throw new Error("Usage: rm <path>");
          vfs.remove(resolvePath(cwd(), argument));
          print(`removed ${resolvePath(cwd(), argument)}`);
          break;
        case "echo":
          print(argument);
          break;
        case "clear":
          setLines([]);
          break;
        default:
          print(`command not found: ${name}`);
      }
    } catch (error) {
      print(error instanceof Error ? error.message : String(error));
    }
    void vfs.flush?.();
  };

  return (
    <Stack gap={10}>
      <Row gap={8}>
        <Label muted>{cwd()}</Label>
      </Row>
      <pre class="vela-terminal-output">{lines().join("\n")}</pre>
      <Row gap={8}>
        <Input
          aria-label="Terminal command"
          placeholder="Type a command…"
          value={draft()}
          onInput={(event) => setDraft(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") run();
          }}
        />
        <Button variant="primary" onClick={run}>
          Run
        </Button>
      </Row>
    </Stack>
  );
}
