import { Server, Socket } from "socket.io";

const express = require("express");
const app = express();
const cors = require('cors');
const http = require("http");
const path = require("path");

app.use(cors());
app.use(express.urlencoded());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

interface filePacket {
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


class FileSharerServer {

  httpServer: any;

  socketIO: Server;

  rooms: { [props: string]: { usersList: Socket[]; fileInfo: { name: string; type: string; size: number }; creationTime: number }; };

  dataCacheQueue: { [props: string]: filePacket };

  private readonly ALLOWED_CONCURRENT_CONNECTIONS = 3;

  private readonly CLEAN_UP_DURATION = 1000 * 60 * 30; // this is in milliseconds - hence the current total is 30mins;

  private readonly PORT = process.env.PORT || 3005;

  roomCreators: { [props: string]: string };

  roomCleanerInterval: NodeJS.Timer | null;

  constructor() {
    this.rooms = {};
    this.httpServer = http.createServer(app);
    this.socketIO = new Server(this.httpServer, {
      cors: {
        origin: "*",
        methods: ["GET", "POST"]
      }
    });
    this.dataCacheQueue = {};
    this.roomCreators = {}; // maintaining this object, so as to delete the room in case the room creator left;
    this.roomCleanerInterval = null;
    this.registerRoutes();
    this.connectSocket();
    // this.initateRoomCleanUpLoop();
  }

  private initateRoomCleanUpLoop() { // Ideally, this shouldn't be used!
    return;
    // console.log("Initiating the room cleanUp loop!");
    // this.roomCleanerInterval = setInterval(() => {
    //   console.log("Executed the room cleanUp loop!");
    //   const roomIds = Object.keys(this.rooms);
    //   if (roomIds.length === 0) {
    //     clearInterval((this.roomCleanerInterval as NodeJS.Timer));
    //     console.log("Halting the room cleanUp loop due to absence of any room!");
    //     this.roomCleanerInterval = null;
    //   }
    //   roomIds.forEach((roomId: string) => {
    //     if (Math.round((Date.now() - this.rooms[roomId].creationTime) / 1000 * 60) >= 30) {
    //       delete this.rooms[roomId];
    //     }
    //   });
    // }, this.CLEAN_UP_DURATION);
  }

  private deleteAllRoomParticipants(roomId: string) {
    this.rooms[roomId].usersList.forEach((socket: { leave: (arg0: string) => void; }) => {
      socket.leave(roomId);
    });
    delete this.rooms[roomId];
  }

  registerRoutes() {
    app.get("/", (req: any, res: any) => {
      res.sendFile(path.join(__dirname, "./index.html"));
    });

    app.post("/isValidRoom", (req: any, res: any) => {
      const { roomId } = req.body;
      console.log("roomValidationCheck: ", roomId);
      res.json({ status: (roomId in this.rooms), fileInfo: this.rooms[roomId]?.fileInfo ?? {} });
    });
  }

  connectSocket() {
    this.socketIO.on("connect", (socket) => {
      console.log("User connected: ", socket.id);
      if (this.roomCleanerInterval === null) {
        // The loop could've been halted due to absence of any rooms!
        // this.initateRoomCleanUpLoop();
      }
      socket.on('create-room', (data) => {
        console.log('Create Room: ', data);
        if (!data.id) return console.log("Something went wrong while creating room!");
        this.roomCreators[socket.id] = data.id;
        this.rooms[data.id] = { usersList: [], fileInfo: { ...data.fileInfo }, creationTime: Date.now() };
        socket.join(data.id);
      });
      socket.on('join-room', (data) => {
        console.log("Join Room: ", data);
        if (!data.id) return console.log("Something went wrong while joining a room!");
        if (!this.rooms[data.id]) {
          return console.error('the room does not exist!');
        }
        if (this.rooms[data.id].usersList.length == this.ALLOWED_CONCURRENT_CONNECTIONS) {
          return socket.emit("roomFull:" + data.userId, true);
        }
        this.rooms[data.id].usersList.push(socket);
        socket.join(data.id);
        socket.to(data.id).emit(data.id + ":users", { userCount: this.rooms[data.id].usersList.length, userId: data.userId });
      });
      socket.on("sendFile", (fileData: filePacket) => { // send this too { roomId };
        // console.log("Send File: ", fileData);
        // this.dataCacheQueue[this.internalUtil.getKey(socket.id, fileData.roomId, fileData.packetId)] = fileData;
        socket.to(fileData.roomId).emit("recieveFile", fileData);
      });
      socket.on('acknowledge', (data) => {
        console.log('acknowledged: ', data);
        const { roomId } = data;
        delete data.roomId;
        // delete this.dataCacheQueue[this.internalUtil.getKey(socket.id, data.roomId, data.packetId)]; // delete the acknowledged campaign from the queue;
        socket.to(roomId).emit("packet-acknowledged", data);
      });
      socket.on('deleteRoom', ({ roomId }) => {
        // In this case, the user deliberately clicked on the cancel button;
        console.log("Deleting room: ", roomId);
        socket.to(roomId).emit("roomInvalidated", true);
        this.deleteAllRoomParticipants(roomId);
      });
      socket.on("disconnect", () => {
        if (this.roomCreators[socket.id]) {
          // In this case, the user might have exited the page;
          const roomId = this.roomCreators[socket.id];
          if (this.rooms[roomId]) {
            socket.to(roomId).emit("roomInvalidated", true);
            this.deleteAllRoomParticipants.call(this, roomId);
          }
          delete this.roomCreators[socket.id];
        }
        console.log("User disconnected: ", socket.id);
      });
    });
  }

  run() {
    this.httpServer.listen(this.PORT, () => {
      console.log(`Server is running at PORT:`, this.PORT);
    });
  }
}

new FileSharerServer().run();

