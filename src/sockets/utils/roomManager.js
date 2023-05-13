"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const logger_1 = __importDefault(require("../../logger/logger"));
class SocketRoomManager {
    constructor() {
        this.rooms = {};
        this.roomCreators = new Map();
        this.deleteRoomMember = (roomId, socketId) => {
            if (this.rooms[roomId] && this.rooms[roomId].members[socketId]) {
                delete this.rooms[roomId].members[socketId];
                return true;
            }
            else {
                return false;
            }
        };
        this.getRoomMembers = (roomId) => {
            if (!this.rooms[roomId]) {
                return [];
            }
            return Object.values(this.rooms[roomId].members);
        };
    }
    /**
     * This returns if an already existing user is trying to join in again.
     * @param socket - Socket Instance
     * @param roomId - string
     * @returns boolean
     */
    isRejoinAttempt(socket, roomId) {
        let isUserAlreadyInsideTheRoom = false;
        this.getRoomMembers(roomId).forEach((memberSocket) => {
            if (memberSocket.handshake.query.uuid === socket.handshake.query.uuid) {
                isUserAlreadyInsideTheRoom = true;
            }
        });
        if (isUserAlreadyInsideTheRoom) {
            logger_1.default.warn("A user is trying to rejoin whilst still being inside the room!");
        }
        return isUserAlreadyInsideTheRoom;
    }
    getRoomInfo(roomId) {
        if (!this.rooms[roomId] || this.rooms[roomId].locked) {
            return { invalid: false };
        }
        return { fileInfo: this.rooms[roomId].fileInfo, isLocked: this.rooms[roomId].locked };
    }
    createRoom(socket, roomId, { creator, fileInfo }) {
        if (this.rooms[roomId]) {
            return logger_1.default.warn("A user trying to create the room with the same UUID!");
        }
        this.rooms[roomId] = { fileInfo: fileInfo, members: {}, locked: false };
        this.roomCreators.set(creator, roomId);
        socket.join(roomId);
    }
    joinRoom(socket, roomId) {
        if (!this.rooms[roomId] || this.isRejoinAttempt(socket, roomId) || this.rooms[roomId].locked) {
            try {
                if (this.rooms[roomId].locked) {
                    logger_1.default.warn("User's trying to join a file transfer session in progress...");
                }
            }
            catch (e) {
                logger_1.default.error("~~ ROOM DOENS'T EXIST IT SEEMS ", this.rooms[roomId], " ", roomId);
            }
            return false;
        }
        this.rooms[roomId].members[socket.id] = socket;
        socket.join(roomId);
        return true;
    }
    lockRoom(roomId) {
        if (this.rooms[roomId].locked) {
            return;
        }
        this.rooms[roomId].locked = true;
    }
    unlockRoom(roomId) {
        this.rooms[roomId].locked = false;
    }
    purgeRoom(roomId) {
        logger_1.default.warn("purging room!");
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
    disconnectionMonitor(userId, callback) {
        let roomId;
        if ((roomId = this.roomCreators.get(userId))) {
            callback(roomId);
            this.roomCreators.delete(userId);
        }
    }
}
exports.default = SocketRoomManager;
