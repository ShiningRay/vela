import { RemoteSession, WsWire } from "@vela/remote";

export interface Task {
  id: string;
  title: string;
  done: boolean;
}

export interface ServiceStatus {
  state: "starting" | "ready";
  connections: number;
  uptimeSec: number;
  pid: number;
}

export const SERVICE_URL = "ws://127.0.0.1:4317";

export const serviceWire = new WsWire(SERVICE_URL);
export const serviceSession = new RemoteSession(serviceWire);
