import { Server, Socket } from "socket.io";
import SocketRoomManager from "./utils/roomManager";
import { FilePacket, AcknowledgePacketType } from "../types";
import logger from "../logger/logger";

export default class SocketManager extends SocketRoomManager {

  private socketIO: Server | null = null;

  private readonly ALLOWED_CONCURRENT_CONNECTIONS_PER_SESSION = 3;

  protected initialize(socketServer: Server) {
    this.socketIO = socketServer;
    this.connectSocket();
  }

  private connectSocket() {
    this.socketIO?.on("connect", (socket: Socket) => {

    logger.info("User connected: ", socket.id);

    const { uuid } = Array.isArray(socket.handshake.query) ? socket.handshake.query[0] : socket.handshake.query; // This should be created everytime!

    socket.on('create-room', (data: { fileInfo: { name: string; type: string; size: number; }, id: string }) => {
      if (!data.id) {
        return console.log("Something went wrong while creating room!");
      }
      logger.info("Room creation request received! ", data);
      this.createRoom(socket, data.id, { fileInfo: data.fileInfo, creator: socket.id });
    });

    socket.on('join-room', (data: { id: string; userId: string }) => {
      if (!data.id) {
        return logger.error("Something went wrong while joining a room!");
      }
      const currentMembers = this.getMemberCountForRoom(data.id);
      if (currentMembers == this.ALLOWED_CONCURRENT_CONNECTIONS_PER_SESSION) {
        return socket.emit("roomFull:" + data.userId, true);
      }
      if (!this.joinRoom(socket, data.id)) {
        return logger.error('Failed to join the room!');
      }
      // increase `currentMembers` count by `1` since one more user now joined the room!
      socket.to(data.id).emit(data.id + ":users", { userCount: currentMembers + 1, userId: data.userId });
    });

    socket.on("sendFile", (fileData: FilePacket) => {
      if (!fileData.isProcessing) {
        // It means the processing is done and no more file packet is pending now!
      }
      this.lockRoom(fileData.roomId); // Doing this will ensure that no other user joins in between the transmission;
      socket.to(fileData.roomId).emit("recieveFile", { ...fileData, senderId: uuid });
    });

    socket.on('acknowledge', (data: AcknowledgePacketType) => {
      // logger.info('Acknowledged packet details: ', " { pId: '", data.packetId, "' }");
      socket.to(data.roomId).emit("packet-acknowledged", data);
    });

    socket.on('deleteRoom', ({ roomId }: { roomId: string }) => {
      // In this case, the user deliberately clicked on the cancel button;
      logger.warn("Deleting room: ", roomId);
      socket.to(roomId).emit("roomInvalidated", true);
      this.purgeRoom(roomId);
    });

    // TODO: Write a function roomAudit - which would delete the unused rooms and free up memory!

    socket.on("disconnect", () => {
      this.disconnectionMonitor(socket.id, (roomId) => {
        if (this.getRoomInfo(roomId).isLocked) {
          logger.warn("The room creator left abruptly!");
          /* purge the room only in case where the room is locked (which signifies that a file transmission session is going on)
          and hence, invalidate the room and let all the connected users know! */
          this.purgeRoom(roomId);
          socket.to(roomId).emit("roomInvalidated", true);
        } else {
          logger.info("The room creator left but the transfer session is complete! (id:", socket.id, ")");
        }
      });
      logger.info("User disconnected: ", socket.id);
    });
  });
  }
}
