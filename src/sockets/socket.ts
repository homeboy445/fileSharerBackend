import { Server, Socket } from "socket.io";
import SocketRoomManager from "./utils/roomManager";
import { FilePacket, AcknowledgePacketType, FileInfo, GenericObject } from "../types";
import logger from "../logger/logger";

export default class SocketManager extends SocketRoomManager {

  private socketIO: Server | null = null;

  /**
   * This object is supposed to only store the sessionId (socket.id) as its key and
   * the an object which would consist of `roomId` & `userId` as the value.
   */
  private globalUserSocketStore = new Proxy(({} as { [socketId: string | symbol]: { roomId: string, userId: string } }), {
    get: (target, key) => {
      return target[key];
    },
    set: (target, key, value) => {
      target[key] = value;
      return true;
    },
    deleteProperty: (target, key: string) => { // key here is socketId;
      const { roomId, userId } = target[key];
      if (roomId) {
        this.deleteRoomMember(roomId, key);
        this.socketIO?.to(roomId).emit(roomId + ":users", { userCount: this.getRoomMembers(roomId).length, userId, userLeft: true  });
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

    const { uuid } = Array.isArray(socket.handshake.query) ? socket.handshake.query[0] : socket.handshake.query; // This should be created everytime!

    this.globalUserSocketStore[socket.id] = { roomId: "", userId: uuid };

    socket.on('create-room', (data: { filesInfo: FileInfo[], id: string }) => {
      if (!data.id) { // `data.id` is the roomId;
        return logger.error("Room Id wasn't provided while creating room!");
      }
      logger.info("Room creation request received! ", socket.id);
      this.createRoom(socket, data.id, { filesInfo: data.filesInfo, creator: socket.id });
      this.globalUserSocketStore[socket.id].roomId = data.id;
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
      this.globalUserSocketStore[socket.id].roomId = data.id;
      this.globalUserSocketStore[socket.id].userId = data.userId; // This might be redundant since we're sending the UUID while initializing the socket session anywaY - check on FE as well!
      // increase `currentMembers` count by `1` since one more user now joined the room!
      socket.to(data.id).emit(data.id + ":users", { userCount: currentMembers + 1, userId: data.userId });
    });

    socket.on("sendFile", (fileData: FilePacket) => {
      if (!fileData.isProcessing) {
        logger.info("File transfer is complete!");
        // It means the processing is done and no more file packet is pending now!
        this.unlockRoom(fileData.roomId);
      } else {
        this.lockRoom(fileData.roomId); // Doing this will ensure that no other user joins in between the transmission;
      }
      // logger.info("packet id received for data: ", JSON.stringify({ pId: fileData.packetId, percentage: fileData.percentageCompleted }));
      socket.to(fileData.roomId).emit("recieveFile", { ...fileData, senderId: uuid });
    });

    socket.on('acknowledge', (data: AcknowledgePacketType) => {
      // logger.info('Acknowledged packet details: ', JSON.stringify({ pId: data.packetId, percentage: data.percentage }));
      socket.to(data.roomId).emit("packet-acknowledged", data);
    });

    socket.on('deleteRoom', ({ roomId, info }: { roomId: string, info: GenericObject }) => {
      // In this case, the user deliberately clicked on the cancel button;
      logger.warn("Deleting room on request!");
      socket.to(roomId).emit("roomInvalidated", info || {});
      this.purgeRoom(roomId);
    });

    // TODO: Write a function roomAudit - which would delete the unused rooms and free up memory!

    socket.on("disconnect", (reason) => {
      this.disconnectionMonitor(socket.id, (roomId) => {
        if (this.isRoomLocked(roomId)) {
          logger.warn("The room creator left abruptly!");
          /* purge the room only in case where the room is locked (which signifies that a file transmission session was going on)
          and hence, invalidate the room and let all the connected users know! */
          socket.to(roomId).emit("roomInvalidated", { message: "Sender aborted the file Transfer!" });
          this.purgeRoom(roomId);
        } else {
          logger.info("The room creator left but the transfer session is complete!");
        }
      });
      delete this.globalUserSocketStore[socket.id];
      logger.info("User disconnected: ", socket.id, " REASON: ", reason);
    });
  });
  }
}
