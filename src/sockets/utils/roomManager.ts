import { Socket } from "socket.io";
import { roomInfo, FileInfo } from "../../types";
import logger from "../../logger/logger";

export default class SocketRoomManager {
  
    private rooms: { [roomId: string]: roomInfo } = {};

    private roomCreators: Map<string, string> = new Map();

    private getRoomMembers = (roomId: string) => {
        return Object.values(this.rooms[roomId].members);
    };

    private deleteRoomMember = (roomId: string, socketId: string): boolean => {
        if (this.rooms[roomId].members[socketId]) {
            delete this.rooms[roomId].members[socketId];
            return true;
        } else {
            return false;
        }
    }

    protected getRoomInfo(roomId: string): { invalid?: boolean, fileInfo?: FileInfo, isLocked?: boolean } {
        if (!this.rooms[roomId] || this.rooms[roomId].locked) {
            return { invalid: false };
        }
        return { fileInfo: this.rooms[roomId].fileInfo, isLocked: this.rooms[roomId].locked };
    }

    /**
     * This returns if an already existing user is trying to join in again.
     * @param socket - Socket Instance
     * @param roomId - string
     * @returns boolean
     */
    private isRejoinAttempt(socket: Socket, roomId: string): boolean {
        let isUserAlreadyInsideTheRoom = false;
        this.getRoomMembers(roomId).forEach((memberSocket) => { // This method's intension is to track if a user is trying to re-join the file transfer session using the old UUID;
            if (memberSocket.handshake.query.uuid === socket.handshake.query.uuid) {
                isUserAlreadyInsideTheRoom = true;
            }
        });
        if (isUserAlreadyInsideTheRoom) {
            logger.info("A user is trying to rejoin whilst still being inside the room!");
        }
        return isUserAlreadyInsideTheRoom;
    }
  
    protected createRoom(socket: Socket, roomId: string, { creator, fileInfo }: { creator: string, fileInfo: FileInfo }): void {
      this.rooms[roomId] = { fileInfo: fileInfo, members: {}, locked: false };
      this.roomCreators.set(creator, roomId);
      socket.join(roomId);
    }
  
    protected joinRoom(socket: Socket, roomId: string): boolean {
      if (!this.rooms[roomId] || this.isRejoinAttempt(socket, roomId) || this.rooms[roomId].locked) {
        if (this.rooms[roomId].locked) {
            logger.warn("User's trying to join a file transfer session in progress...");
        }
        return false;
      }
      this.rooms[roomId].members[socket.id] = socket;
      socket.join(roomId);
      return true;
    }

    protected lockRoom(roomId: string) {
        this.rooms[roomId].locked = true;
    }

    protected getMemberCountForRoom(roomId: string): number {
        if (!this.rooms[roomId]) {
            return 0;
        }
        return Object.keys(this.rooms[roomId].members).length;
    }
  
    protected purgeRoom(roomId: string): void {
      logger.warn("purging room!");
      this.getRoomMembers(roomId).forEach((socket) => {
        socket.leave(roomId);
      });
      delete this.rooms[roomId];
    }

    /**
     * This method monitors the Ids of all the members of the socket, and will
     * destroy a currently alive room in case its creator left or all of its members left.
     * Note: This method accepts a callback which will be called in case the room creator left.
     * @param userId - string (socketId)
     * @param callback - Function
     */
    disconnectionMonitor(userId: string, callback: (roomId: string) => void): void {
        let roomId;
        if ((roomId = this.roomCreators.get(userId))) {
            callback(roomId);
            this.roomCreators.delete(userId);
        }
    }
}
