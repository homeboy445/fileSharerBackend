import { Server } from "socket.io";

const express = require("express");
const app = express();
const cors = require('cors');
const http = require("http");
const path = require("path");

app.use(cors());
app.use(express.urlencoded());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

class FileSharerServer {

  httpServer: any;

  socketIO: Server;

  rooms: { [props: string]: { userCount: number; fileInfo: { name: string; type: string; size: number } } };

  private readonly PORT = process.env.PORT || 3005;

  constructor() {
    this.rooms = {};
    this.httpServer = http.createServer(app);
    this.socketIO = new Server(this.httpServer, {
      cors: {
        origin: "*",
        methods: ["GET", "POST"]
      }
    });
    this.registerRoutes();
    this.connectSocket();
  }

  registerRoutes() {
    app.get("/", (req: any, res: any) => {
      res.sendFile(path.join(__dirname, "./index.html"));
    });

    app.post("/isValidRoom", (req: any, res: any) => {
      const { roomId } = req.body;
      console.log("roomValidationCheck: ", roomId, " ", this.rooms);
      res.json({ status: roomId in this.rooms, fileInfo: this.rooms[roomId]?.fileInfo ?? {} });
    });
  }

  connectSocket() {
    this.socketIO.on("connect", (socket) => {
      console.log("User connected!");
      socket.on('create-room', (data) => {
        console.log('Create Room: ', data);
        if (!data.id) return console.log("Something went wrong while creating room!");
        this.rooms[data.id] = { userCount: 0, fileInfo: { ...data.fileInfo } };
        socket.join(data.id);
      }); // TODO: Create a concept of assigning a Uid to each user;
      socket.on('join-room', (data) => {
        console.log("Join Room: ", data);
        if (!data.id) return console.log("Something went wrong while joining a room!");
        if (!this.rooms[data.id]) {
          return console.error('the room does not exist!');
        }
        this.rooms[data.id].userCount += 1;
        socket.join(data.id);
        socket.to(data.id).emit(data.id + ":users", { userCount: this.rooms[data.id].userCount, userId: data.userId });
      });
      socket.on("testing", (data) => {
        console.log("Percentage: ", data);
        // socket.to(data.roomId).emit("filePercentage", data.percentage);
      });
      socket.on("sendFile", (fileData) => { // send this too { roomId };
        // console.log("Send File: ", fileData);
        socket.to(fileData.roomId).emit("recieveFile", fileData);
      });
      socket.on('acknowledge', (data) => {
        console.log('acknowledged: ', data);
        const { roomId } = data;
        delete data.roomId;
        socket.to(roomId).emit("packet-acknowledged", data);
      })
      socket.on('deleteRoom', ({ roomId }) => {
        // console.log("Deleting room: ", roomId);
        socket.to(roomId).emit("roomInvalidated", true);
        socket.leave(roomId);
      });
      socket.on("disconnect", () => {
        console.log("User disconnected!");
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
