import { Server, Socket } from "socket.io";
import { FilePacket, AcknowledgePacketType } from "./types";

import express from "express";
const app = express();
import cors from 'cors';
import http from "http";
import path from "path";

app.use(cors());
app.use(express.urlencoded());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

class FileSharerServer {

  httpServer: any;

  socketIO: Server;

  rooms: { [props: string]: { usersList: Socket[]; fileInfo: { name: string; type: string; size: number }; creationTime: number }; };

  dataCacheQueue: { [props: string]: { [packetId: string]: FilePacket } };

  private readonly ALLOWED_CONCURRENT_CONNECTIONS = 3;

  private readonly CLEAN_UP_DURATION = 1000 * 60 * 30; // this is in milliseconds - hence the current total is 30mins;

  private readonly PORT = process.env.PORT || 3005;

  roomCreators: { [props: string]: string };

  roomCleanerInterval: NodeJS.Timer | null;

  setTimeoutVar: null | NodeJS.Timer = null;

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
  }

  private deleteAllRoomParticipants(roomId: string) {
    this.rooms[roomId].usersList.forEach((socket: { leave: (arg0: string) => void; }) => {
      socket.leave(roomId);
    });
    delete this.rooms[roomId];
  }

  private sendPendingPackets({ socket, uuid }: { socket: Socket; uuid?: string }) {
    if (uuid && this.dataCacheQueue[uuid]) {
      console.log("Sending pending packages...");
      Object.keys(this.dataCacheQueue[uuid]).forEach((packetId) => {
        const packet = this.dataCacheQueue[uuid][packetId];
        return socket.to(packet.roomId).emit("recieveFile", packet);
      });
      delete this.dataCacheQueue[uuid];
    }
  }

  private storePacketsTemporarily(uuid: string, packet: FilePacket) {
    if (uuid.startsWith("guest")) {
      return;
    }
    this.dataCacheQueue[uuid] = this.dataCacheQueue[uuid] || {};
    this.dataCacheQueue[uuid][`${packet.roomId}|${packet.packetId}`] = packet;
    if (this.setTimeoutVar) {
      clearTimeout(this.setTimeoutVar);
    }
    this.setTimeoutVar = setTimeout(() => { // Delete the pending packages after 1Min of inActivity!
      delete this.dataCacheQueue[uuid];
    }, 1000 * 60 * 60);
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
    this.socketIO.on("connect", (socket: Socket) => {
      console.log("User connected: ", socket.id, " ", socket.handshake.query);

      const { uuid } = socket.handshake.query || { uuid: "guest" + Math.round(Math.random() * 1000) };

      this.sendPendingPackets({ socket, uuid: (uuid as string) });

      socket.on('create-room', (data: { fileInfo: { name: string; type: string; size: number; }, id: string }) => {
        console.log('Create Room: ', data);
        if (!data.id) return console.log("Something went wrong while creating room!");
        this.roomCreators[socket.id] = data.id;
        this.rooms[data.id] = { usersList: [], fileInfo: { ...data.fileInfo }, creationTime: Date.now() };
        socket.join(data.id);
      });

      socket.on('join-room', (data: { id: string; userId: string }) => {
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

      socket.on("sendFile", (fileData: FilePacket) => {
        this.storePacketsTemporarily((uuid as string), fileData); // FIXME: add explicit type instead of `string`!
        socket.to(fileData.roomId).emit("recieveFile", { ...fileData, senderId: uuid });
      });

      socket.on('acknowledge', (data: AcknowledgePacketType) => {
        console.log('acknowledged: ', data);
        const { roomId } = data;
        delete (data as any).roomId;
        delete this.dataCacheQueue[data.senderId][`${roomId}|${data.packetId}`]; // delete the acknowledged packet from the queue;
        socket.to(roomId).emit("packet-acknowledged", data);
      });

      socket.on('deleteRoom', ({ roomId }: { roomId: string }) => {
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
