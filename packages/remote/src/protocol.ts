export type PatchMessage = {
  kind: "patch";
  key: string;
  value: unknown;
  batch_id?: string;
};

export type ReleaseMessage = {
  kind: "release";
  key: string;
  batch_id?: string;
};

export type BarrierMessage = {
  kind: "barrier";
  batch_id: string;
};

export type ProposeMessage = {
  kind: "propose";
  key: string;
  value: unknown;
};

export type WireMessage = PatchMessage | ReleaseMessage | BarrierMessage | ProposeMessage;

/**
 * Transport contract, kept from Citrine::Remote's Wire.
 *
 * Implementations own exactly one message listener and one close listener.
 * Messages must preserve order; a barrier only commits the batch it names.
 */
export interface Wire {
  send(message: WireMessage): void;
  onMessage(listener: (message: WireMessage) => void): void;
  onClose(listener: () => void): void;
  close?(): void;
}
