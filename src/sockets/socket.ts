import { Server, Socket } from "socket.io";
import SocketRoomManager from "./utils/roomManager";
import { FilePacket, AcknowledgePacketType, GenericObject } from "../types";
import logger from "../logger/logger";

export default class SocketManager extends SocketRoomManager {

  private socketIO: Server | null = null;

  /**
   * This object is supposed to only store the sessionId as its key and
   * the roomId as the value.
   */
  private globalUserSocketStore = new Proxy(({} as GenericObject), {
    get: (target, key) => {
      return target[key];
    },
    set: (target, key, value) => {
      target[key] = value;
      return true;
    },
    deleteProperty: (target, key) => { // key here is socketId;
      const roomId = target[key];
      if (roomId) {
        this.deleteRoomMember(roomId, (key as string));
        this.socketIO?.to(roomId).emit(roomId + ":users", { userCount: this.getRoomMembers(roomId).length });
      } else {
        logger.warn("RoomId wasn't available while deleting the socketId from global Store!");
      }
      delete target[key];
      return true;
    }
  })

  private readonly ALLOWED_CONCURRENT_CONNECTIONS_PER_SESSION = 3;

  protected initialize(socketServer: Server) {
    this.socketIO = socketServer;
    this.connectSocket();
  }

  private connectSocket() {
    this.socketIO?.on("connect", (socket: Socket) => {

    logger.info("User connected: ", socket.id);

    this.globalUserSocketStore[socket.id] = "";

    const { uuid } = Array.isArray(socket.handshake.query) ? socket.handshake.query[0] : socket.handshake.query; // This should be created everytime!

    socket.on('create-room', (data: { fileInfo: { name: string; type: string; size: number; }, id: string }) => {
      if (!data.id) { // `data.id` is the roomId;
        return logger.error("Room Id wasn't provided while creating room!");
      }
      logger.info("Room creation request received! ", data);
      this.createRoom(socket, data.id, { fileInfo: data.fileInfo, creator: socket.id });
      this.globalUserSocketStore[socket.id] = data.id;
    });

    socket.on('join-room', (data: { id: string; userId: string }) => {
      if (!data.id) {
        return logger.error("Something went wrong while joining a room!");
      }
      const currentMembers = this.getRoomMembers(data.id).length;
      if (currentMembers == this.ALLOWED_CONCURRENT_CONNECTIONS_PER_SESSION) {
        return socket.emit("roomFull:" + data.userId, true);
      }
      if (!this.joinRoom(socket, data.id)) {
        socket.emit("error", { message: "Couldn't join the session!" });
        return logger.error('Failed to join the room!');
      }
      this.globalUserSocketStore[socket.id] = data.id;
      // increase `currentMembers` count by `1` since one more user now joined the room!
      socket.to(data.id).emit(data.id + ":users", { userCount: currentMembers + 1, userId: data.userId });
    });

    socket.on("sendFile", (fileData: FilePacket) => {
      if (!fileData.isProcessing) {
        // It means the processing is done and no more file packet is pending now!
        this.unlockRoom(fileData.roomId);
      } else {
        this.lockRoom(fileData.roomId); // Doing this will ensure that no other user joins in between the transmission;
      }
      socket.to(fileData.roomId).emit("recieveFile", { ...fileData, senderId: uuid });
    });

    socket.on('acknowledge', (data: AcknowledgePacketType) => {
      // logger.info('Acknowledged packet details: ', " { pId: '", data.packetId, "' }");
      socket.to(data.roomId).emit("packet-acknowledged", data);
    });

    socket.on('deleteRoom', ({ roomId }: { roomId: string }) => {
      // In this case, the user deliberately clicked on the cancel button;
      logger.warn("Deleting room: ", roomId);
      // socket.to(roomId).emit("roomInvalidated", { message: "File transfer complete!" });
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
          socket.to(roomId).emit("roomInvalidated", { message: "Sender aborted the file Transfer!" });
        } else {
          logger.info("The room creator left but the transfer session is complete! (id:", socket.id, ")");
        }
      });
      delete this.globalUserSocketStore[socket.id];
      logger.info("User disconnected: ", socket.id);
    });
  });
  }
}
