import { Socket } from "socket.io";

export type GenericObject = { [props: string | number | symbol]: any };

export interface FilePacket {
  fileChunkArrayBuffer: ArrayBuffer;
  packetId: number;
  isProcessing: boolean;
  totalPackets: number;
  chunkSize: number;
  fileName: string;
  fileType: string;
  uniqueID: string;
  percentageCompleted: number;
  roomId: string;
}

export interface AcknowledgePacketType {
  roomId: string;
  percentage: number;
  packetId: number;
  userId: string;
  senderId: string;
}

export interface FileInfo {
  name: string;
  type: string;
  size: number;
}

export type roomInfo = { members: { [socketId: string]: Socket }, filesInfo: FileInfo[], locked: boolean };
