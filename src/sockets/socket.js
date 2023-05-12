"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const roomManager_1 = __importDefault(require("./utils/roomManager"));
const logger_1 = __importDefault(require("../logger/logger"));
class SocketManager extends roomManager_1.default {
    constructor() {
        super(...arguments);
        this.socketIO = null;
        this.ALLOWED_CONCURRENT_CONNECTIONS_PER_SESSION = 3;
    }
    initialize(socketServer) {
        this.socketIO = socketServer;
        this.connectSocket();
    }
    connectSocket() {
        var _a;
        (_a = this.socketIO) === null || _a === void 0 ? void 0 : _a.on("connect", (socket) => {
            logger_1.default.info("User connected: ", socket.id);
            const { uuid } = Array.isArray(socket.handshake.query) ? socket.handshake.query[0] : socket.handshake.query; // This should be created everytime!
            socket.on('create-room', (data) => {
                if (!data.id) {
                    return console.log("Something went wrong while creating room!");
                }
                logger_1.default.info("Room creation request received! ", data);
                this.createRoom(socket, data.id, { fileInfo: data.fileInfo, creator: socket.id });
            });
            socket.on('join-room', (data) => {
                if (!data.id) {
                    return logger_1.default.error("Something went wrong while joining a room!");
                }
                const currentMembers = this.getMemberCountForRoom(data.id);
                if (currentMembers == this.ALLOWED_CONCURRENT_CONNECTIONS_PER_SESSION) {
                    return socket.emit("roomFull:" + data.userId, true);
                }
                if (!this.joinRoom(socket, data.id)) {
                    return logger_1.default.error('Failed to join the room!');
                }
                // increase `currentMembers` count by `1` since one more user now joined the room!
                socket.to(data.id).emit(data.id + ":users", { userCount: currentMembers + 1, userId: data.userId });
            });
            socket.on("sendFile", (fileData) => {
                if (!fileData.isProcessing) {
                    // It means the processing is done and no more file packet is pending now!
                }
                this.lockRoom(fileData.roomId); // Doing this will ensure that no other user joins in between the transmission;
                socket.to(fileData.roomId).emit("recieveFile", Object.assign(Object.assign({}, fileData), { senderId: uuid }));
            });
            socket.on('acknowledge', (data) => {
                logger_1.default.info('Acknowledged packet details: ', " { pId: '", data.packetId, "' }");
                socket.to(data.roomId).emit("packet-acknowledged", data);
            });
            socket.on('deleteRoom', ({ roomId }) => {
                // In this case, the user deliberately clicked on the cancel button;
                logger_1.default.warn("Deleting room: ", roomId);
                socket.to(roomId).emit("roomInvalidated", true);
                this.purgeRoom(roomId);
            });
            // TODO: Write a function roomAudit - which would delete the unused rooms and free up memory!
            socket.on("disconnect", () => {
                this.disconnectionMonitor(socket.id, (roomId) => {
                    socket.to(roomId).emit("roomInvalidated", true);
                    if (this.getRoomInfo(roomId).isLocked) {
                        logger_1.default.warn("The room creator left abruptly!");
                        /* purge the room only in case where the room is locked (which signifies that an ongoing file transmission session is going on)
                        and hence, invalidate the room and let all the connected users know! */
                        this.purgeRoom(roomId);
                    }
                    else {
                        logger_1.default.info("The room creator left but the transfer session is complete!");
                    }
                });
                console.log("User disconnected: ", socket.id);
            });
        });
    }
}
exports.default = SocketManager;
