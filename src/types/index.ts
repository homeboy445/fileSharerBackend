
export type GenericObject = { [props: string]: any };

export interface FilePacket {
    fileChunkArrayBuffer: ArrayBuffer,
    packetId: number,
    isProcessing: boolean,
    totalPackets: number,
    chunkSize: number,
    fileName: string,
    fileType: string,
    uniqueID: string,
    percentageCompleted: number,
    roomId: string
};

export interface AcknowledgePacketType {
    roomId: string,
    percentage: number,
    packetId: number,
    userId: string,
    senderId: string
};

