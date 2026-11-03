import { For, Show, type JSX } from "solid-js";
import { Button, Dialog, Label, Row, Stack } from "@vela/ui";
import { describePermission } from "./agent-manifest";
import type { VpkPackage } from "./packages";

export interface AgentConsentDialogProps {
  pkg: VpkPackage;
  onConfirm: () => void;
  onReject: () => void;
}

/**
 * The install-time permission gate: shown before any VFS write happens for
 * packages that declare an `agent` section with permissions. Denying aborts
 * the whole install — there is no partial installation.
 */
export function AgentConsentDialog(props: AgentConsentDialogProps): JSX.Element {
  const permissions = props.pkg.manifest.permissions ?? [];
  const toolNames = props.pkg.manifest.agent?.tools ?? [];

  return (
    <Dialog
      open
      title={`Grant permissions to ${props.pkg.manifest.name}?`}
      onClose={props.onReject}
      footer={
        <Row gap={8}>
          <Button variant="ghost" onClick={props.onReject}>
            Deny
          </Button>
          <Button variant="primary" data-testid="agent-consent-accept" onClick={props.onConfirm}>
            Grant and install
          </Button>
        </Row>
      }
    >
      <Stack gap={8}>
        <Label muted>
          {props.pkg.manifest.name} {props.pkg.manifest.version} requests the following agent
          capabilities. Nothing is installed until you grant them.
        </Label>
        <ul class="vela-agent-consent__list" aria-label="Requested permissions">
          <For each={permissions}>
            {(permission) => (
              <li class="vela-agent-consent__item" data-permission={permission}>
                {describePermission(permission)}
              </li>
            )}
          </For>
        </ul>
        <Show when={toolNames.length > 0}>
          <Label muted>
            Agent tools: {toolNames.map((tool) => `${props.pkg.manifest.id}.${tool.name}`).join(", ")}
          </Label>
        </Show>
      </Stack>
    </Dialog>
  );
}
